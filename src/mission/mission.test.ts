import { describe, expect, it } from 'vitest';
import medium from '../../public/levels/medium.json';
import small from '../../public/levels/small.json';
import { AWARENESS, HEALTH, KNIFE, REVIVE } from '../config/tunables';
import { Rng } from '../core/rng';
import { InputState } from '../input/input-state';
import { levelFromJson as loadJson } from '../level/loader';
import { Mission, type ViewLens } from './mission';
import { NO_MODIFIERS } from './modifiers';

const DT = 1 / 60;
const LENS: ViewLens = { vFov: (70 * Math.PI) / 180, aspect: 16 / 9 };

function run(m: Mission, input: InputState, seconds: number): void {
  for (let t = 0; t < seconds; t += DT) m.step(DT, input, LENS);
}

function teleport(m: Mission, x: number, z: number): void {
  m.player.pos.x = m.player.prevPos.x = x;
  m.player.pos.z = m.player.prevPos.z = z;
}

describe('Mission', () => {
  it('runs both greybox levels headless', () => {
    for (const json of [small, medium]) {
      const m = new Mission(loadJson(json), new Rng(1));
      const start = m.guards.guards.map((g) => ({ ...g.pos }));
      run(m, new InputState(), 5);
      expect(m.time).toBeCloseTo(5, 1);
      // Patrolling guards have moved off their spawns.
      const moved = m.guards.guards.some(
        (g, i) => Math.hypot(g.pos.x - start[i]!.x, g.pos.z - start[i]!.z) > 0.5,
      );
      expect(moved).toBe(true);
    }
  });

  it('is deterministic for a seed, so a restart replays the same patrols', () => {
    const a = new Mission(loadJson(medium), new Rng(7));
    const b = new Mission(loadJson(medium), new Rng(7));
    run(a, new InputState(), 3);
    run(b, new InputState(), 3);
    expect(a.guards.guards.map((g) => g.pos)).toEqual(b.guards.guards.map((g) => g.pos));
  });

  it('knifes a guard from behind, then locks movement briefly', () => {
    const m = new Mission(loadJson(small), new Rng(1));
    const g = m.guards.guards[0]!;
    teleport(m, g.pos.x + Math.sin(g.yaw) * 1, g.pos.z + Math.cos(g.yaw) * 1);
    const input = new InputState();
    m.step(DT, input, LENS);
    expect(m.knifeTarget).toBe(0);
    const kills: number[] = [];
    m.events.on('kill', (e) => kills.push(e.guard.id));
    input.context = true;
    input.moveY = 1;
    m.step(DT, input, LENS);
    expect(g.dead).toBe(true);
    expect(kills).toEqual([0]);
    expect(m.kills).toBe(1);
    expect(m.knifeTarget).toBe(-1);
    // Movement is locked for KNIFE.lockS, then comes back.
    const locked = { ...m.player.pos };
    for (let t = 0; t < KNIFE.lockS - 2 * DT; t += DT) {
      input.moveY = 1;
      m.step(DT, input, LENS);
    }
    expect(m.player.pos).toEqual(locked);
    for (let t = 0; t < 0.3; t += DT) {
      input.moveY = 1;
      m.step(DT, input, LENS);
    }
    expect(m.player.pos).not.toEqual(locked);
  });

  it('does nothing on a knife press with no valid target', () => {
    const m = new Mission(loadJson(small), new Rng(1));
    const input = new InputState();
    input.context = true;
    m.step(DT, input, LENS);
    expect(m.kills).toBe(0);
    expect(m.lockTimer).toBe(0);
  });

  it('a player standing in front of a guard gets shot; god mode keeps the HP', () => {
    for (const god of [false, true]) {
      const m = new Mission(loadJson(small), new Rng(1));
      m.godMode = god;
      const g = m.guards.guards[0]!;
      teleport(m, g.pos.x - Math.sin(g.yaw) * 2.5, g.pos.z - Math.cos(g.yaw) * 2.5);
      g.awareness.raiseTo(AWARENESS.alert, m.player.pos.x, m.player.pos.z);
      let hits = 0;
      m.events.on('hit', () => hits++);
      run(m, new InputState(), 6);
      expect(hits).toBeGreaterThan(0);
      expect(m.health.hp).toBe(god ? HEALTH.maxHp : Math.max(0, HEALTH.maxHp - hits));
      expect(m.health.damaged).toBe(!god);
    }
  });

  it('throws one bottle at a time from a limited supply', () => {
    const m = new Mission(loadJson(small), new Rng(1));
    expect(m.bottles).toBe(small.bottles);
    const shatters: number[] = [];
    m.events.on('shatter', (e) => shatters.push(e.at.y));
    const input = new InputState();
    input.throw = true;
    m.step(DT, input, LENS);
    expect(m.bottles).toBe(small.bottles - 1);
    expect(m.bottle.flying).toBe(true);
    input.throw = true; // still in flight: ignored
    m.step(DT, input, LENS);
    expect(m.bottles).toBe(small.bottles - 1);
    run(m, input, 3);
    expect(shatters).toHaveLength(1);
    for (let i = 0; i < 5; i++) {
      input.throw = true;
      m.step(DT, input, LENS);
      run(m, input, 3);
    }
    expect(m.bottles).toBe(0);
    expect(shatters).toHaveLength(small.bottles);
  });

  it('small: two silent takedowns win with three stars', () => {
    const m = new Mission(loadJson(small), new Rng(1));
    const input = new InputState();
    const ends: string[] = [];
    m.events.on('end', (e) => ends.push(e.outcome));
    expect(m.objectiveLabel).toMatch(/0\/2/);
    for (const g of m.guards.guards) {
      teleport(m, g.pos.x + Math.sin(g.yaw) * 1, g.pos.z + Math.cos(g.yaw) * 1);
      input.context = true;
      m.step(DT, input, LENS);
      expect(g.dead).toBe(true);
      run(m, input, 0.5);
    }
    expect(ends).toEqual(['won']);
    expect(m.result).toMatchObject({
      outcome: 'won',
      stats: { kills: 2, detected: false, damaged: false },
      stars: 3,
    });
    // Frozen once over.
    const t = m.time;
    run(m, input, 1);
    expect(m.time).toBe(t);
    expect(m.endedFor).toBeGreaterThan(0.9);
  });

  it('medium: the exit only counts after the intel is collected', () => {
    const level = loadJson(medium);
    const m = new Mission(level, new Rng(1));
    const input = new InputState();
    const row = level.data.tiles.findIndex((r) => r.includes('E'));
    const exit = level.grid.cellCenter(level.data.tiles[row]!.indexOf('E'), row);
    m.godMode = true; // teleporting around may walk into a guard's view
    teleport(m, exit.x, exit.z);
    run(m, input, 0.2);
    expect(m.outcome).toBeNull();
    expect(m.objectiveLabel).toMatch(/intel/);

    let picked = 0;
    m.events.on('pickup', () => picked++);
    teleport(m, m.item!.x, m.item!.z);
    run(m, input, 0.2);
    expect(picked).toBe(1);
    expect(m.objectiveLabel).toMatch(/exit/);
    teleport(m, exit.x, exit.z);
    run(m, input, 0.2);
    expect(m.outcome).toBe('won');
  });

  it('three hits fail the mission and cost the stealth and damage stars', () => {
    const m = new Mission(loadJson(small), new Rng(1));
    const g = m.guards.guards[0]!;
    teleport(m, g.pos.x - Math.sin(g.yaw) * 2.5, g.pos.z - Math.cos(g.yaw) * 2.5);
    g.awareness.raiseTo(AWARENESS.alert, m.player.pos.x, m.player.pos.z);
    run(m, new InputState(), 20);
    expect(m.health.dead).toBe(true);
    expect(m.result).toMatchObject({
      outcome: 'failed',
      stats: { detected: true, damaged: true },
    });
  });

  it('revives once after a fail: 1 HP, a safe window, guards searching, record kept', () => {
    const m = new Mission(loadJson(small), new Rng(1));
    expect(m.revive()).toBe(false); // not while playing
    const g = m.guards.guards[0]!;
    teleport(m, g.pos.x - Math.sin(g.yaw) * 2.5, g.pos.z - Math.cos(g.yaw) * 2.5);
    g.awareness.raiseTo(AWARENESS.alert, m.player.pos.x, m.player.pos.z);
    run(m, new InputState(), 20);
    expect(m.outcome).toBe('failed');
    expect(g.state).toBe('alert');

    const revived: number[] = [];
    m.events.on('revive', (e) => revived.push(e.hp));
    expect(m.revive()).toBe(true);
    expect(revived).toEqual([REVIVE.hp]);
    expect(m.outcome).toBeNull();
    expect(m.health.hp).toBe(REVIVE.hp);
    expect(g.state).toBe('search');
    expect(g.awareness.value).toBeLessThanOrEqual(AWARENESS.searchStart);

    // Hits during the invulnerability window cost nothing, even with the guard re-alerted.
    g.awareness.raiseTo(AWARENESS.alert, m.player.pos.x, m.player.pos.z);
    run(m, new InputState(), REVIVE.invulnS - 0.1);
    expect(m.health.hp).toBe(REVIVE.hp);

    // The second death is final, and the record still shows the first.
    run(m, new InputState(), 20);
    expect(m.outcome).toBe('failed');
    expect(m.canRevive).toBe(false);
    expect(m.revive()).toBe(false);
    expect(m.result?.stats).toMatchObject({ detected: true, damaged: true });
  });

  it('moves the player from input and tracks light exposure', () => {
    const m = new Mission(loadJson(small), new Rng(1));
    const input = new InputState();
    const z0 = m.player.pos.z;
    for (let t = 0; t < 0.5; t += DT) {
      input.moveY = 1;
      m.step(DT, input, LENS);
    }
    expect(m.player.pos.z).toBeLessThan(z0); // spawn faces north (−Z)
    expect(m.exposure).toBeGreaterThan(0);
  });

  it('applies perk modifiers: quieter steps, faster regen, extra bottles', () => {
    const mods = { ...NO_MODIFIERS, noiseScale: 0.5, regenDelayS: 2, bonusBottles: 2 };
    const plain = new Mission(loadJson(small), new Rng(1));
    const perk = new Mission(loadJson(small), new Rng(1), mods);
    expect(perk.bottles).toBe(plain.bottles + 2);
    for (const m of [plain, perk]) {
      const input = new InputState();
      input.gait = 'run';
      for (let t = 0; t < 0.3; t += DT) {
        input.moveY = 1;
        m.step(DT, input, LENS);
      }
    }
    expect(perk.player.noiseRadius).toBeCloseTo(plain.player.noiseRadius * 0.5);
    perk.health.damage();
    let healedAt = -1;
    for (let t = 0; t < HEALTH.regenDelayS && healedAt < 0; t += DT) {
      if (perk.health.update(DT, false)) healedAt = t;
    }
    expect(healedAt).toBeGreaterThan(1.9);
    expect(healedAt).toBeLessThan(2.1);
  });

  it('takes the hit points from the modifiers', () => {
    const m = new Mission(loadJson(small), new Rng(1), { ...NO_MODIFIERS, maxHp: 1 });
    expect(m.health.hp).toBe(1);
    expect(m.health.full).toBe(true);
  });
});
