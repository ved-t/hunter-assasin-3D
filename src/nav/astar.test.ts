import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../level/collision';
import { Grid } from '../level/grid';
import { Pathfinder } from './astar';
import { MinHeap } from './heap';
import { isCorridorWalkable } from './los';

const T = 2;
const c = (n: number) => (n + 0.5) * T;
const R = 0.35;

// Two rooms joined by one door at (4,3); cover at (2,2).
const rooms = Grid.fromRows(
  ['#########', '#...#...#', '#.c.#...#', '#...D...#', '#...#...#', '#########'],
  T,
);

function pathLength(sx: number, sz: number, path: Vec2[]): number {
  let len = 0;
  let px = sx;
  let pz = sz;
  for (const p of path) {
    len += Math.hypot(p.x - px, p.z - pz);
    px = p.x;
    pz = p.z;
  }
  return len;
}

describe('MinHeap', () => {
  it('pops in key order', () => {
    const h = new MinHeap(2);
    const keys = [5, 1, 9, 3, 7, 2, 8];
    keys.forEach((k, i) => h.push(i, k));
    const out: number[] = [];
    while (h.size > 0) out.push(keys[h.pop()] as number);
    expect(out).toEqual([1, 2, 3, 5, 7, 8, 9]);
  });
});

describe('Pathfinder', () => {
  const pf = new Pathfinder(rooms, R);

  it('walks straight across an open room in one leg', () => {
    const out: Vec2[] = [];
    expect(pf.findPath(c(5), c(1), c(7), c(4), out)).toBe(true);
    expect(out).toEqual([{ x: c(7), z: c(4) }]);
  });

  it('routes through the only door', () => {
    const out: Vec2[] = [];
    expect(pf.findPath(c(1), c(1), c(7), c(1), out)).toBe(true);
    const last = out[out.length - 1];
    expect(last).toEqual({ x: c(7), z: c(1) });
    // Every straight leg must be walkable for the guard's body, so no leg can clip the wall column.
    const legs = [{ x: c(1), z: c(1) }, ...out];
    for (let i = 0; i < legs.length - 1; i++) {
      const a = legs[i] as Vec2;
      const b = legs[i + 1] as Vec2;
      expect(isCorridorWalkable(rooms, a.x, a.z, b.x, b.z, R)).toBe(true);
    }
  });

  it('goes around cover rather than through it', () => {
    const out: Vec2[] = [];
    expect(pf.findPath(c(1), c(2), c(3), c(2), out)).toBe(true);
    expect(out.length).toBeGreaterThan(1);
    expect(pathLength(c(1), c(2), out)).toBeGreaterThan(2 * T);
  });

  it('never cuts a solid corner diagonally', () => {
    // Diagonal neighbours (1,1) and (2,2) share a corner with walls (2,1) and (1,2): not adjacent.
    const g = Grid.fromRows(['#####', '#.#.#', '##..#', '#...#', '#####'], T);
    const out: Vec2[] = [];
    expect(new Pathfinder(g, R).findPath(c(1), c(1), c(2), c(2), out)).toBe(false);
  });

  it('fails cleanly for a solid or unreachable target', () => {
    const out: Vec2[] = [{ x: 0, z: 0 }];
    expect(pf.findPath(c(1), c(1), c(2), c(2), out)).toBe(false); // cover
    expect(out).toEqual([]);
    const sealed = Grid.fromRows(['#####', '#.#.#', '#####'], T);
    expect(new Pathfinder(sealed, R).findPath(c(1), c(1), c(3), c(1), out)).toBe(false);
  });

  it('is reusable across many searches', () => {
    const out: Vec2[] = [];
    for (let i = 0; i < 50; i++) {
      expect(pf.findPath(c(1), c(4), c(7), c(1), out)).toBe(true);
      expect(out[out.length - 1]).toEqual({ x: c(7), z: c(1) });
    }
  });
});
