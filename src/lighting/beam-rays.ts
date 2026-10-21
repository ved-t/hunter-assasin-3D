// The ray fan cast across each flashlight cone. Visuals use it to clip the beam at walls and to place
// light pools where light lands, which is what lets light spill around corners. Pure, no three.js.

import { FLASHLIGHT } from '../config/tunables';
import type { Grid } from '../level/grid';
import { castRay2D, createRayHit } from '../nav/los';

const HALF = (FLASHLIGHT.halfAngleDeg * Math.PI) / 180;
const N: number = FLASHLIGHT.rays;

/**
 * Local horizontal angle of ray i (rad), measured from the beam axis toward local +X (the right).
 * Ray 0 is the leftmost. The beam shader uses the same mapping.
 */
export function rayAngle(i: number): number {
  return N === 1 ? 0 : -HALF + (2 * HALF * i) / (N - 1);
}

export class BeamRays {
  /** Horizontal distance to the first wall along each ray, or the range. */
  readonly lengths = new Float32Array(N);
  /** 1 where the ray hit a wall within range. */
  readonly hit = new Uint8Array(N);
  /** World direction of each ray (unit, x/z) and the hit face normal. */
  readonly dirX = new Float32Array(N);
  readonly dirZ = new Float32Array(N);
  readonly nx = new Float32Array(N);
  readonly nz = new Float32Array(N);
}

const scratch = createRayHit();

/** Casts the fan from (x, z) around `yaw` (three.js convention) into `out`. */
export function castBeamFan(
  grid: Grid,
  x: number,
  z: number,
  yaw: number,
  out: BeamRays,
): BeamRays {
  for (let i = 0; i < N; i++) {
    // A ray at local angle α to the right has world yaw (yaw − α).
    const a = yaw - rayAngle(i);
    const dx = -Math.sin(a);
    const dz = -Math.cos(a);
    castRay2D(grid, x, z, dx, dz, FLASHLIGHT.rangeM, scratch);
    out.lengths[i] = scratch.dist;
    out.hit[i] = scratch.hit ? 1 : 0;
    out.dirX[i] = dx;
    out.dirZ[i] = dz;
    out.nx[i] = scratch.nx;
    out.nz[i] = scratch.nz;
  }
  return out;
}
