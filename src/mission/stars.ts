// End-of-mission rating: one star per criterion met (no detection, no damage, under par time), and
// finishing is always worth at least one. Pure.

export interface RunStats {
  timeS: number;
  kills: number;
  /** A guard went Alert while he had the player in sight. */
  detected: boolean;
  damaged: boolean;
}

export interface StarCriteria {
  noDetection: boolean;
  noDamage: boolean;
  /** False when the level has no par time. */
  underPar: boolean;
}

export function starCriteria(stats: RunStats, parTimeS: number | undefined): StarCriteria {
  return {
    noDetection: !stats.detected,
    noDamage: !stats.damaged,
    underPar: parTimeS !== undefined && stats.timeS <= parTimeS,
  };
}

export function starRating(c: StarCriteria): 1 | 2 | 3 {
  const met = Number(c.noDetection) + Number(c.noDamage) + Number(c.underPar);
  return Math.min(3, Math.max(1, met)) as 1 | 2 | 3;
}
