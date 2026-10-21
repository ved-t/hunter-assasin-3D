import { describe, expect, it } from 'vitest';
import { LEVEL } from '../config/tunables';
import { Grid } from '../level/grid';
import {
  castRay2D,
  createRayHit,
  hasLineOfSight,
  isCorridorWalkable,
  isSegmentWalkable,
  traverseCells,
} from './los';

const T = 2;
// Cell (cx, cy) centre is ((cx + 0.5)·T, (cy + 0.5)·T).
const c = (n: number) => (n + 0.5) * T;

const room = Grid.fromRows(
  [
    '#########', // 0
    '#.......#', // 1
    '#...#...#', // 2  pillar at (4,2)
    '#.......#', // 3
    '#.c.....#', // 4  cover at (2,4)
    '###D#####', // 5  door at (3,5)
    '#.......#', // 6
    '#########', // 7
  ],
  T,
);

const EYE = 1.6;

describe('traverseCells', () => {
  it('visits every cell along a horizontal segment in order', () => {
    const cells: string[] = [];
    traverseCells(room, c(1), c(1), c(4), c(1), (cx, cy) => {
      cells.push(`${cx},${cy}`);
      return false;
    });
    expect(cells).toEqual(['1,1', '2,1', '3,1', '4,1']);
  });

  it('reports a vertex crossing to the pinch visitor', () => {
    const pinches: number[][] = [];
    traverseCells(
      room,
      2,
      2,
      6,
      6,
      () => false,
      (ax, ay, bx, by) => {
        pinches.push([ax, ay, bx, by]);
        return false;
      },
    );
    expect(pinches[0]).toEqual([2, 1, 1, 2]);
  });
});

describe('hasLineOfSight', () => {
  it('sees across an open room', () => {
    expect(hasLineOfSight(room, c(1), EYE, c(1), c(7), EYE, c(1))).toBe(true);
  });

  it('is blocked by a wall pillar at any height', () => {
    expect(hasLineOfSight(room, c(2), EYE, c(2), c(6), EYE, c(2))).toBe(false);
    expect(hasLineOfSight(room, c(2), 0.2, c(2), c(6), 0.2, c(2))).toBe(false);
  });

  it('low cover blocks low sight lines but not ones above it', () => {
    const low = LEVEL.coverHeight - 0.4;
    const high = LEVEL.coverHeight + 0.4;
    expect(hasLineOfSight(room, c(1), low, c(4), c(3), low, c(4))).toBe(false);
    expect(hasLineOfSight(room, c(1), high, c(4), c(3), high, c(4))).toBe(true);
  });

  it('a sight line that dips below the cover top while crossing it is blocked', () => {
    // From an eye above the crate down to a crouched body just behind it.
    expect(hasLineOfSight(room, c(1), 1.6, c(4), c(3), 0.3, c(4))).toBe(false);
  });

  it('sees through a doorway under the lintel but not over it', () => {
    expect(hasLineOfSight(room, c(3), EYE, c(4), c(3), EYE, c(6))).toBe(true);
    const above = LEVEL.doorHeight + 0.3;
    expect(hasLineOfSight(room, c(3), above, c(4), c(3), above, c(6))).toBe(false);
  });

  it('cannot squeeze through a diagonal gap between two walls', () => {
    const diag = Grid.fromRows(['####', '#.##', '##.#', '####'], T);
    // Exactly through the shared corner of (1,1) and (2,2), between walls (2,1) and (1,2).
    expect(hasLineOfSight(diag, 3, EYE, 3, 5, EYE, 5)).toBe(false);
  });

  it('is symmetric', () => {
    const pairs: [number, number, number, number][] = [
      [c(1), c(1), c(7), c(3)],
      [c(2), c(1), c(6), c(3)],
      [c(1), c(3), c(5), c(6)],
    ];
    for (const [ax, az, bx, bz] of pairs) {
      expect(hasLineOfSight(room, ax, EYE, az, bx, EYE, bz)).toBe(
        hasLineOfSight(room, bx, EYE, bz, ax, EYE, az),
      );
    }
  });
});

describe('walkable segments', () => {
  it('cover blocks walking even though it does not block sight', () => {
    expect(isSegmentWalkable(room, c(1), c(4), c(3), c(4))).toBe(false);
    expect(isSegmentWalkable(room, c(1), c(3), c(7), c(3))).toBe(true);
  });

  it('a body-width corridor clips a corner the centre line misses', () => {
    // Centre line passes 0.2 m below the pillar's bottom edge (z = 6).
    const z = 6.2;
    expect(isSegmentWalkable(room, c(1), z, c(7), z)).toBe(true);
    expect(isCorridorWalkable(room, c(1), z, c(7), z, 0.35)).toBe(false);
  });
});

describe('castRay2D', () => {
  it('reports distance and normal of the first wall face', () => {
    const hit = castRay2D(room, c(1), c(1), 1, 0, 30, createRayHit());
    expect(hit.hit).toBe(true);
    expect(hit.dist).toBeCloseTo(8 * T - c(1));
    expect([hit.nx, hit.nz]).toEqual([-1, 0]);
  });

  it('hits a north wall with a +Z normal', () => {
    const hit = castRay2D(room, c(1), c(3), 0, -1, 30, createRayHit());
    expect(hit.dist).toBeCloseTo(c(3) - T);
    expect([hit.nx, hit.nz]).toEqual([0, 1]);
  });

  it('passes over cover and through doorways', () => {
    const overCover = castRay2D(room, c(1), c(4), 1, 0, 30, createRayHit());
    expect(overCover.dist).toBeCloseTo(8 * T - c(1));
    const throughDoor = castRay2D(room, c(3), c(4), 0, 1, 30, createRayHit());
    expect(throughDoor.dist).toBeCloseTo(7 * T - c(4));
  });

  it('stops at maxDist when nothing is hit', () => {
    const hit = castRay2D(room, c(1), c(1), 1, 0, 3, createRayHit());
    expect(hit.hit).toBe(false);
    expect(hit.dist).toBe(3);
  });
});
