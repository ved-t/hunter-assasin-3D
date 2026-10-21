// Bounded path-distance floods (8-connected Dijkstra with octile step costs) over the tile grid.
// Sound uses this so noise reaches a guard around corners and through doorways, never through walls.

import type { Grid } from '../level/grid';
import { Tile } from '../level/types';
import { MinHeap } from './heap';

const DX = [1, -1, 0, 0, 1, 1, -1, -1] as const;
const DY = [0, 0, 1, -1, 1, -1, 1, -1] as const;

export type CellPassable = (grid: Grid, cx: number, cy: number) => boolean;

/** Sound carries over low cover and through doorways; only walls stop it. */
export const soundPasses: CellPassable = (grid, cx, cy) => grid.get(cx, cy) !== Tile.Wall;
/** Bodies walk on non-solid cells only. */
export const walkPasses: CellPassable = (grid, cx, cy) => !grid.isSolid(cx, cy);

export class DistanceField {
  /** Path distance (m) from the last flood's source to each cell; Infinity beyond reach. */
  readonly dist: Float64Array;
  private readonly heap = new MinHeap(256);

  constructor(
    readonly grid: Grid,
    private readonly passes: CellPassable,
  ) {
    this.dist = new Float64Array(grid.width * grid.height).fill(Infinity);
  }

  /**
   * Floods out from the cell containing (x, z) up to maxDist metres. Overwrites `dist`, so read the
   * result before the next flood. Returns `dist`.
   */
  flood(x: number, z: number, maxDist: number): Float64Array {
    const { grid, dist, heap } = this;
    const w = grid.width;
    dist.fill(Infinity);
    heap.clear();
    const { cx, cy } = grid.worldToCell(x, z);
    if (!grid.inBounds(cx, cy) || !this.passes(grid, cx, cy)) return dist;
    const t = grid.tileSize;
    const start = cy * w + cx;
    dist[start] = 0;
    heap.push(start, 0);
    while (heap.size > 0) {
      const d = heap.peekKey();
      const cur = heap.pop();
      if (d > (dist[cur] as number)) continue; // stale entry
      const ccx = cur % w;
      const ccy = (cur - ccx) / w;
      for (let k = 0; k < 8; k++) {
        const nx = ccx + (DX[k] as number);
        const ny = ccy + (DY[k] as number);
        if (!grid.inBounds(nx, ny) || !this.passes(grid, nx, ny)) continue;
        const diagonal = k >= 4;
        // No squeezing diagonally between two blockers' corners.
        if (diagonal && (!this.passes(grid, nx, ccy) || !this.passes(grid, ccx, ny))) continue;
        const nd = d + (diagonal ? Math.SQRT2 : 1) * t;
        if (nd > maxDist) continue;
        const ni = ny * w + nx;
        if (nd >= (dist[ni] as number)) continue;
        dist[ni] = nd;
        heap.push(ni, nd);
      }
    }
    return dist;
  }

  /** Distance at a world point from the last flood (Infinity if unreached or off-grid). */
  at(x: number, z: number): number {
    const { cx, cy } = this.grid.worldToCell(x, z);
    if (!this.grid.inBounds(cx, cy)) return Infinity;
    return this.dist[cy * this.grid.width + cx] as number;
  }

  /** Convenience: path distance between two points, or Infinity if beyond maxDist. */
  pathDistance(ax: number, az: number, bx: number, bz: number, maxDist: number): number {
    this.flood(ax, az, maxDist);
    return this.at(bx, bz);
  }
}

export function createSoundField(grid: Grid): DistanceField {
  return new DistanceField(grid, soundPasses);
}

export function createWalkField(grid: Grid): DistanceField {
  return new DistanceField(grid, walkPasses);
}
