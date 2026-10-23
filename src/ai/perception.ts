// Guard-side senses on the grid: how fast the vision gauge fills, what a noise is worth, and the light
// that gives a dead guard away (his dropped flashlight, and a beam landing on his body).
// Pure functions; no meshes, no three.js.

import { BODIES, HEARING, PLAYER_SIGHT, VISION } from '../config/tunables';
import type { Grid } from '../level/grid';
import type { BeamRays } from '../lighting/beam-rays';
import { beamFactor, type BeamLight } from '../lighting/light-sampling';
import { forEachPoolPoint, type Lens } from '../lighting/pool-points';
import { hasLineOfSight } from '../nav/los';
import type { PlayerGait } from '../player/controller';

const HALF_FOV = (VISION.fovDeg * Math.PI) / 360;
const NEAR_HALF_FOV = (VISION.nearFovDeg * Math.PI) / 360;

export interface Viewer {
  x: number;
  z: number;
  /** three.js yaw: forward is (−sin, −cos). */
  yaw: number;
  eyeHeight: number;
}

export interface VisionTarget {
  x: number;
  z: number;
  crouched: boolean;
  gait: PlayerGait;
  /** 0.25 (darkness) … 1 (inside a beam or lamp pool). */
  exposure: number;
}

export interface VisionResult {
  /** Awareness per second this target adds right now (0 if not seen). */
  fillPerS: number;
  /** Fraction of the body sample points with clear LOS (0..1). */
  visibleFraction: number;
  distance: number;
  inNearZone: boolean;
}

export function createVisionResult(): VisionResult {
  return { fillPerS: 0, visibleFraction: 0, distance: 0, inNearZone: false };
}

/** Angle (rad) between the viewer's facing and the direction to (x, z). */
export function angleOff(v: Viewer, x: number, z: number): number {
  const dx = x - v.x;
  const dz = z - v.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) return 0;
  const dot = (-Math.sin(v.yaw) * dx - Math.cos(v.yaw) * dz) / d;
  return Math.acos(Math.min(1, Math.max(-1, dot)));
}

/** Inside the 70° / 14 m cone (ignores walls). */
export function inVisionCone(v: Viewer, x: number, z: number): boolean {
  return Math.hypot(x - v.x, z - v.z) <= VISION.rangeM && angleOff(v, x, z) <= HALF_FOV;
}

/** How fast `target` fills `viewer`'s gauge. Writes into and returns `out`. */
export function visionFill(
  grid: Grid,
  viewer: Viewer,
  target: VisionTarget,
  out: VisionResult = createVisionResult(),
): VisionResult {
  out.fillPerS = 0;
  out.visibleFraction = 0;
  out.inNearZone = false;
  const d = Math.hypot(target.x - viewer.x, target.z - viewer.z);
  out.distance = d;
  if (d > VISION.rangeM) return out;
  const angle = angleOff(viewer, target.x, target.z);
  if (angle > HALF_FOV) return out;

  const heights = target.crouched ? VISION.sampleHeightsCrouch : VISION.sampleHeightsStand;
  let visible = 0;
  for (const h of heights) {
    if (hasLineOfSight(grid, viewer.x, viewer.eyeHeight, viewer.z, target.x, h, target.z)) {
      visible++;
    }
  }
  if (visible === 0) return out;
  out.visibleFraction = visible / heights.length;

  const base =
    VISION.fillNearPerS + (VISION.fillFarPerS - VISION.fillNearPerS) * (d / VISION.rangeM);
  out.inNearZone = d < VISION.nearRangeM && angle <= NEAR_HALF_FOV;
  out.fillPerS =
    base *
    (out.inNearZone ? VISION.nearZoneMult : 1) *
    target.exposure *
    (target.crouched ? VISION.crouchMult : 1) *
    VISION.movementMult[target.gait] *
    out.visibleFraction;
  return out;
}

/**
 * Can the viewer see a stray light (a dropped flashlight): its lens, or any pool of light it casts?
 * `rays` is that flashlight's ray fan. Light reads further than a dark body, so the range is its own.
 */
export function strayLightSeen(grid: Grid, viewer: Viewer, lens: Lens, rays: BeamRays): boolean {
  const sees = (x: number, y: number, z: number) =>
    Math.hypot(x - viewer.x, z - viewer.z) <= BODIES.strayLightRangeM &&
    angleOff(viewer, x, z) <= HALF_FOV &&
    hasLineOfSight(grid, viewer.x, viewer.eyeHeight, viewer.z, x, y, z);
  if (sees(lens.x, lens.y, lens.z)) return true;
  const inset = PLAYER_SIGHT.pointInsetM;
  return forEachPoolPoint(lens, rays, (p) => {
    // Wall pools sit on the wall face; pull them into the open cell so LOS doesn't clip the wall.
    const x = p.kind === 'wall' ? p.x + (rays.nx[p.ray] as number) * inset : p.x;
    const z = p.kind === 'wall' ? p.z + (rays.nz[p.ray] as number) * inset : p.z;
    return sees(x, p.y, z);
  });
}

/** Does the viewer's own flashlight beam fall on the point (x, z), e.g. a body on the floor? */
export function inOwnBeam(grid: Grid, beam: BeamLight, x: number, z: number): boolean {
  return beamFactor(grid, beam, x, z, BODIES.bodySampleHeight) > 0;
}

/** Awareness gained from one noise heard at path distance `pathDist` from a source of `radius`. */
export function hearingGain(pathDist: number, radius: number): number {
  if (!(radius > 0) || pathDist > radius) return 0;
  return HEARING.awarenessPerNoise * (1 - pathDist / radius);
}
