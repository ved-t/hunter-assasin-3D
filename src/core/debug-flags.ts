// URL flags: ?debug=1, ?tier=low|medium|high, ?seed=123

import { isQualityTier, type QualityTier } from '../config/quality';
import { DEFAULT_SEED } from '../config/tunables';

export interface DebugFlags {
  debug: boolean;
  tier: QualityTier | null;
  seed: number;
}

export function parseDebugFlags(search: string): DebugFlags {
  const params = new URLSearchParams(search);
  const tier = params.get('tier');
  const seed = Number.parseInt(params.get('seed') ?? '', 10);
  return {
    debug: params.get('debug') === '1',
    tier: tier !== null && isQualityTier(tier) ? tier : null,
    seed: Number.isFinite(seed) ? seed : DEFAULT_SEED,
  };
}
