// A level file is a template; each difficulty plays its own concrete level made from it. Guards tagged
// with a minDifficulty appear only from that difficulty up, and the par time moves with the guard count.
// Everything downstream (Mission, the scene, the HUD) sees only the concrete level. A level generator
// can produce templates (or concrete levels) for the same seam.

import { DEFAULT_DIFFICULTY, atLeast, type Difficulty } from '../config/difficulty';
import { DIFFICULTY_PAR } from '../config/tunables';
import type { LoadedLevel } from './loader';
import type { GuardDef, LevelData } from './types';

/** The guards that difficulty `d` puts in the level. */
export function guardsFor(guards: readonly GuardDef[], d: Difficulty): GuardDef[] {
  return guards.filter((g) => atLeast(d, g.minDifficulty ?? 'easy'));
}

/** Par time for a variant with `guards` guards, from the level's par for its Medium guard count. */
export function variantParTimeS(data: LevelData, guards: number): number | undefined {
  const par = data.parTimeS;
  if (par === undefined) return undefined;
  const delta = guards - guardsFor(data.guards, DEFAULT_DIFFICULTY).length;
  if (delta === 0) return par;
  const raw = par + delta * DIFFICULTY_PAR.secondsPerGuard[data.objective.type];
  return Math.max(
    DIFFICULTY_PAR.roundToS,
    Math.ceil(raw / DIFFICULTY_PAR.roundToS) * DIFFICULTY_PAR.roundToS,
  );
}

/** The concrete level difficulty `d` plays. Same id and Grid; only guards and par differ. */
export function levelForDifficulty(level: LoadedLevel, d: Difficulty): LoadedLevel {
  const guards = guardsFor(level.data.guards, d);
  const data: LevelData = { ...level.data, guards };
  const par = variantParTimeS(level.data, guards.length);
  if (par !== undefined) data.parTimeS = par;
  return { data, grid: level.grid };
}
