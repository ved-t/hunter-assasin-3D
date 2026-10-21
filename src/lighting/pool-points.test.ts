import { describe, expect, it } from 'vitest';
import { FLASHLIGHT, LEVEL } from '../config/tunables';
import { yawFromDir } from '../core/angles';
import { Grid } from '../level/grid';
import { BeamRays, castBeamFan } from './beam-rays';
import { beamMidpoint, FLOOR_SAMPLES, forEachPoolPoint, type PoolPoint } from './pool-points';

const T = 2;
const c = (n: number) => (n + 0.5) * T;
const PITCH = (10 * Math.PI) / 180;

// A short room: the east wall is 4 m from the lens, well inside the beam's range.
const room = Grid.fromRows(['#####', '#...#', '#...#', '#...#', '#####'], T);

function collect(lens: { x: number; y: number; z: number; pitch: number }, rays: BeamRays) {
  const pts: PoolPoint[] = [];
  forEachPoolPoint(lens, rays, (p) => void pts.push({ ...p }));
  return pts;
}

describe('forEachPoolPoint', () => {
  const lens = { x: c(1) - 0.9, y: 1.35, z: c(2), pitch: PITCH };
  const rays = castBeamFan(room, lens.x, lens.z, yawFromDir(1, 0), new BeamRays());
  const pts = collect(lens, rays);

  it('puts floor samples on each ray and a wall splash where it hits', () => {
    const floor = pts.filter((p) => p.kind === 'floor');
    const wall = pts.filter((p) => p.kind === 'wall');
    expect(floor).toHaveLength(FLASHLIGHT.rays * FLOOR_SAMPLES.length);
    expect(wall).toHaveLength(FLASHLIGHT.rays);
  });

  it('keeps floor pools short of the wall and wall pools just off it', () => {
    const wallX = 4 * T;
    for (const p of pts) {
      if (p.kind === 'floor') {
        expect(p.x).toBeLessThan(wallX);
        expect(p.y).toBeCloseTo(LEVEL.decalLift * 3);
      } else {
        expect(p.x).toBeCloseTo(wallX - FLASHLIGHT.poolLift);
        expect(p.y).toBeGreaterThan(0);
        expect(p.y).toBeLessThan(LEVEL.wallHeight);
      }
    }
  });

  it('stops when the visitor returns true', () => {
    let n = 0;
    const stopped = forEachPoolPoint(lens, rays, () => ++n === 3);
    expect(stopped).toBe(true);
    expect(n).toBe(3);
  });

  it('drops floor samples where the beam axis would meet the floor before the wall', () => {
    const steep = { ...lens, pitch: (60 * Math.PI) / 180 };
    const axisFloor = steep.y / Math.tan(steep.pitch);
    for (const p of collect(steep, rays)) {
      if (p.kind === 'floor') expect(p.dist).toBeLessThanOrEqual(axisFloor + 1e-9);
      // A steep beam's wall splash is clamped to the bottom band of the wall.
      else expect(p.y).toBeGreaterThanOrEqual(0.4 - 1e-9);
    }
  });
});

describe('beamMidpoint', () => {
  it('lies on the axis halfway to the wall, dropped by the pitch', () => {
    const lens = { x: c(1) - 0.9, y: 1.35, z: c(2), pitch: PITCH };
    const rays = castBeamFan(room, lens.x, lens.z, yawFromDir(1, 0), new BeamRays());
    const mid = beamMidpoint(lens, rays, { x: 0, y: 0, z: 0 });
    const half = (4 * T - lens.x) / 2;
    expect(mid.x).toBeCloseTo(lens.x + half);
    expect(mid.z).toBeCloseTo(lens.z);
    expect(mid.y).toBeCloseTo(lens.y - half * Math.tan(PITCH));
  });
});
