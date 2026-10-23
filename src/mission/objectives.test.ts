import { describe, expect, it } from 'vitest';
import { Grid } from '../level/grid';
import { checkOutcome, objectiveLabel, onExitTile, type ObjectiveInput } from './objectives';
import { starCriteria, starRating, type RunStats } from './stars';

function input(over: Partial<ObjectiveInput> = {}): ObjectiveInput {
  return {
    type: 'reachExit',
    hasItem: false,
    itemTaken: false,
    onExit: false,
    aliveGuards: 2,
    playerDead: false,
    ...over,
  };
}

describe('checkOutcome', () => {
  it('reachExit without an item: won on the exit', () => {
    expect(checkOutcome(input())).toBeNull();
    expect(checkOutcome(input({ onExit: true }))).toBe('won');
  });

  it('reachExit with an item: the exit only counts once it is collected', () => {
    expect(checkOutcome(input({ hasItem: true, onExit: true }))).toBeNull();
    expect(checkOutcome(input({ hasItem: true, itemTaken: true }))).toBeNull();
    expect(checkOutcome(input({ hasItem: true, itemTaken: true, onExit: true }))).toBe('won');
  });

  it('eliminateAll: won when the last guard dies, exits mean nothing', () => {
    expect(checkOutcome(input({ type: 'eliminateAll', onExit: true }))).toBeNull();
    expect(checkOutcome(input({ type: 'eliminateAll', aliveGuards: 1 }))).toBeNull();
    expect(checkOutcome(input({ type: 'eliminateAll', aliveGuards: 0 }))).toBe('won');
  });

  it('dying fails, even on the winning step', () => {
    expect(checkOutcome(input({ playerDead: true, onExit: true }))).toBe('failed');
    expect(checkOutcome(input({ type: 'eliminateAll', aliveGuards: 0, playerDead: true }))).toBe(
      'failed',
    );
  });
});

describe('onExitTile', () => {
  it('is true only on E tiles', () => {
    const grid = Grid.fromRows(['#####', '#.E.#', '#####'], 2);
    expect(onExitTile(grid, { x: 5, z: 3 })).toBe(true);
    expect(onExitTile(grid, { x: 3, z: 3 })).toBe(false);
  });
});

describe('objectiveLabel', () => {
  it('says what to do next', () => {
    expect(objectiveLabel('eliminateAll', false, false, 1, 3)).toMatch(/2\/3/);
    expect(objectiveLabel('reachExit', true, false, 3, 3)).toMatch(/intel/);
    expect(objectiveLabel('reachExit', true, true, 3, 3)).toMatch(/exit/);
    expect(objectiveLabel('reachExit', false, false, 3, 3)).toMatch(/exit/);
  });
});

describe('stars', () => {
  const clean: RunStats = { timeS: 50, kills: 2, detected: false, damaged: false };

  it('one per criterion met', () => {
    expect(starRating(starCriteria(clean, 60))).toBe(3);
    expect(starRating(starCriteria({ ...clean, timeS: 61 }, 60))).toBe(2);
    expect(starRating(starCriteria({ ...clean, damaged: true, timeS: 61 }, 60))).toBe(1);
  });

  it('finishing is always worth at least one', () => {
    const sloppy = { ...clean, detected: true, damaged: true, timeS: 999 };
    expect(starCriteria(sloppy, 60)).toEqual({
      noDetection: false,
      noDamage: false,
      underPar: false,
    });
    expect(starRating(starCriteria(sloppy, 60))).toBe(1);
  });

  it('no par time means no time star', () => {
    expect(starCriteria(clean, undefined).underPar).toBe(false);
    expect(starRating(starCriteria(clean, undefined))).toBe(2);
  });
});
