import { describe, expect, it } from 'vitest';
import type { GuardState } from '../ai/guard-fsm';
import { KNIFE } from '../config/tunables';
import { yawFromDir } from '../core/angles';
import { Grid } from '../level/grid';
import { canKnife, findKillTarget, type KnifeTarget } from './knife';

const T = 2;
const c = (n: number) => (n + 0.5) * T;

const grid = Grid.fromRows(
  [
    '########', // 0
    '#......#', // 1
    '#......#', // 2
    '#...#..#', // 3
    '########', // 4
  ],
  T,
);

/** A guard at the centre of (3, 1) facing east (+X). */
function guard(over: Partial<KnifeTarget> = {}): KnifeTarget {
  return {
    pos: { x: c(3), z: c(1) },
    yaw: yawFromDir(1, 0),
    state: 'patrol' as GuardState,
    dead: false,
    ...over,
  };
}

/** Player position at `distance` from the guard, `deg` off his facing (0 = in front). */
function at(g: KnifeTarget, distance: number, deg: number): [number, number] {
  const a = g.yaw + (deg * Math.PI) / 180;
  return [g.pos.x - Math.sin(a) * distance, g.pos.z - Math.cos(a) * distance];
}

describe('canKnife', () => {
  it('works from behind and from the side, not from the front 140°', () => {
    const g = guard();
    expect(canKnife(grid, ...at(g, 1, 180), g)).toBe(true);
    expect(canKnife(grid, ...at(g, 1, 90), g)).toBe(true);
    expect(canKnife(grid, ...at(g, 1, -90), g)).toBe(true);
    expect(canKnife(grid, ...at(g, 1, 71), g)).toBe(true);
    expect(canKnife(grid, ...at(g, 1, 69), g)).toBe(false);
    expect(canKnife(grid, ...at(g, 1, 0), g)).toBe(false);
  });

  it('reaches exactly 1.6 m', () => {
    const g = guard();
    expect(canKnife(grid, ...at(g, KNIFE.rangeM - 0.01, 180), g)).toBe(true);
    expect(canKnife(grid, ...at(g, KNIFE.rangeM + 0.01, 180), g)).toBe(false);
  });

  it('never works on an Alert or dead guard', () => {
    expect(canKnife(grid, ...at(guard(), 1, 180), guard({ state: 'alert' }))).toBe(false);
    expect(canKnife(grid, ...at(guard(), 1, 180), guard({ dead: true }))).toBe(false);
    // Suspicious and searching guards can still be taken from behind.
    expect(canKnife(grid, ...at(guard(), 1, 180), guard({ state: 'suspicious' }))).toBe(true);
    expect(canKnife(grid, ...at(guard(), 1, 180), guard({ state: 'search' }))).toBe(true);
  });

  it('is blocked by a wall corner between player and guard', () => {
    // Guard just north of wall (4,3)'s north-west corner, player just west of it: the line between
    // them squeezes past the corner, which a body can't do.
    const g = guard({ pos: { x: 4 * T + 0.3, z: 3 * T - 0.3 }, yaw: yawFromDir(0, -1) });
    const blocked: [number, number] = [4 * T - 0.3, 3 * T + 0.3];
    expect(Math.hypot(blocked[0] - g.pos.x, blocked[1] - g.pos.z)).toBeLessThan(KNIFE.rangeM);
    expect(canKnife(grid, ...blocked, g)).toBe(false);
  });
});

describe('findKillTarget', () => {
  it('picks the nearest valid guard', () => {
    const near = guard({ pos: { x: c(3), z: c(2) } });
    const far = guard({ pos: { x: c(3) + 0.3, z: c(2) - 0.8 } });
    const alert = guard({ pos: { x: c(3) - 0.5, z: c(2) }, state: 'alert' });
    const [x, z] = at(near, 0.9, 180);
    expect(findKillTarget(grid, x, z, [far, alert, near])).toBe(2);
    expect(findKillTarget(grid, x, z, [far, alert])).toBe(0);
    expect(findKillTarget(grid, 50, 50, [far, alert, near])).toBe(-1);
  });
});
