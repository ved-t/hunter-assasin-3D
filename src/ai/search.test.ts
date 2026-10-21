import { describe, expect, it } from 'vitest';
import { SEARCH } from '../config/tunables';
import { Rng } from '../core/rng';
import { Grid } from '../level/grid';
import { createWalkField } from '../nav/sound';
import { pickSearchCells } from './search';

const T = 2;
const c = (n: number) => (n + 0.5) * T;

// A plus-shaped junction: corridors running east/west and north/south from the centre (6,6).
const junction = Grid.fromRows(
  [
    '#############',
    '######.######',
    '######.######',
    '######.######',
    '######.######',
    '######.######',
    '#...........#',
    '######.######',
    '######.######',
    '######.######',
    '######.######',
    '######.######',
    '#############',
  ],
  T,
);
const walk = createWalkField(junction);
const lkp = { x: c(6), z: c(6) };

describe('pickSearchCells', () => {
  it('returns 4–6 walkable, reachable, spread-out cells', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const cells = pickSearchCells(walk, lkp, { x: 1, z: 0 }, new Rng(seed));
      expect(cells.length).toBeGreaterThanOrEqual(SEARCH.minCells);
      expect(cells.length).toBeLessThanOrEqual(SEARCH.maxCells);
      walk.flood(lkp.x, lkp.z, SEARCH.radiusM);
      for (const p of cells) {
        const { cx, cy } = junction.worldToCell(p.x, p.z);
        expect(junction.isSolid(cx, cy)).toBe(false);
        expect(walk.at(p.x, p.z)).toBeLessThanOrEqual(SEARCH.radiusM);
        expect(walk.at(p.x, p.z)).toBeGreaterThanOrEqual(SEARCH.minDistM);
      }
      for (let i = 0; i < cells.length; i++) {
        for (let j = i + 1; j < cells.length; j++) {
          const a = cells[i]!;
          const b = cells[j]!;
          expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(SEARCH.minSpacingM);
        }
      }
    }
  });

  it('is biased along the player’s last heading', () => {
    let east = 0;
    let west = 0;
    for (let seed = 1; seed <= 30; seed++) {
      for (const p of pickSearchCells(walk, lkp, { x: 1, z: 0 }, new Rng(seed))) {
        if (p.x > lkp.x + 1) east++;
        if (p.x < lkp.x - 1) west++;
      }
    }
    expect(east).toBeGreaterThan(west * 2);
  });

  it('is deterministic for a seed', () => {
    const a = pickSearchCells(walk, lkp, { x: 0, z: 1 }, new Rng(7));
    const b = pickSearchCells(walk, lkp, { x: 0, z: 1 }, new Rng(7));
    expect(a).toEqual(b);
  });

  it('visits the nearest remaining cell next, starting from the LKP', () => {
    const cells = pickSearchCells(walk, lkp, { x: 1, z: 0 }, new Rng(3));
    const d = (p: { x: number; z: number }) => Math.hypot(p.x - lkp.x, p.z - lkp.z);
    const first = cells[0]!;
    expect(cells.every((p) => d(first) <= d(p) + 1e-9)).toBe(true);
  });

  it('copes with a tiny room', () => {
    const closet = Grid.fromRows(['#####', '#...#', '#####'], T);
    const cells = pickSearchCells(
      createWalkField(closet),
      { x: c(1), z: c(1) },
      { x: 1, z: 0 },
      new Rng(1),
    );
    expect(cells.length).toBeLessThanOrEqual(1);
  });
});
