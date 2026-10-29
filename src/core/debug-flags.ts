// URL flags: ?debug=1, ?ads=1 (fake ads on the dev platform), ?tier=low|medium|high, ?seed=123, ?level=<id>|perf,
// ?difficulty=easy|medium|hard|hardcore (for this session, locks ignored)

import { isDifficulty, type Difficulty } from '../config/difficulty';
import { isQualityTier, type QualityTier } from '../config/quality';
import { DEFAULT_SEED } from '../config/tunables';

const LEVEL_ID = /^[a-z0-9-]+$/;

export interface DebugFlags {
  debug: boolean;
  /** Dev platform: show fake ads so the ad pause and revive flow can be tried. */
  ads: boolean;
  tier: QualityTier | null;
  seed: number;
  /** Level to play straight away, skipping the menu (`perf` = the Phase 0 performance scene). */
  level: string | null;
  /** Difficulty to play this session instead of the saved one, until one is picked in level select. */
  difficulty: Difficulty | null;
}

export function parseDebugFlags(search: string): DebugFlags {
  const params = new URLSearchParams(search);
  const tier = params.get('tier');
  const seed = Number.parseInt(params.get('seed') ?? '', 10);
  const level = params.get('level') ?? '';
  const difficulty = params.get('difficulty');
  return {
    debug: params.get('debug') === '1',
    ads: params.get('ads') === '1',
    tier: tier !== null && isQualityTier(tier) ? tier : null,
    seed: Number.isFinite(seed) ? seed : DEFAULT_SEED,
    level: LEVEL_ID.test(level) ? level : null,
    difficulty: isDifficulty(difficulty) ? difficulty : null,
  };
}
