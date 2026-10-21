// 8-connected A* on the tile grid, then string-pulled into a short list of world waypoints.
// Diagonal moves never cut a solid corner, so every step stays reachable for the circle collider.

import type { Vec2 } from '../level/collision';
import type { Grid } from '../level/grid';
import { MinHeap } from './heap';
import { isCorridorWalkable } from './los';

/** Neighbour offsets: 4 orthogonal first, then 4 diagonal. */
const DX = [1, -1, 0, 0, 1, 1, -1, -1] as const;
const DY = [0, 0, 1, -1, 1, -1, 1, -1] as const;

/** Octile distance in cells. */
function octile(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
}

export class Pathfinder {
  private readonly g: Float64Array;
  private readonly parent: Int32Array;
  /** Search generation per cell: a cell's g/parent are valid only if its stamp matches. */
  private readonly stamp: Uint32Array;
  private readonly closed: Uint32Array;
  private generation = 0;
  private readonly heap = new MinHeap(256);
  private readonly cells: number[] = [];

  constructor(
    private readonly grid: Grid,
    /** Clearance used when string-pulling (m); the walker's collision radius. */
    private readonly radius: number,
  ) {
    const n = grid.width * grid.height;
    this.g = new Float64Array(n);
    this.parent = new Int32Array(n);
    this.stamp = new Uint32Array(n);
    this.closed = new Uint32Array(n);
  }

  /**
   * Path from (sx, sz) to (tx, tz) in world metres. On success, fills `out` with waypoints after the
   * start (the last one is the exact target) and returns true. Returns false if the target cell is
   * solid or unreachable; `out` is then empty.
   */
  findPath(sx: number, sz: number, tx: number, tz: number, out: Vec2[]): boolean {
    out.length = 0;
    const { grid } = this;
    const w = grid.width;
    const s = grid.worldToCell(sx, sz);
    const e = grid.worldToCell(tx, tz);
    if (grid.isSolid(e.cx, e.cy) || grid.isSolid(s.cx, s.cy)) return false;
    if (s.cx === e.cx && s.cy === e.cy) {
      out.push({ x: tx, z: tz });
      return true;
    }

    const gen = ++this.generation;
    const start = s.cy * w + s.cx;
    const goal = e.cy * w + e.cx;
    this.heap.clear();
    this.stamp[start] = gen;
    this.g[start] = 0;
    this.parent[start] = -1;
    this.heap.push(start, octile(s.cx, s.cy, e.cx, e.cy));

    let found = false;
    while (this.heap.size > 0) {
      const cur = this.heap.pop();
      if (this.closed[cur] === gen) continue;
      this.closed[cur] = gen;
      if (cur === goal) {
        found = true;
        break;
      }
      const cx = cur % w;
      const cy = (cur - cx) / w;
      const gc = this.g[cur] as number;
      for (let k = 0; k < 8; k++) {
        const nx = cx + (DX[k] as number);
        const ny = cy + (DY[k] as number);
        if (grid.isSolid(nx, ny)) continue;
        const diagonal = k >= 4;
        if (diagonal && (grid.isSolid(nx, cy) || grid.isSolid(cx, ny))) continue;
        const ni = ny * w + nx;
        if (this.closed[ni] === gen) continue;
        const ng = gc + (diagonal ? Math.SQRT2 : 1);
        if (this.stamp[ni] === gen && ng >= (this.g[ni] as number)) continue;
        this.stamp[ni] = gen;
        this.g[ni] = ng;
        this.parent[ni] = cur;
        this.heap.push(ni, ng + octile(nx, ny, e.cx, e.cy));
      }
    }
    if (!found) return false;

    // Cells goal → start, then reverse into world points (excluding the start cell).
    const cells = this.cells;
    cells.length = 0;
    for (let i = goal; i !== start; i = this.parent[i] as number) cells.push(i);
    cells.reverse();
    this.stringPull(sx, sz, tx, tz, out);
    return true;
  }

  /** Keep only the corners where a straight walk from the last kept point would be blocked. */
  private stringPull(sx: number, sz: number, tx: number, tz: number, out: Vec2[]): void {
    const { grid, cells, radius } = this;
    const w = grid.width;
    const point = (i: number): Vec2 => {
      if (i === cells.length - 1) return { x: tx, z: tz };
      const ci = cells[i] as number;
      const cx = ci % w;
      return grid.cellCenter(cx, (ci - cx) / w);
    };
    let ax = sx;
    let az = sz;
    for (let i = 0; i < cells.length - 1; i++) {
      const next = point(i + 1);
      if (isCorridorWalkable(grid, ax, az, next.x, next.z, radius)) continue;
      const keep = point(i);
      out.push(keep);
      ax = keep.x;
      az = keep.z;
    }
    out.push({ x: tx, z: tz });
  }
}
