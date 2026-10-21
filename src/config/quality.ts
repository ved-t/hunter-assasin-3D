// Quality tiers. Picked automatically (GPU guess + fps probe), overridable in settings.

export const QUALITY_TIERS = ['low', 'medium', 'high'] as const;
export type QualityTier = (typeof QUALITY_TIERS)[number];
/** What the player chose in settings: a fixed tier, or let the game decide. */
export type QualitySetting = 'auto' | QualityTier;

export interface TierSettings {
  /** devicePixelRatio cap (mobile is additionally capped by DISPLAY.mobileMaxDpr). */
  maxDpr: number;
  /** MSAA. Fixed at context creation; a runtime tier change does not toggle it. */
  antialias: boolean;
  /** Shadow maps. Never on the low tier. */
  shadows: boolean;
  shadowMapSize: number;
  /** Size of the fixed real-SpotLight pool. */
  realSpotLights: number;
  /** How many of those (the nearest) cast shadows; fixed per slot so it never forces a recompile. */
  shadowSpotLights: number;
  /** Dust particles inside real-lit beams. */
  beamDust: boolean;
  /** Vignette / grain / bloom (high tier only, later phases). */
  postFx: boolean;
}

export const TIER_SETTINGS: Record<QualityTier, TierSettings> = {
  low: {
    maxDpr: 1,
    antialias: false,
    shadows: false,
    shadowMapSize: 0,
    realSpotLights: 2,
    shadowSpotLights: 0,
    beamDust: false,
    postFx: false,
  },
  medium: {
    maxDpr: 1.5,
    antialias: true,
    shadows: true,
    shadowMapSize: 512,
    realSpotLights: 3,
    shadowSpotLights: 1,
    beamDust: false,
    postFx: false,
  },
  high: {
    maxDpr: 2,
    antialias: true,
    shadows: true,
    shadowMapSize: 1024,
    realSpotLights: 4,
    shadowSpotLights: 2,
    beamDust: true,
    postFx: true,
  },
};

export function isQualityTier(value: string): value is QualityTier {
  return (QUALITY_TIERS as readonly string[]).includes(value);
}

export function isQualitySetting(value: string): value is QualitySetting {
  return value === 'auto' || isQualityTier(value);
}

/** One tier down, or null if already at the lowest. */
export function lowerTier(tier: QualityTier): QualityTier | null {
  const i = QUALITY_TIERS.indexOf(tier);
  return i > 0 ? (QUALITY_TIERS[i - 1] ?? null) : null;
}
