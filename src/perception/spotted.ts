// The light-spotted test: could the player have noticed this guard right now? In order:
//   1. direct: the guard's body is on screen with grid LOS from the eye;
//   2. light:  a light pool or the beam's midpoint is on screen with LOS (how you track him round corners);
//   3. sound:  his footsteps are within hearing range by path distance (BFS), not straight line.
// Pure: works on the grid and plain poses, never on meshes.

import { PLAYER_HEARING, PLAYER_SIGHT } from '../config/tunables';
import type { Grid } from '../level/grid';
import { BeamRays, castBeamFan } from '../lighting/beam-rays';
import { beamMidpoint, forEachPoolPoint, type Lens } from '../lighting/pool-points';
import { hasLineOfSight } from '../nav/los';
import { inView, type PlayerView } from './view';

export type PerceptKind = 'direct' | 'light' | 'sound';

/** A guard as the player-side test sees it. */
export interface SpotSubject {
  /** Body centre on the floor. */
  x: number;
  z: number;
  /** Ground speed (m/s): footsteps are heard only while moving. */
  speed: number;
  /** Flashlight lens pose, its yaw and its brightness (0..1, flicker included). */
  lens: Lens;
  yaw: number;
  intensity: number;
}

export interface SpotResult {
  kind: PerceptKind | null;
  /** The point that was perceived (body, light or the guard's feet for sound). */
  x: number;
  y: number;
  z: number;
}

export function createSpotResult(): SpotResult {
  return { kind: null, x: 0, y: 0, z: 0 };
}

const rays = new BeamRays();
const mid = { x: 0, y: 0, z: 0 };

/** Visible from the eye: on screen, within range, nothing in the way. */
function sees(grid: Grid, v: PlayerView, x: number, y: number, z: number, maxM: number): boolean {
  if (Math.hypot(x - v.x, y - v.y, z - v.z) > maxM) return false;
  if (!inView(v, x, y, z)) return false;
  return hasLineOfSight(grid, v.x, v.y, v.z, x, y, z);
}

function set(out: SpotResult, kind: PerceptKind, x: number, y: number, z: number): SpotResult {
  out.kind = kind;
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

/**
 * Tests one guard. `soundDist` is the path distance (m) from the player to the guard's cell through
 * cells sound passes (Infinity if unreached). Writes into and returns `out`.
 */
export function spotGuard(
  grid: Grid,
  view: PlayerView,
  g: SpotSubject,
  soundDist: number,
  out: SpotResult = createSpotResult(),
): SpotResult {
  out.kind = null;

  for (const h of PLAYER_SIGHT.bodySampleHeights) {
    if (sees(grid, view, g.x, h, g.z, PLAYER_SIGHT.directMaxM))
      return set(out, 'direct', g.x, h, g.z);
  }

  if (g.intensity >= PLAYER_SIGHT.minLightIntensity) {
    castBeamFan(grid, g.lens.x, g.lens.z, g.yaw, rays);
    const inset = PLAYER_SIGHT.pointInsetM;
    const lit = forEachPoolPoint(g.lens, rays, (p) => {
      // Wall pools sit on the wall face; pull them into the open cell so LOS doesn't clip the wall.
      const x = p.kind === 'wall' ? p.x + (rays.nx[p.ray] as number) * inset : p.x;
      const z = p.kind === 'wall' ? p.z + (rays.nz[p.ray] as number) * inset : p.z;
      if (!sees(grid, view, x, p.y, z, PLAYER_SIGHT.lightMaxM)) return false;
      set(out, 'light', x, p.y, z);
      return true;
    });
    if (lit) return out;
    beamMidpoint(g.lens, rays, mid);
    if (sees(grid, view, mid.x, mid.y, mid.z, PLAYER_SIGHT.lightMaxM)) {
      return set(out, 'light', mid.x, mid.y, mid.z);
    }
  }

  if (g.speed >= PLAYER_HEARING.movingSpeed) {
    const range =
      g.speed >= PLAYER_HEARING.runSpeed ? PLAYER_HEARING.runRangeM : PLAYER_HEARING.walkRangeM;
    if (soundDist <= range) return set(out, 'sound', g.x, 0, g.z);
  }
  return out;
}
