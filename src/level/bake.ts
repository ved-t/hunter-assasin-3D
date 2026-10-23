// Lighting baked into the environment's vertices when a level loads, for zero download bytes: ambient
// occlusion from the grid neighbourhood, and the warm light of each lamp, masked by grid line of sight.
// Pure (no three.js), so the mesh builder calls it per vertex and tests can probe single points.

import { KIT, LEVEL } from '../config/tunables';
import { hasLineOfSight } from '../nav/los';
import type { Grid } from './grid';
import { Tile, type LevelData } from './types';

/** A lamp for baking: world position and linear RGB already scaled by intensity and bake gain. */
export interface BakeLamp {
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 1 at distance 0, easing to 0 at `radius`. */
const falloff = (d: number, radius: number) => {
  const f = 1 - clamp01(d / radius);
  return f * f;
};

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** "#rrggbb" or 0xrrggbb (sRGB) to linear RGB. */
export function hexToLinear(hex: string | number): [number, number, number] {
  const n = typeof hex === 'number' ? hex : Number.parseInt(hex.replace('#', ''), 16);
  return [
    srgbToLinear(((n >> 16) & 255) / 255),
    srgbToLinear(((n >> 8) & 255) / 255),
    srgbToLinear((n & 255) / 255),
  ];
}

export function bakeLamps(level: LevelData, grid: Grid): BakeLamp[] {
  return level.lamps.map((lamp) => {
    const p = grid.gridToWorld(lamp.x, lamp.y);
    const [r, g, b] = hexToLinear(lamp.color ?? LEVEL.lampDefaultColor);
    const k = (lamp.intensity ?? LEVEL.lampDefaultIntensity) * KIT.lampBakeGain;
    return { x: p.x, y: LEVEL.lampHeight, z: p.z, r: r * k, g: g * k, b: b * k };
  });
}

/**
 * Adds the lamp light reaching surface point p (unit normal n) to `out` (linear RGB): wrapped Lambert
 * times a falloff over the horizontal distance (the same footprint gameplay uses for lit zones), zero
 * where the grid blocks the lamp's line of sight.
 */
export function lampLight(
  grid: Grid,
  lamps: readonly BakeLamp[],
  px: number,
  py: number,
  pz: number,
  nx: number,
  ny: number,
  nz: number,
  out: [number, number, number],
): void {
  const o = KIT.bakeNormalOffsetM;
  const qx = px + nx * o;
  const qy = py + ny * o;
  const qz = pz + nz * o;
  const radius = KIT.lampBakeRadiusM;
  const full = KIT.lampBakeFullM;
  const wrap = KIT.lampBakeWrap;
  for (const lamp of lamps) {
    const dx = lamp.x - qx;
    const dy = lamp.y - qy;
    const dz = lamp.z - qz;
    const dh = Math.hypot(dx, dz);
    if (dh >= radius) continue;
    const d = Math.hypot(dh, dy);
    const cos = d > 1e-6 ? (dx * nx + dy * ny + dz * nz) / d : 1;
    const facing = clamp01((cos + wrap) / (1 + wrap));
    if (facing <= 0) continue;
    if (!hasLineOfSight(grid, lamp.x, lamp.y, lamp.z, qx, qy, qz)) continue;
    const up = ny < -0.5 ? KIT.lampBakeCeiling : 1;
    const k = up * facing * (dh <= full ? 1 : falloff(dh - full, radius - full));
    out[0] += lamp.r * k;
    out[1] += lamp.g * k;
    out[2] += lamp.b * k;
  }
}

/** Distance (m) in the floor plane from (x, z) to the square of cell (cx, cy). */
function cellDistance(grid: Grid, x: number, z: number, cx: number, cy: number): number {
  const t = grid.tileSize;
  const dx = Math.max(cx * t - x, 0, x - (cx + 1) * t);
  const dz = Math.max(cy * t - z, 0, z - (cy + 1) * t);
  return Math.hypot(dx, dz);
}

/**
 * Distance from (x, z) to the nearest cell accepted by `occludes`, searched out to `radius`; cells
 * whose centre lies behind the plane through (x, z) with normal (nx, nz) are skipped when the normal
 * is non-zero (a wall face ignores its own wall).
 */
function nearestOccluder(
  grid: Grid,
  x: number,
  z: number,
  nx: number,
  nz: number,
  radius: number,
  occludes: (tile: Tile) => boolean,
): number {
  const t = grid.tileSize;
  let best = radius;
  for (let cy = Math.floor((z - radius) / t); cy <= Math.floor((z + radius) / t); cy++) {
    for (let cx = Math.floor((x - radius) / t); cx <= Math.floor((x + radius) / t); cx++) {
      if (!occludes(grid.get(cx, cy))) continue;
      if ((nx !== 0 || nz !== 0) && ((cx + 0.5) * t - x) * nx + ((cy + 0.5) * t - z) * nz <= 0) {
        continue;
      }
      best = Math.min(best, cellDistance(grid, x, z, cx, cy));
    }
  }
  return best;
}

const floorOccluder = (tile: Tile) => tile === Tile.Wall || tile === Tile.Cover;
const ceilingOccluder = (tile: Tile) => tile === Tile.Wall || tile === Tile.Door;
const wallOccluder = (tile: Tile) => tile === Tile.Wall;

/** Ambient occlusion (1 = fully open) at a static surface point with unit normal n. */
export function staticAo(
  grid: Grid,
  px: number,
  py: number,
  pz: number,
  nx: number,
  ny: number,
  nz: number,
): number {
  const o = KIT.bakeNormalOffsetM;
  const x = px + nx * o;
  const z = pz + nz * o;
  if (ny > 0.5) {
    const d = nearestOccluder(grid, x, z, 0, 0, KIT.floorAoRadiusM, floorOccluder);
    return 1 - LEVEL.floorAo * falloff(d, KIT.floorAoRadiusM);
  }
  if (ny < -0.5) {
    const d = nearestOccluder(grid, x, z, 0, 0, KIT.floorAoRadiusM, ceilingOccluder);
    return 1 - KIT.ceilingAo * falloff(d, KIT.floorAoRadiusM);
  }
  const len = Math.hypot(nx, nz) || 1;
  const d = nearestOccluder(grid, x, z, nx / len, nz / len, KIT.cornerAoM, wallOccluder);
  return (
    (1 - KIT.cornerAo * falloff(d, KIT.cornerAoM)) *
    (1 - KIT.wallBaseAo * falloff(py, KIT.wallBaseAoM)) *
    (1 - KIT.wallTopAo * falloff(LEVEL.wallHeight - py, KIT.wallTopAoM))
  );
}
