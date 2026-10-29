import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../config/difficulty';
import { DIFFICULTY_PAR } from '../config/tunables';
import { guardsFor, levelForDifficulty } from './difficulty-variant';
import { levelFromJson } from './loader';
import type { GuardDef, LevelData } from './types';

const guard = (x: number, minDifficulty?: GuardDef['minDifficulty']): GuardDef => ({
  spawn: { x, y: 1.5 },
  yawDeg: 0,
  waypoints: [],
  ...(minDifficulty ? { minDifficulty } : {}),
});

function template(parTimeS?: number): LevelData {
  return {
    id: 'variant',
    name: 'Variant',
    version: 1,
    tileSize: 2,
    width: 9,
    height: 3,
    tiles: ['#########', '#.......E', '#########'],
    playerSpawn: { x: 1.5, y: 1.5, yawDeg: 90 },
    // Two on every difficulty, one Easy drops, one from Hard, one Hardcore only.
    guards: [
      guard(3.5),
      guard(4.5),
      guard(5.5, 'medium'),
      guard(6.5, 'hard'),
      guard(7.5, 'hardcore'),
    ],
    lamps: [],
    objective: { type: 'reachExit', item: { x: 2.5, y: 1.5 } },
    ...(parTimeS !== undefined ? { parTimeS } : {}),
  };
}

describe('difficulty variants', () => {
  it('puts each tagged guard on its difficulty and up', () => {
    const counts = DIFFICULTIES.map((d) => guardsFor(template().guards, d).length);
    expect(counts).toEqual([2, 3, 4, 5]);
  });

  it('keeps the id and shares the grid', () => {
    const level = levelFromJson(template(90));
    for (const d of DIFFICULTIES) {
      const v = levelForDifficulty(level, d);
      expect(v.data.id).toBe(level.data.id);
      expect(v.grid).toBe(level.grid);
      expect(v.data.tiles).toBe(level.data.tiles);
    }
    expect(level.data.guards).toHaveLength(5); // the template itself is untouched
  });

  it('Medium plays the level as authored, par included', () => {
    const level = levelFromJson(template(90));
    const v = levelForDifficulty(level, 'medium');
    expect(v.data.guards.map((g) => g.spawn.x)).toEqual([3.5, 4.5, 5.5]);
    expect(v.data.parTimeS).toBe(90);
  });

  it('moves par with the guard count, rounded up', () => {
    const level = levelFromJson(template(90));
    const per = DIFFICULTY_PAR.secondsPerGuard;
    const round = (t: number) => Math.ceil(t / DIFFICULTY_PAR.roundToS) * DIFFICULTY_PAR.roundToS;
    expect(levelForDifficulty(level, 'easy').data.parTimeS).toBe(round(90 - per));
    expect(levelForDifficulty(level, 'hardcore').data.parTimeS).toBe(round(90 + 2 * per));
  });

  it('leaves a level without par without one', () => {
    const level = levelFromJson(template());
    expect(levelForDifficulty(level, 'hard').data.parTimeS).toBeUndefined();
  });
});
