// URL flags: ?debug=1, ?tier=low|medium|high, ?seed=123, ?level=<id>|perf

import { isQualityTier, type QualityTier } from '../config/quality';
import { DEFAULT_SEED } from '../config/tunables';

const LEVEL_ID = /^[a-z0-9-]+$/;

export interface DebugFlags {
  debug: boolean;
  tier: QualityTier | null;
  seed: number;
  /** Level to play straight away, skipping the menu (`perf` = the Phase 0 performance scene). */
  level: string | null;
}

export function parseDebugFlags(search: string): DebugFlags {
  const params = new URLSearchParams(search);
  const tier = params.get('tier');
  const seed = Number.parseInt(params.get('seed') ?? '', 10);
  const level = params.get('level') ?? '';
  return {
    debug: params.get('debug') === '1',
    tier: tier !== null && isQualityTier(tier) ? tier : null,
    seed: Number.isFinite(seed) ? seed : DEFAULT_SEED,
    level: LEVEL_ID.test(level) ? level : null,
  };
}
