// Grid DDA (Amanatides–Woo) traversal and the line-of-sight / ray tests built on it. Pure, no three.js.
// Heights are metres above the floor; x/z are world metres (grid column x → +X, row y → +Z).

import { LEVEL } from '../config/tunables';
import type { Grid } from '../level/grid';
import { Tile } from '../level/types';

/** Ray parameters closer than this count as a vertex crossing (both axes stepped at once). */
const CORNER_EPSILON = 1e-9;

/** Called for each cell the segment crosses, with entry/exit parameters in [0, 1]. Return true to stop. */
export type CellVisitor = (cx: number, cy: number, tIn: number, tOut: number) => boolean;
/**
 * Called when the segment passes exactly through a cell corner, with the two side cells it squeezes
 * between and the crossing parameter. Return true to stop (the gap is pinched shut).
 */
export type PinchVisitor = (ax: number, ay: number, bx: number, by: number, t: number) => boolean;

/** Walks the cells crossed by segment (x0,z0)→(x1,z1). Returns true if a visitor stopped it. */
export function traverseCells(
  grid: Grid,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  visit: CellVisitor,
  pinch?: PinchVisitor,
): boolean {
  const t = grid.tileSize;
  const dx = x1 - x0;
  const dz = z1 - z0;
  let cx = Math.floor(x0 / t);
  let cy = Math.floor(z0 / t);
  const sx = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const sy = dz > 0 ? 1 : dz < 0 ? -1 : 0;
  const tDeltaX = sx !== 0 ? Math.abs(t / dx) : Infinity;
  const tDeltaY = sy !== 0 ? Math.abs(t / dz) : Infinity;
  let tMaxX = sx > 0 ? ((cx + 1) * t - x0) / dx : sx < 0 ? (cx * t - x0) / dx : Infinity;
  let tMaxY = sy > 0 ? ((cy + 1) * t - z0) / dz : sy < 0 ? (cy * t - z0) / dz : Infinity;
  let tIn = 0;
  // Each step crosses one boundary; this bound only protects against float pathologies.
  const maxSteps = Math.abs(Math.floor(x1 / t) - cx) + Math.abs(Math.floor(z1 / t) - cy) + 2;
  for (let i = 0; i <= maxSteps; i++) {
    const tOut = Math.min(tMaxX, tMaxY, 1);
    if (visit(cx, cy, tIn, tOut)) return true;
    if (tOut >= 1) return false;
    if (Math.abs(tMaxX - tMaxY) < CORNER_EPSILON) {
      if (pinch?.(cx + sx, cy, cx, cy + sy, tMaxX)) return true;
      cx += sx;
      cy += sy;
      tIn = tMaxX;
      tMaxX += tDeltaX;
      tMaxY += tDeltaY;
    } else if (tMaxX < tMaxY) {
      cx += sx;
      tIn = tMaxX;
      tMaxX += tDeltaX;
    } else {
      cy += sy;
      tIn = tMaxY;
      tMaxY += tDeltaY;
    }
  }
  return false;
}

/** Does a sight line through this cell, between heights ya and yb, get blocked? */
function blocksSight(grid: Grid, cx: number, cy: number, ya: number, yb: number): boolean {
  switch (grid.get(cx, cy)) {
    case Tile.Wall:
      return true;
    case Tile.Cover:
      return Math.min(ya, yb) < LEVEL.coverHeight;
    case Tile.Door:
    case Tile.Exit:
      return Math.max(ya, yb) > LEVEL.doorHeight;
    default:
      return false;
  }
}

/**
 * 3D line of sight between two points. Walls block at any height, low cover blocks below its top,
 * door lintels block above the doorway. A corner squeezed between two blockers is shut.
 */
export function hasLineOfSight(
  grid: Grid,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
): boolean {
  const dy = y1 - y0;
  return !traverseCells(
    grid,
    x0,
    z0,
    x1,
    z1,
    (cx, cy, tIn, tOut) => blocksSight(grid, cx, cy, y0 + dy * tIn, y0 + dy * tOut),
    (ax, ay, bx, by, tc) => {
      const y = y0 + dy * tc;
      return blocksSight(grid, ax, ay, y, y) && blocksSight(grid, bx, by, y, y);
    },
  );
}

/**
 * Can a body walk straight along this segment? Solid cells (walls, cover) block, and so does
 * squeezing diagonally past any solid corner, matching A*'s no-corner-cutting rule.
 */
export function isSegmentWalkable(
  grid: Grid,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
): boolean {
  return !traverseCells(
    grid,
    x0,
    z0,
    x1,
    z1,
    (cx, cy) => grid.isSolid(cx, cy),
    (ax, ay, bx, by) => grid.isSolid(ax, ay) || grid.isSolid(bx, by),
  );
}

/** Like isSegmentWalkable, for a circle of the given radius (centre line plus both side lines). */
export function isCorridorWalkable(
  grid: Grid,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  radius: number,
): boolean {
  const len = Math.hypot(x1 - x0, z1 - z0);
  if (len === 0)
    return !grid.isSolid(Math.floor(x0 / grid.tileSize), Math.floor(z0 / grid.tileSize));
  const px = (-(z1 - z0) / len) * radius;
  const pz = ((x1 - x0) / len) * radius;
  return (
    isSegmentWalkable(grid, x0, z0, x1, z1) &&
    isSegmentWalkable(grid, x0 + px, z0 + pz, x1 + px, z1 + pz) &&
    isSegmentWalkable(grid, x0 - px, z0 - pz, x1 - px, z1 - pz)
  );
}

export interface RayHit {
  /** Distance travelled (m): to the wall face, or maxDist if nothing was hit. */
  dist: number;
  hit: boolean;
  /** Outward normal of the wall face that was hit (x, z); zero when nothing was hit. */
  nx: number;
  nz: number;
}

export function createRayHit(): RayHit {
  return { dist: 0, hit: false, nx: 0, nz: 0 };
}

/**
 * Casts a horizontal ray against walls only (light passes over low cover and through doorways).
 * (dirX, dirZ) must be unit length. Writes into and returns `out`.
 */
export function castRay2D(
  grid: Grid,
  x0: number,
  z0: number,
  dirX: number,
  dirZ: number,
  maxDist: number,
  out: RayHit,
): RayHit {
  const t = grid.tileSize;
  const x1 = x0 + dirX * maxDist;
  const z1 = z0 + dirZ * maxDist;
  out.hit = false;
  out.dist = maxDist;
  out.nx = out.nz = 0;
  const onHit = (cx: number, cy: number, tIn: number): boolean => {
    out.hit = true;
    out.dist = tIn * maxDist;
    // The face we came through is the one whose boundary the entry point lies on.
    const hx = x0 + dirX * out.dist;
    const hz = z0 + dirZ * out.dist;
    const ex = Math.min(Math.abs(hx - cx * t), Math.abs(hx - (cx + 1) * t));
    const ez = Math.min(Math.abs(hz - cy * t), Math.abs(hz - (cy + 1) * t));
    if (ex <= ez) out.nx = dirX > 0 ? -1 : 1;
    else out.nz = dirZ > 0 ? -1 : 1;
    return true;
  };
  traverseCells(
    grid,
    x0,
    z0,
    x1,
    z1,
    (cx, cy, tIn) => grid.get(cx, cy) === Tile.Wall && onHit(cx, cy, tIn),
    (ax, ay, bx, by, tc) => {
      if (grid.get(ax, ay) !== Tile.Wall || grid.get(bx, by) !== Tile.Wall) return false;
      out.hit = true;
      out.dist = tc * maxDist;
      out.nx = -dirX;
      out.nz = -dirZ;
      return true;
    },
  );
  return out;
}
