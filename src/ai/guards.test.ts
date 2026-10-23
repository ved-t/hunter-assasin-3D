import { describe, expect, it } from 'vitest';
import { AWARENESS, GUARD, SEARCH, WEAPON } from '../config/tunables';
import { Rng } from '../core/rng';
import { Grid } from '../level/grid';
import type { GuardDef } from '../level/types';
import type { GuardState } from './guard-fsm';
import { GuardSystem, type PlayerView } from './guards';

const T = 2;
const DT = 1 / 60;
const c = (n: number) => (n + 0.5) * T;

// Room A (cols 1–6) and room B (cols 8–12) joined by a door at (7,3).
const grid = Grid.fromRows(
  [
    '##############',
    '#......#.....#',
    '#......#.....#',
    '#......D.....#',
    '#......#.....#',
    '##############',
  ],
  T,
);

/** A guard posted at a cell (one waypoint), facing a compass heading. */
function posted(cx: number, cy: number, yawDeg: number): GuardDef {
  return { spawn: { x: cx + 0.5, y: cy + 0.5 }, yawDeg, waypoints: [{ x: cx + 0.5, y: cy + 0.5 }] };
}

function player(x: number, z: number): PlayerView & { pos: { x: number; z: number } } {
  return { pos: { x, z }, vel: { x: 0, z: 0 }, crouched: false, gait: 'walk' };
}

function run(sys: GuardSystem, p: PlayerView, seconds: number, exposure = 1): void {
  for (let t = 0; t < seconds; t += DT) sys.step(DT, p, exposure);
}

describe('GuardSystem', () => {
  it('cycles Patrol → Suspicious → Alert → Search → Patrol', () => {
    const sys = new GuardSystem(grid, [posted(1, 2, 90)], new Rng(1));
    const g = sys.guards[0]!;
    const states: GuardState[] = [];
    sys.events.on('stateChange', (e) => states.push(e.to));

    const p = player(c(4), c(2)); // in plain view, 6 m ahead
    run(sys, p, 6);
    expect(states.slice(0, 2)).toEqual(['suspicious', 'alert']);
    expect(g.awareness.lkp).not.toBeNull();

    // The player vanishes: the guard runs to the LKP, searches, then gives up.
    p.pos.x = -50;
    p.pos.z = -50;
    run(sys, p, SEARCH.giveUpS + 10);
    expect(states).toEqual(['suspicious', 'alert', 'search', 'patrol']);
    expect(g.state).toBe('patrol');
    // The post-search floor keeps the guard edgy for a while.
    expect(g.awareness.value).toBeCloseTo(AWARENESS.searchFloor);
  });

  it('Search starts below Alert and re-alerts on a fresh sighting', () => {
    const sys = new GuardSystem(grid, [posted(1, 2, 90)], new Rng(1));
    const g = sys.guards[0]!;
    const p = player(c(4), c(2));
    run(sys, p, 6);
    p.pos.x = -50;
    for (let t = 0; t < 20 && g.state !== 'search'; t += DT) sys.step(DT, p, 1);
    expect(g.state).toBe('search');
    expect(g.awareness.value).toBeLessThanOrEqual(AWARENESS.searchStart);
    // Stand right in front of the guard's beam.
    const ahead = { x: g.pos.x - Math.sin(g.yaw) * 2, z: g.pos.z - Math.cos(g.yaw) * 2 };
    p.pos.x = ahead.x;
    p.pos.z = ahead.z;
    run(sys, p, 1.5);
    expect(g.state).toBe('alert');
  });

  it('a dark, crouched, still player is seen far more slowly than a lit one', () => {
    const lit = new GuardSystem(grid, [posted(1, 2, 90)], new Rng(1));
    const dark = new GuardSystem(grid, [posted(1, 2, 90)], new Rng(1));
    const p = player(c(5), c(2));
    run(lit, p, 0.5, 1);
    run(dark, { ...p, crouched: true, gait: 'still' }, 0.5, 0.25);
    expect(dark.guards[0]!.awareness.value).toBeLessThan(lit.guards[0]!.awareness.value / 5);
  });

  it('hears footsteps through the doorway but not through the wall', () => {
    const radius = 6;
    // Guard just inside room A, facing away from the door.
    const near = new GuardSystem(grid, [posted(6, 3, 270)], new Rng(1));
    for (let i = 0; i < 20; i++) {
      near.noise(c(8), c(3), radius); // just past the door in room B
      near.step(DT, player(-50, -50), 1);
    }
    expect(near.guards[0]!.awareness.value).toBeGreaterThan(AWARENESS.suspicious);

    // Same straight-line distance, but the wall is in the way and the path round is too long.
    const walled = new GuardSystem(grid, [posted(6, 1, 270)], new Rng(1));
    for (let i = 0; i < 20; i++) {
      walled.noise(c(8), c(1), radius);
      walled.step(DT, player(-50, -50), 1);
    }
    expect(walled.guards[0]!.awareness.value).toBe(0);
  });

  it('an alerted guard alerts others within path range only', () => {
    const sys = new GuardSystem(
      grid,
      [posted(4, 2, 90), posted(8, 3, 90), posted(12, 1, 90)],
      new Rng(1),
    );
    const shouts: number[][] = [];
    sys.events.on('alert', (e) => shouts.push(e.alerted.map((g) => g.id)));
    run(sys, player(c(6), c(2)), 3);
    expect(shouts[0]).toEqual([1]);
    expect(sys.guards[1]!.state).toBe('alert');
    expect(sys.guards[2]!.state).toBe('patrol');
    // The shouted-to guard heads for the shared LKP without shouting on.
    expect(shouts).toHaveLength(1);
  });

  it('steps at the walk cadence on patrol, runs when alerted, and is silent standing still', () => {
    const walker: GuardDef = {
      spawn: { x: 1.5, y: 1.5 },
      yawDeg: 90,
      waypoints: [
        { x: 1.5, y: 1.5 },
        { x: 5.5, y: 1.5 },
      ],
    };
    const sys = new GuardSystem(grid, [walker, posted(11, 1, 180)], new Rng(1));
    const steps: { id: number; gait: string; t: number }[] = [];
    let t = 0;
    sys.events.on('footstep', (e) => steps.push({ id: e.guard.id, gait: e.gait, t }));
    for (; t < 4; t += DT) sys.step(DT, player(-50, -50), 1);
    const walks = steps.filter((s) => s.id === 0);
    expect(walks.length).toBeGreaterThan(3);
    expect(walks.every((s) => s.gait === 'walk')).toBe(true);
    const gaps = walks.slice(1).map((s, i) => s.t - walks[i]!.t);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(GUARD.footstepIntervalS.walk - DT - 1e-9);
    expect(steps.some((s) => s.id === 1)).toBe(false); // posted, never moves

    // Alerted by a player in plain view, then the player vanishes: he runs to the last known position.
    const chaser = new GuardSystem(grid, [posted(1, 2, 90)], new Rng(1));
    const gaits: string[] = [];
    chaser.events.on('footstep', (e) => gaits.push(e.gait));
    const p = player(c(5), c(2));
    run(chaser, p, 4);
    expect(chaser.guards[0]!.state).toBe('alert');
    p.pos.x = -50;
    run(chaser, p, 2);
    expect(gaits).toContain('run');
  });

  it('patrols between waypoints with A* and limited turning', () => {
    const def: GuardDef = {
      spawn: { x: 1.5, y: 1.5 },
      yawDeg: 90,
      waypoints: [
        { x: 1.5, y: 1.5 },
        { x: 11.5, y: 4.5, waitS: 1 },
      ],
    };
    const sys = new GuardSystem(grid, [def], new Rng(1));
    const g = sys.guards[0]!;
    let maxTurn = 0;
    let reached = false;
    for (let t = 0; t < 30 && !reached; t += DT) {
      sys.step(DT, player(-50, -50), 1);
      maxTurn = Math.max(
        maxTurn,
        Math.abs(Math.atan2(Math.sin(g.yaw - g.prevYaw), Math.cos(g.yaw - g.prevYaw))),
      );
      reached = Math.hypot(g.pos.x - c(11), g.pos.z - c(4)) < 0.5;
    }
    expect(reached).toBe(true);
    expect(maxTurn).toBeLessThanOrEqual(((110 * Math.PI) / 180) * DT + 1e-9);
  });
});

describe('guard shooting', () => {
  /** A guard already Alert on a player in plain view 6 m ahead. */
  function alerted() {
    const sys = new GuardSystem(grid, [posted(1, 2, 90)], new Rng(1));
    const p = player(c(4), c(2));
    for (let t = 0; t < 10 && sys.guards[0]!.state !== 'alert'; t += DT) sys.step(DT, p, 1);
    expect(sys.guards[0]!.state).toBe('alert');
    return { sys, g: sys.guards[0]!, p };
  }

  it('shoots only after a wind-up, then keeps the shot interval', () => {
    const sys = new GuardSystem(grid, [posted(1, 2, 90)], new Rng(1));
    const p = player(c(4), c(2));
    const log: string[] = [];
    let t = 0;
    const times: number[] = [];
    sys.events.on('windup', () => log.push('windup'));
    sys.events.on('shot', () => (log.push('shot'), times.push(t)));
    for (; t < 6; t += DT) sys.step(DT, p, 1);
    expect(log.slice(0, 4)).toEqual(['windup', 'shot', 'windup', 'shot']);
    expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(WEAPON.shotIntervalS - 1e-6);
  });

  it('stands still while aiming', () => {
    const { sys, g } = alerted();
    const p = player(c(6), c(2)); // further than the standoff, so he'd otherwise advance
    for (let t = 0; t < 2 && g.gun.phase !== 'windup'; t += DT) sys.step(DT, p, 1);
    expect(g.gun.phase).toBe('windup');
    const before = { ...g.pos };
    sys.step(DT, p, 1);
    expect(g.pos).toEqual(before);
  });

  it('a broken line of sight during the wind-up means no shot', () => {
    const { sys, g, p } = alerted();
    for (let t = 0; t < 2 && g.gun.phase !== 'windup'; t += DT) sys.step(DT, p, 1);
    let shots = 0;
    sys.events.on('shot', () => shots++);
    p.pos.x = -50; // gone behind a wall
    run(sys, p, 3);
    expect(shots).toBe(0);
  });

  it('dead or non-Alert guards never shoot', () => {
    const calm = new GuardSystem(grid, [posted(1, 2, 90)], new Rng(1));
    let shots = 0;
    calm.events.on('shot', () => shots++);
    run(calm, player(c(4), c(2)), 0.5); // seen, but not yet Alert
    expect(shots).toBe(0);
    const { sys, g, p } = alerted();
    sys.events.on('shot', () => shots++);
    sys.kill(g);
    run(sys, p, 3);
    expect(shots).toBe(0);
  });

  it('a shot alerts guards within its wider radius', () => {
    // Guard 1 is posted in room B, out of shout range but within the gunshot's.
    const sys = new GuardSystem(grid, [posted(1, 2, 90), posted(10, 3, 0)], new Rng(1));
    const p = player(c(4), c(2));
    run(sys, p, 2.5); // seen → Alert → shout (12 m doesn't reach him)
    expect(sys.guards[1]!.state).toBe('patrol');
    let shot = false;
    sys.events.on('shot', () => (shot = true));
    for (let t = 0; t < 3 && !shot; t += DT) sys.step(DT, p, 1);
    expect(shot).toBe(true);
    sys.step(DT, p, 1);
    expect(sys.guards[1]!.state).toBe('alert');
  });
});

describe('dead guards', () => {
  it('stop sensing, moving and changing state, and drop a lit flashlight ahead of them', () => {
    const sys = new GuardSystem(grid, [posted(1, 2, 90)], new Rng(1));
    const g = sys.guards[0]!;
    const deaths: number[] = [];
    sys.events.on('death', (e) => deaths.push(e.guard.id));
    expect(sys.kill(g)).toBe(true);
    expect(sys.kill(g)).toBe(false);
    expect(deaths).toEqual([0]);
    expect(sys.aliveCount).toBe(0);
    expect(g.flicker).toBe('steady');
    // Facing east (+X): the light lands ahead of him, near the floor.
    expect(g.dropLens.x).toBeGreaterThan(g.pos.x);
    expect(g.dropLens.height).toBeLessThan(0.5);

    const pos = { ...g.pos };
    const p = player(c(4), c(2)); // in plain view
    sys.noise(c(2), c(2), 12);
    run(sys, p, 3);
    expect(g.awareness.value).toBe(0);
    expect(g.seesPlayer).toBe(false);
    expect(g.state).toBe('patrol');
    expect(g.pos).toEqual(pos);
    expect(g.deadFor).toBeCloseTo(3, 1);
  });

  it('are not shouted to', () => {
    const sys = new GuardSystem(grid, [posted(4, 2, 90), posted(8, 3, 90)], new Rng(1));
    sys.kill(sys.guards[1]!);
    const shouts: number[][] = [];
    sys.events.on('alert', (e) => shouts.push(e.alerted.map((g) => g.id)));
    run(sys, player(c(6), c(2)), 3);
    expect(shouts[0]).toEqual([]);
    expect(sys.guards[1]!.state).toBe('patrol');
  });
});
