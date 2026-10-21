import { describe, expect, it } from 'vitest';
import { FLASHLIGHT, LEVEL, LIGHT_EXPOSURE } from '../config/tunables';
import { yawFromDir } from '../core/angles';
import { Grid } from '../level/grid';
import { BeamRays, castBeamFan, rayAngle } from './beam-rays';
import { flickerIntensity, type FlickerMode } from './flicker';
import { lightExposure, type BeamLight } from './light-sampling';

const T = 2;
const c = (n: number) => (n + 0.5) * T;

// Hall with a wall stub at (6,1..2): the upper half of the cone hits it, the lower half carries on.
const hall = Grid.fromRows(
  [
    '##############',
    '#.....#......#',
    '#.....#......#',
    '#............#',
    '#............#',
    '##############',
  ],
  T,
);

const east = yawFromDir(1, 0);

describe('castBeamFan', () => {
  it('spans the cone from left to right', () => {
    expect(rayAngle(0)).toBeCloseTo((-FLASHLIGHT.halfAngleDeg * Math.PI) / 180);
    expect(rayAngle(FLASHLIGHT.rays - 1)).toBeCloseTo((FLASHLIGHT.halfAngleDeg * Math.PI) / 180);
    expect(rayAngle((FLASHLIGHT.rays - 1) / 2)).toBeCloseTo(0);
  });

  it('casts unit rays around the facing, ray 0 on the left', () => {
    const rays = castBeamFan(hall, c(1), c(2) + 1, east, new BeamRays());
    const mid = (FLASHLIGHT.rays - 1) / 2;
    expect(rays.dirX[mid]).toBeCloseTo(1);
    expect(rays.dirZ[mid]).toBeCloseTo(0);
    // Facing +X, "left" is −Z.
    expect(rays.dirZ[0]).toBeLessThan(0);
    expect(rays.dirZ[FLASHLIGHT.rays - 1]).toBeGreaterThan(0);
    for (let i = 0; i < FLASHLIGHT.rays; i++) {
      expect(Math.hypot(rays.dirX[i]!, rays.dirZ[i]!)).toBeCloseTo(1);
    }
  });

  it('clips rays at walls so light splits around a corner', () => {
    // From the bottom edge of the stub's row band, aimed east: left rays hit the stub, right rays pass.
    const rays = castBeamFan(hall, c(1), 6, east, new BeamRays());
    const left = rays.lengths[0]!;
    const right = rays.lengths[FLASHLIGHT.rays - 1]!;
    expect(rays.hit[0]).toBe(1);
    expect(left).toBeLessThan(6 * T);
    expect([rays.nx[0], rays.nz[0]]).toEqual([-1, 0]);
    expect(right).toBeGreaterThan(left);
  });
});

describe('lightExposure', () => {
  const beam = (over: Partial<BeamLight> = {}): BeamLight => ({
    x: c(1),
    z: c(3),
    height: 1.35,
    yaw: east,
    intensity: 1,
    ...over,
  });

  it('is dark with no lights', () => {
    expect(lightExposure(hall, c(3), c(3), [], [])).toBe(LIGHT_EXPOSURE.dark);
  });

  it('is fully lit in a lamp pool, fading toward its edge', () => {
    const lamp = { x: c(3), z: c(3) };
    expect(lightExposure(hall, lamp.x, lamp.z, [lamp], [])).toBe(LIGHT_EXPOSURE.lit);
    const edge = lightExposure(hall, lamp.x + LEVEL.lampPoolRadius - 0.3, lamp.z, [lamp], []);
    expect(edge).toBeGreaterThan(LIGHT_EXPOSURE.dark);
    expect(edge).toBeLessThan(LIGHT_EXPOSURE.lit);
    expect(lightExposure(hall, lamp.x + LEVEL.lampPoolRadius + 0.01, lamp.z, [lamp], [])).toBe(
      LIGHT_EXPOSURE.dark,
    );
  });

  it('is lit inside a beam, dark beside or behind it', () => {
    expect(lightExposure(hall, c(5), c(3), [], [beam()])).toBe(LIGHT_EXPOSURE.lit);
    expect(lightExposure(hall, c(5), c(3), [], [beam({ yaw: -east })])).toBe(LIGHT_EXPOSURE.dark);
    expect(lightExposure(hall, c(1) + 1, c(4) + 1, [], [beam()])).toBe(LIGHT_EXPOSURE.dark);
  });

  it('a wall shadows the beam', () => {
    // In range and in the cone, but behind the stub.
    const b = beam({ x: c(2), z: c(1) });
    expect(lightExposure(hall, c(7), c(1), [], [b])).toBe(LIGHT_EXPOSURE.dark);
    expect(lightExposure(hall, c(5), c(1), [], [b])).toBe(LIGHT_EXPOSURE.lit);
  });

  it('scales with beam intensity (flicker)', () => {
    const half = lightExposure(hall, c(5), c(3), [], [beam({ intensity: 0.5 })]);
    expect(half).toBeCloseTo((LIGHT_EXPOSURE.dark + LIGHT_EXPOSURE.lit) / 2);
  });
});

describe('flickerIntensity', () => {
  const sample = (mode: FlickerMode, seed: number) =>
    Array.from({ length: 2000 }, (_, i) => flickerIntensity(mode, i / 100, seed));

  it('steady is always full', () => {
    expect(sample('steady', 1).every((v) => v === 1)).toBe(true);
  });

  it('stays in [0, 1] and is deterministic per seed', () => {
    for (const mode of ['battery', 'alertJitter'] as const) {
      const a = sample(mode, 3);
      expect(a.every((v) => v >= 0 && v <= 1)).toBe(true);
      expect(sample(mode, 3)).toEqual(a);
      expect(sample(mode, 4)).not.toEqual(a);
    }
  });

  it('alert jitter wavers but never drops below its depth', () => {
    const a = sample('alertJitter', 5);
    expect(Math.min(...a)).toBeGreaterThanOrEqual(1 - FLASHLIGHT.alertJitterDepth - 1e-9);
    expect(Math.max(...a) - Math.min(...a)).toBeGreaterThan(FLASHLIGHT.alertJitterDepth / 2);
  });

  it('a dying battery dips noticeably now and then', () => {
    const a = sample('battery', 9);
    expect(Math.min(...a)).toBeLessThan(0.6);
    expect(a.filter((v) => v > 0.85).length).toBeGreaterThan(a.length / 3);
  });
});
