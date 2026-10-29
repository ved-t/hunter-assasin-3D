// Difficulty names and order. What each one changes lives in tunables.ts (DIFFICULTY); levels tag the
// guards that only some difficulties get (level/difficulty-variant.ts). Pure, no DOM.

import { DIFFICULTY } from './tunables';

export const DIFFICULTIES = ['easy', 'medium', 'hard', 'hardcore'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export type DifficultyProfile = (typeof DIFFICULTY)[Difficulty];

export const DEFAULT_DIFFICULTY: Difficulty = 'medium';

export const DIFFICULTY_NAMES: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  hardcore: 'Hardcore',
};

export function isDifficulty(v: unknown): v is Difficulty {
  return typeof v === 'string' && (DIFFICULTIES as readonly string[]).includes(v);
}

/** 0 for Easy up to 3 for Hardcore. */
export function difficultyRank(d: Difficulty): number {
  return DIFFICULTIES.indexOf(d);
}

/** Is `d` at least as hard as `min`? */
export function atLeast(d: Difficulty, min: Difficulty): boolean {
  return difficultyRank(d) >= difficultyRank(min);
}

export function profileFor(d: Difficulty): DifficultyProfile {
  return DIFFICULTY[d];
}
