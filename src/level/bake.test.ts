import { describe, expect, it } from 'vitest';
import { KIT, LEVEL } from '../config/tunables';
import { hexToLinear, lampLight, staticAo, type BakeLamp } from './bake';
import { Grid } from './grid';

const T = 2;
const grid = (rows: string[]) => Grid.fromRows(rows, T);
const lampAt = (x: number, z: number): BakeLamp => ({
  x,
  y: LEVEL.lampHeight,
  z,
  r: 1,
  g: 1,
  b: 1,
});
const lightAt = (g: Grid, lamps: BakeLamp[], x: number, y: number, z: number, n = [0, 1, 0]) => {
  const out: [number, number, number] = [0, 0, 0];
  lampLight(g, lamps, x, y, z, n[0] ?? 0, n[1] ?? 0, n[2] ?? 0, out);
  return out[0];
};

describe('hexToLinear', () => {
  it('converts sRGB hex to linear', () => {
    expect(hexToLinear('#ffffff')).toEqual([1, 1, 1]);
    expect(hexToLinear(0x000000)).toEqual([0, 0, 0]);
    expect(hexToLinear('#808080')[0]).toBeCloseTo(0.2158, 3);
  });
});

describe('lampLight', () => {
  const room = grid(['#######', '#.....#', '#.....#', '#.....#', '#######']);

  it('lights the floor under the lamp and fades to nothing at the radius', () => {
    const lamps = [lampAt(7, 5)];
    const under = lightAt(room, lamps, 7, 0, 5);
    const near = lightAt(room, lamps, 8.5, 0, 5);
    expect(under).toBeGreaterThan(0.5);
    expect(near).toBeGreaterThan(0);
    expect(near).toBeLessThan(under);
    expect(lightAt(room, lamps, 7 + KIT.lampBakeRadiusM, 0, 5)).toBe(0);
  });

  it('is blocked by walls', () => {
    const split = grid(['#######', '#..#..#', '#..#..#', '#######']);
    const lamps = [lampAt(3, 3)];
    expect(lightAt(split, lamps, 3, 0, 3)).toBeGreaterThan(0);
    expect(lightAt(split, lamps, 9, 0, 3)).toBe(0);
  });

  it('does not reach surfaces facing away', () => {
    const lamps = [lampAt(7, 5)];
    expect(lightAt(room, lamps, 7, 0, 5, [0, -1, 0])).toBe(0);
  });

  it('lights a wall facing the lamp', () => {
    // East face of the west wall (x = 2), lamp 1.5 m away in the room.
    expect(lightAt(room, [lampAt(3.5, 5)], 2, 1.5, 5, [1, 0, 0])).toBeGreaterThan(0);
  });
});

describe('staticAo', () => {
  const room = grid(['#######', '#.....#', '#.....#', '#.....#', '#######']);

  it('darkens the floor next to walls, not in the open', () => {
    expect(staticAo(room, 7, 0, 5, 0, 1, 0)).toBe(1);
    expect(staticAo(room, 2.05, 0, 5, 0, 1, 0)).toBeLessThan(0.7);
  });

  it('darkens wall bases and inside corners, not the middle of a wall', () => {
    const mid = staticAo(room, 2, 1.5, 5, 1, 0, 0);
    expect(staticAo(room, 2, 0, 5, 1, 0, 0)).toBeLessThan(mid);
    // West wall face next to the north wall (z = 2 is the inside corner).
    expect(staticAo(room, 2, 1.5, 2.05, 1, 0, 0)).toBeLessThan(mid);
    expect(mid).toBe(1);
  });
});
