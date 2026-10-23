import { describe, expect, it } from 'vitest';
import { BODIES, GUARD, HEARING, VISION } from '../config/tunables';
import { turnToward, wrapAngle, yawFromCompassDeg, yawFromDir } from '../core/angles';
import { Grid } from '../level/grid';
import { BeamRays, castBeamFan } from '../lighting/beam-rays';
import {
  hearingGain,
  inOwnBeam,
  strayLightSeen,
  inVisionCone,
  visionFill,
  type Viewer,
  type VisionTarget,
} from './perception';

const T = 2;
const c = (n: number) => (n + 0.5) * T;

// Long open hall (rows 1–3) with low cover at (6,2) and a wall pillar at (10,2).
const hall = Grid.fromRows(
  [
    '##################',
    '#................#',
    '#.....c...#......#',
    '#................#',
    '##################',
  ],
  T,
);

/** Guard at cell (1,2) looking east (+X). */
const guard: Viewer = { x: c(1), z: c(2), yaw: yawFromDir(1, 0), eyeHeight: 1.65 };

function target(x: number, z: number, over: Partial<VisionTarget> = {}): VisionTarget {
  return { x, z, crouched: false, gait: 'walk', exposure: 1, ...over };
}

describe('angles', () => {
  it('maps compass degrees and directions to yaw consistently', () => {
    expect(yawFromCompassDeg(0)).toBeCloseTo(0);
    expect(yawFromCompassDeg(90)).toBeCloseTo(yawFromDir(1, 0));
    expect(Math.abs(yawFromCompassDeg(180))).toBeCloseTo(Math.PI);
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
  });

  it('turns the short way round with a capped step', () => {
    expect(turnToward(3, -3, 0.1)).toBeCloseTo(3.1);
    expect(turnToward(0, 0.05, 0.1)).toBeCloseTo(0.05);
  });
});

describe('visionFill', () => {
  it('ignores targets outside the cone or beyond range', () => {
    expect(visionFill(hall, guard, target(c(1), c(3) + 10)).fillPerS).toBe(0); // beside
    expect(visionFill(hall, guard, target(c(0) - 5, c(2))).fillPerS).toBe(0); // behind
    const far = target(guard.x + VISION.rangeM + 0.1, c(1));
    expect(visionFill(hall, guard, far).fillPerS).toBe(0);
    expect(inVisionCone(guard, c(4), c(2))).toBe(true);
  });

  it('respects the 70° cone edge', () => {
    const d = 6;
    const inside = (34 * Math.PI) / 180;
    const outside = (36 * Math.PI) / 180;
    const at = (a: number) => target(guard.x + d * Math.cos(a), guard.z + d * Math.sin(a));
    // ±35° of east, staying inside the open hall.
    expect(inVisionCone(guard, at(inside).x, at(inside).z)).toBe(true);
    expect(inVisionCone(guard, at(outside).x, at(outside).z)).toBe(false);
  });

  it('is blocked by walls', () => {
    expect(visionFill(hall, guard, target(c(12), c(2))).fillPerS).toBe(0);
  });

  it('a crouched player behind low cover is hidden; standing is not', () => {
    const behind = { x: c(7), z: c(2) };
    expect(visionFill(hall, guard, target(behind.x, behind.z, { crouched: true })).fillPerS).toBe(
      0,
    );
    const standing = visionFill(hall, guard, target(behind.x, behind.z));
    expect(standing.fillPerS).toBeGreaterThan(0);
    expect(standing.visibleFraction).toBeLessThan(1); // the low sample is behind the crate
  });

  it('fills faster close up and in the near zone', () => {
    const near = visionFill(hall, guard, target(guard.x + 3, guard.z));
    const mid = visionFill(hall, guard, target(guard.x + 7, c(1)));
    expect(near.inNearZone).toBe(true);
    expect(mid.inNearZone).toBe(false);
    expect(near.fillPerS).toBeGreaterThan(mid.fillPerS);
  });

  it('worst case is about 120/s', () => {
    const r = visionFill(hall, guard, target(guard.x + 0.5, guard.z, { gait: 'run' }));
    expect(r.fillPerS).toBeGreaterThan(110);
    expect(r.fillPerS).toBeLessThan(125);
  });

  it('applies exposure, stance and movement multipliers', () => {
    const at = (over: Partial<VisionTarget>) =>
      visionFill(hall, guard, target(guard.x + 5, c(1), over)).fillPerS;
    const base = at({});
    expect(at({ exposure: 0.25 })).toBeCloseTo(base * 0.25);
    expect(at({ gait: 'still' })).toBeCloseTo(base * VISION.movementMult.still);
    expect(at({ gait: 'run' })).toBeCloseTo(base * VISION.movementMult.run);
    // Crouched in the open (no cover between): only the stance and gait multipliers apply.
    expect(at({ crouched: true, gait: 'crouch' })).toBeCloseTo(
      base * VISION.crouchMult * VISION.movementMult.crouch,
    );
  });
});

describe('hearingGain', () => {
  it('falls linearly with path distance to zero at the radius', () => {
    expect(hearingGain(0, 10)).toBe(HEARING.awarenessPerNoise);
    expect(hearingGain(5, 10)).toBeCloseTo(HEARING.awarenessPerNoise / 2);
    expect(hearingGain(10.1, 10)).toBe(0);
    expect(hearingGain(Infinity, 10)).toBe(0);
    expect(hearingGain(0, 0)).toBe(0);
  });
});

describe('stray light and bodies', () => {
  /** A dropped flashlight on the floor at (x, z), pointing along (dirX, dirZ). */
  function dropped(x: number, z: number, dirX: number, dirZ: number) {
    const yaw = yawFromDir(dirX, dirZ);
    const lens = {
      x,
      y: BODIES.dropLensHeight,
      z,
      pitch: (BODIES.dropLensPitchDeg * Math.PI) / 180,
    };
    return { lens, rays: castBeamFan(hall, x, z, yaw, new BeamRays()) };
  }

  it('sees a dropped light ahead, not one behind the guard or past the pillar', () => {
    const ahead = dropped(c(5), c(1), 0, 1);
    expect(strayLightSeen(hall, guard, ahead.lens, ahead.rays)).toBe(true);
    const behind = { ...guard, yaw: yawFromDir(-1, 0) };
    expect(strayLightSeen(hall, behind, ahead.lens, ahead.rays)).toBe(false);
    // Lens hidden behind the pillar at (10,2), pointing east away from the guard.
    const hidden = dropped(c(11), c(2), 1, 0);
    expect(strayLightSeen(hall, guard, hidden.lens, hidden.rays)).toBe(false);
  });

  it("a guard's own beam lights a body in front of him, not one behind cover or out of range", () => {
    const beam = {
      x: guard.x + GUARD.flashlightForward,
      z: guard.z,
      height: GUARD.flashlightHeight,
      yaw: guard.yaw,
      intensity: 1,
    };
    expect(inOwnBeam(hall, beam, c(4), c(2))).toBe(true);
    expect(inOwnBeam(hall, beam, c(7), c(2))).toBe(false); // right behind the low cover
    expect(inOwnBeam(hall, beam, c(4), c(3) + 0.9)).toBe(false); // outside the 22° cone
    expect(inOwnBeam(hall, beam, c(16), c(1))).toBe(false); // beyond 12 m
  });
});
