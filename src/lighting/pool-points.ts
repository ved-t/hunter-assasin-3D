// Where each flashlight's light lands: floor samples along every ray and a splash where a ray hits a
// wall. PoolMesh draws a soft quad at each point, and player perception tests the same points, so the
// player is credited with seeing exactly the light that is drawn. Pure, no three.js.

import { FLASHLIGHT, LEVEL } from '../config/tunables';
import type { BeamRays } from './beam-rays';

const RAYS: number = FLASHLIGHT.rays;
/** Floor samples per ray: a near one and a far one, so the pool reads as a fan, not a row of dots. */
export const FLOOR_SAMPLES = [0.55, 1] as const;
/** Keep floor pools this far short of the wall a ray hits (m). */
const WALL_GAP = 0.3;
/** Wall pools stay inside this band of the wall's height (m from floor / top). */
const WALL_MARGIN = 0.4;
/** Floor pools float this far above the floor (m). */
const FLOOR_Y = LEVEL.decalLift * 3;

export interface PoolPoint {
  kind: 'floor' | 'wall';
  /** Centre of the pool; wall pools already stand FLASHLIGHT.poolLift off the wall. */
  x: number;
  y: number;
  z: number;
  /** Horizontal distance the light travelled along its ray (m). */
  dist: number;
  /** Index of the ray in the fan (for its direction and hit normal). */
  ray: number;
}

export interface Lens {
  x: number;
  y: number;
  z: number;
  /** Tilt below level (rad). */
  pitch: number;
}

const point: PoolPoint = { kind: 'floor', x: 0, y: 0, z: 0, dist: 0, ray: 0 };

/**
 * Visits every pool point of one flashlight, floor samples then the wall splash for each ray in turn.
 * The visitor gets a reused object; return true to stop early. Returns true if a visitor stopped it.
 */
export function forEachPoolPoint(
  lens: Lens,
  rays: BeamRays,
  visit: (p: Readonly<PoolPoint>) => boolean | void,
): boolean {
  const tanPitch = Math.tan(lens.pitch);
  // Where the beam's axis meets the floor.
  const axisFloor = tanPitch > 0 ? lens.y / tanPitch : FLASHLIGHT.floorMaxM;
  for (let i = 0; i < RAYS; i++) {
    const len = rays.lengths[i] as number;
    const dx = rays.dirX[i] as number;
    const dz = rays.dirZ[i] as number;
    point.ray = i;
    // Floor: near and far samples along the ray, short of any wall.
    const reach = Math.min(axisFloor, len - WALL_GAP, FLASHLIGHT.floorMaxM);
    if (reach > 0) {
      for (const f of FLOOR_SAMPLES) {
        const d = reach * f;
        point.kind = 'floor';
        point.x = lens.x + dx * d;
        point.y = FLOOR_Y;
        point.z = lens.z + dz * d;
        point.dist = d;
        if (visit(point)) return true;
      }
    }
    // Wall: a splash where the ray hits, at the height the beam axis would reach.
    if (rays.hit[i]) {
      point.kind = 'wall';
      point.x = lens.x + dx * len + (rays.nx[i] as number) * FLASHLIGHT.poolLift;
      point.y = Math.min(
        Math.max(lens.y - len * tanPitch, WALL_MARGIN),
        LEVEL.wallHeight - WALL_MARGIN,
      );
      point.z = lens.z + dz * len + (rays.nz[i] as number) * FLASHLIGHT.poolLift;
      point.dist = len;
      if (visit(point)) return true;
    }
  }
  return false;
}

/** The beam axis halfway to where its centre ray stops. Writes into and returns `out`. */
export function beamMidpoint(
  lens: Lens,
  rays: BeamRays,
  out: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  const mid = (RAYS - 1) >> 1;
  const tanPitch = Math.tan(lens.pitch);
  const axisFloor = tanPitch > 0 ? lens.y / tanPitch : Infinity;
  const d = Math.min(rays.lengths[mid] as number, axisFloor) / 2;
  out.x = lens.x + (rays.dirX[mid] as number) * d;
  out.y = lens.y - d * tanPitch;
  out.z = lens.z + (rays.dirZ[mid] as number) * d;
  return out;
}
