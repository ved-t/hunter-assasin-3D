import { describe, expect, it } from 'vitest';
import medium from '../../public/levels/medium.json';
import small from '../../public/levels/small.json';
import { Rng } from '../core/rng';
import { InputState } from '../input/input-state';
import { levelFromJson as loadJson } from '../level/loader';
import { Mission, type ViewLens } from './mission';

const DT = 1 / 60;
const LENS: ViewLens = { vFov: (70 * Math.PI) / 180, aspect: 16 / 9 };

function run(m: Mission, input: InputState, seconds: number): void {
  for (let t = 0; t < seconds; t += DT) m.step(DT, input, LENS);
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
});
