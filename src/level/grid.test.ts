import { describe, expect, it } from 'vitest';
import { Grid } from './grid';
import { Tile } from './types';

const rows = ['#####', '#.cD#', '#.E.#', '#####'];
const grid = Grid.fromRows(rows, 2);

describe('Grid', () => {
  it('reads dimensions and tiles from rows', () => {
    expect(grid.width).toBe(5);
    expect(grid.height).toBe(4);
    expect(grid.get(0, 0)).toBe(Tile.Wall);
    expect(grid.get(1, 1)).toBe(Tile.Floor);
    expect(grid.get(2, 1)).toBe(Tile.Cover);
    expect(grid.get(3, 1)).toBe(Tile.Door);
    expect(grid.get(2, 2)).toBe(Tile.Exit);
  });

  it('treats walls and cover as solid, doors and exits as walkable', () => {
    expect(grid.isSolid(0, 0)).toBe(true);
    expect(grid.isSolid(2, 1)).toBe(true);
    expect(grid.isSolid(1, 1)).toBe(false);
    expect(grid.isSolid(3, 1)).toBe(false);
    expect(grid.isSolid(2, 2)).toBe(false);
  });

  it('reads out-of-bounds cells as wall', () => {
    expect(grid.inBounds(-1, 0)).toBe(false);
    expect(grid.inBounds(5, 0)).toBe(false);
    expect(grid.get(-1, 2)).toBe(Tile.Wall);
    expect(grid.isSolid(2, 99)).toBe(true);
  });

  it('round-trips world and cell coordinates', () => {
    for (let cy = 0; cy < grid.height; cy++) {
      for (let cx = 0; cx < grid.width; cx++) {
        const c = grid.cellCenter(cx, cy);
        expect(grid.worldToCell(c.x, c.z)).toEqual({ cx, cy });
      }
    }
    expect(grid.worldToCell(3.99, 2)).toEqual({ cx: 1, cy: 1 });
    expect(grid.gridToWorld(1.5, 2.5)).toEqual({ x: 3, z: 5 });
  });

  it('visits only solid cells overlapping the query square', () => {
    const seen: string[] = [];
    grid.forEachSolidNear(3, 3, 0.5, (cx, cy) => seen.push(`${cx},${cy}`));
    expect(seen).toEqual([]);
    grid.forEachSolidNear(3, 2.2, 0.5, (cx, cy) => seen.push(`${cx},${cy}`));
    expect(seen).toEqual(['1,0']);
  });
});
