import { describe, expect, it } from 'vitest';
import { yawFromDir } from '../core/angles';
import { isMinimapMode, mapRotation, toMap, yawOnMap } from './minimap-math';

const UP = -Math.PI / 2;
const RIGHT = 0;

function project(mode: 'rotating' | 'fixed', yaw: number, dx: number, dz: number) {
  return toMap(mapRotation(mode, yaw), dx, dz, { x: 0, y: 0 });
}

describe('minimap mapping', () => {
  const east = yawFromDir(1, 0);

  it('fixed mode keeps north (−Z) up and east right whatever the player faces', () => {
    for (const yaw of [0, east, 2]) {
      const n = project('fixed', yaw, 0, -5);
      expect(n.x).toBeCloseTo(0);
      expect(n.y).toBeCloseTo(-5);
      const e = project('fixed', yaw, 5, 0);
      expect(e.x).toBeCloseTo(5);
      expect(e.y).toBeCloseTo(0);
    }
  });

  it('rotating mode puts whatever the player faces straight up', () => {
    const ahead = project('rotating', east, 5, 0);
    expect(ahead.x).toBeCloseTo(0);
    expect(ahead.y).toBeCloseTo(-5);
    // Facing east, south (+Z) is on the player's right.
    const right = project('rotating', east, 0, 5);
    expect(right.x).toBeCloseTo(5);
    expect(right.y).toBeCloseTo(0);
  });

  it('rotating and fixed agree when the player faces north', () => {
    const a = project('rotating', 0, 3, -4);
    const b = project('fixed', 0, 3, -4);
    expect(a.x).toBeCloseTo(b.x);
    expect(a.y).toBeCloseTo(b.y);
  });

  it('maps facings to screen angles', () => {
    // Player arrow: always up in rotating mode; along the yaw in fixed mode.
    expect(yawOnMap(mapRotation('rotating', east), east)).toBeCloseTo(UP);
    expect(yawOnMap(mapRotation('fixed', east), east)).toBeCloseTo(RIGHT);
    // A guard facing north, seen by a player facing east, points left on a rotating map.
    expect(Math.abs(yawOnMap(mapRotation('rotating', east), 0))).toBeCloseTo(Math.PI);
  });

  it('validates modes', () => {
    expect(isMinimapMode('fixed')).toBe(true);
    expect(isMinimapMode('spinning')).toBe(false);
    expect(isMinimapMode(1)).toBe(false);
  });
});
