// How lit the player is: darkness (0.25) up to fully lit (1) inside a lamp pool or a flashlight beam.
// Sim-side and pure: works on the grid and light positions, never on meshes or THREE.Light objects.

import { FLASHLIGHT, LEVEL, LIGHT_EXPOSURE } from '../config/tunables';
import type { Vec2 } from '../level/collision';
import type { Grid } from '../level/grid';
import { hasLineOfSight } from '../nav/los';

const HALF = (FLASHLIGHT.halfAngleDeg * Math.PI) / 180;

/** A flashlight as the sim sees it: lens position, facing and current brightness (0..1). */
export interface BeamLight {
  x: number;
  z: number;
  height: number;
  yaw: number;
  intensity: number;
}

/** 1 inside, falling linearly to 0 across the outer `fraction` of [0, limit]. */
function edgeFalloff(value: number, limit: number, fraction: number): number {
  if (value >= limit) return 0;
  const start = limit * (1 - fraction);
  return value <= start ? 1 : (limit - value) / (limit - start);
}

/** How strongly one beam lights the point (x, z) (0..1). */
export function beamFactor(grid: Grid, beam: BeamLight, x: number, z: number): number {
  if (beam.intensity <= 0) return 0;
  const dx = x - beam.x;
  const dz = z - beam.z;
  const d = Math.hypot(dx, dz);
  if (d > FLASHLIGHT.rangeM) return 0;
  const dot = d > 1e-6 ? (-Math.sin(beam.yaw) * dx - Math.cos(beam.yaw) * dz) / d : 1;
  const angle = Math.acos(Math.min(1, Math.max(-1, dot)));
  if (angle > HALF) return 0;
  const f =
    edgeFalloff(angle, HALF, LIGHT_EXPOSURE.beamEdgeFraction) *
    edgeFalloff(d, FLASHLIGHT.rangeM, LIGHT_EXPOSURE.beamRangeFraction);
  if (f <= 0) return 0;
  const h = LIGHT_EXPOSURE.sampleHeight;
  if (!hasLineOfSight(grid, beam.x, beam.height, beam.z, x, h, z)) return 0;
  return f * beam.intensity;
}

/** How strongly one lamp lights the point (x, z) (0..1). */
export function lampFactor(grid: Grid, lamp: Vec2, x: number, z: number): number {
  const d = Math.hypot(x - lamp.x, z - lamp.z);
  if (d >= LEVEL.lampPoolRadius) return 0;
  const f =
    d <= LIGHT_EXPOSURE.lampFullM
      ? 1
      : (LEVEL.lampPoolRadius - d) / (LEVEL.lampPoolRadius - LIGHT_EXPOSURE.lampFullM);
  const h = LIGHT_EXPOSURE.sampleHeight;
  return hasLineOfSight(grid, lamp.x, LEVEL.lampHeight, lamp.z, x, h, z) ? f : 0;
}

/** Player light exposure at (x, z): the brightest light wins. */
export function lightExposure(
  grid: Grid,
  x: number,
  z: number,
  lamps: readonly Vec2[],
  beams: readonly BeamLight[],
): number {
  let lit = 0;
  for (const lamp of lamps) {
    lit = Math.max(lit, lampFactor(grid, lamp, x, z));
    if (lit >= 1) break;
  }
  for (let i = 0; i < beams.length && lit < 1; i++) {
    lit = Math.max(lit, beamFactor(grid, beams[i] as BeamLight, x, z));
  }
  return LIGHT_EXPOSURE.dark + (LIGHT_EXPOSURE.lit - LIGHT_EXPOSURE.dark) * lit;
}
