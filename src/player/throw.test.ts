import { describe, expect, it } from 'vitest';
import { BOTTLE, LEVEL } from '../config/tunables';
import { yawFromDir } from '../core/angles';
import { Grid } from '../level/grid';
import { Bottle } from './throw';

const T = 2;
const DT = 1 / 60;
const c = (n: number) => (n + 0.5) * T;

// Long hall (row 1) ending in a wall at column 15; low cover at (5,3); a doorway at (8,5).
const grid = Grid.fromRows(
  [
    '################',
    '#..............#',
    '#..............#',
    '#....c.........#',
    '#..............#',
    '########D#######',
    '#..............#',
    '################',
  ],
  T,
);

function fly(b: Bottle, seconds = BOTTLE.maxFlightS + 1): number {
  for (let t = 0; t < seconds; t += DT) if (b.step(DT, grid)) return t;
  return -1;
}

describe('Bottle', () => {
  it('arcs and lands on the floor some metres ahead when thrown level', () => {
    const b = new Bottle();
    b.launch(c(1), 1.4, c(1), yawFromDir(1, 0), 0);
    expect(fly(b)).toBeGreaterThan(0);
    expect(b.flying).toBe(false);
    expect(b.pos.y).toBe(0);
    expect(b.pos.x - c(1)).toBeGreaterThan(5);
    expect(b.pos.x - c(1)).toBeLessThan(14);
    expect(b.pos.z).toBeCloseTo(c(1));
  });

  it('stops at the wall it hits, on the near side', () => {
    const b = new Bottle();
    b.launch(c(11), 1.4, c(1), yawFromDir(1, 0), 0.2);
    fly(b);
    expect(b.pos.x).toBeLessThan(15 * T);
    expect(b.pos.x).toBeGreaterThan(15 * T - 0.5);
    expect(b.pos.y).toBeGreaterThan(0);
  });

  it('is stopped by low cover below its top but flies over it above', () => {
    const low = new Bottle();
    low.launch(c(2), 0.5, c(3), yawFromDir(1, 0), -0.02);
    fly(low);
    expect(low.pos.x).toBeLessThan(5 * T + 0.01);
    expect(low.pos.y).toBeGreaterThan(0);
    expect(low.pos.y).toBeLessThan(LEVEL.coverHeight);

    const high = new Bottle();
    high.launch(c(2), 1.6, c(3), yawFromDir(1, 0), 0.25);
    fly(high);
    expect(high.pos.x).toBeGreaterThan(6 * T);
  });

  it('passes through a doorway but not its lintel', () => {
    const through = new Bottle();
    through.launch(c(8), 1.2, c(3), yawFromDir(0, 1), -0.1);
    fly(through);
    expect(through.pos.z).toBeGreaterThan(6 * T);

    const lintel = new Bottle();
    lintel.launch(c(8), 2.6, c(4), yawFromDir(0, 1), 0.3);
    fly(lintel);
    expect(lintel.pos.z).toBeLessThan(5 * T + 0.01);
  });
});
