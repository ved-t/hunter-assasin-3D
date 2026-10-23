import { describe, expect, it } from 'vitest';
import { Grid } from './grid';
import { cellHash, levelSeed, placeProps } from './props';

const grid = (rows: string[]) => Grid.fromRows(rows, 2);

describe('placeProps', () => {
  it('places one prop per cover cell, deterministically', () => {
    const g = grid(['#####', '#c.c#', '#...#', '#####']);
    const a = placeProps(g, levelSeed('x'), 3);
    expect(a).toHaveLength(2);
    expect(placeProps(g, levelSeed('x'), 3)).toEqual(a);
    expect(a.every((p) => p.variant >= 0 && p.variant < 3)).toBe(true);
  });

  it('faces the only open side', () => {
    // Cover at (1,1) boxed in on three sides; open only to the south (+z) → no turn.
    const g = grid(['###', '#c#', '#.#', '###']);
    expect(placeProps(g, 1, 4)[0]?.quarterTurns).toBe(0);
    // Open only to the east (+x) → one quarter turn.
    const h = grid(['####', '#c.#', '####']);
    expect(placeProps(h, 1, 4)[0]?.quarterTurns).toBe(1);
  });

  it('spreads variants across cells', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 64; i++) seen.add(cellHash(7, i, i * 3) % 3);
    expect(seen.size).toBe(3);
  });
});
