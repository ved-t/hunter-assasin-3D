// Which prop variant stands on each cover cell, and which way it faces. Pure and deterministic per
// level, so a level always looks the same; no three.js.

import type { Grid } from './grid';
import { Tile } from './types';

export interface PropPlacement {
  cx: number;
  cy: number;
  variant: number;
  /** Turns of 90° about +Y (counter-clockwise from above); 0 leaves the prop's front facing +Z. */
  quarterTurns: number;
}

/** 32-bit hash of a cell, mixed with a per-level seed. */
export function cellHash(seed: number, cx: number, cy: number): number {
  let h =
    Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^
    Math.imul(cx, 0xc2b2ae35) ^
    Math.imul(cy, 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return (h ^ (h >>> 15)) >>> 0;
}

/** FNV-1a of a level id, as the prop seed. */
export function levelSeed(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** Quarter turns that point a prop's +Z front at each grid direction. */
const FACING: readonly [number, number, number][] = [
  [0, 1, 0],
  [1, 0, 1],
  [0, -1, 2],
  [-1, 0, 3],
];

/**
 * One placement per cover cell. The front faces an open neighbour where there is one (sofas and desks
 * face the room), picked by the cell hash among the open sides.
 */
export function placeProps(grid: Grid, seed: number, variants: number): PropPlacement[] {
  const out: PropPlacement[] = [];
  if (variants <= 0) return out;
  for (let cy = 0; cy < grid.height; cy++) {
    for (let cx = 0; cx < grid.width; cx++) {
      if (grid.get(cx, cy) !== Tile.Cover) continue;
      const h = cellHash(seed, cx, cy);
      const open = FACING.filter(([dx, dz]) => !grid.isSolid(cx + dx, cy + dz));
      const pick = open.length > 0 ? open[(h >>> 8) % open.length] : FACING[(h >>> 8) % 4];
      out.push({ cx, cy, variant: h % variants, quarterTurns: pick?.[2] ?? 0 });
    }
  }
  return out;
}
