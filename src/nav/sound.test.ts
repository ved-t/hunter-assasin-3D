import { describe, expect, it } from 'vitest';
import { Grid } from '../level/grid';
import { createSoundField, createWalkField } from './sound';

const T = 2;
const c = (n: number) => (n + 0.5) * T;

// Two rooms split by a wall column (x = 4) with a door at the bottom (4,5); cover at (2,2).
const rooms = Grid.fromRows(
  ['#########', '#...#...#', '#.c.#...#', '#...#...#', '#...#...#', '#...D...#', '#########'],
  T,
);

describe('sound flood', () => {
  const sound = createSoundField(rooms);

  it('measures straight-line distance in open space', () => {
    expect(sound.pathDistance(c(1), c(3), c(3), c(3), 100)).toBeCloseTo(2 * T);
    expect(sound.pathDistance(c(1), c(3), c(3), c(5), 100)).toBeCloseTo(2 * Math.SQRT2 * T);
  });

  it('goes through the door, not through the wall', () => {
    // Either side of the wall at the top: 2 cells apart in a straight line…
    const straight = 2 * T;
    const d = sound.pathDistance(c(3), c(1), c(5), c(1), 100);
    expect(d).toBeGreaterThan(straight * 3);
    // …but next to the doorway the two sides are close.
    expect(sound.pathDistance(c(3), c(5), c(5), c(5), 100)).toBeCloseTo(2 * T);
  });

  it('a noise that would reach through the wall is not heard around it', () => {
    const radius = 6; // m: 3 cells, enough to cross the wall in a straight line
    expect(sound.pathDistance(c(3), c(1), c(5), c(1), radius)).toBe(Infinity);
    expect(sound.pathDistance(c(3), c(5), c(5), c(5), radius)).toBeLessThanOrEqual(radius);
  });

  it('stops at the radius', () => {
    expect(sound.pathDistance(c(1), c(1), c(3), c(1), 3.9)).toBe(Infinity);
    expect(sound.pathDistance(c(1), c(1), c(3), c(1), 4)).toBeCloseTo(4);
  });

  it('carries over low cover; walking does not', () => {
    const walk = createWalkField(rooms);
    expect(sound.pathDistance(c(1), c(2), c(3), c(2), 100)).toBeCloseTo(2 * T);
    expect(walk.pathDistance(c(1), c(2), c(3), c(2), 100)).toBeGreaterThan(2 * T);
    expect(walk.at(c(2), c(2))).toBe(Infinity); // the crate itself
  });

  it('does not leak diagonally between two wall corners', () => {
    const g = Grid.fromRows(['####', '#.##', '##.#', '####'], T);
    expect(createSoundField(g).pathDistance(c(1), c(1), c(2), c(2), 100)).toBe(Infinity);
  });
});
