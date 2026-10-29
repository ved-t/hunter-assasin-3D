import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, atLeast, difficultyRank, isDifficulty, profileFor } from './difficulty';
import { HEALTH } from './tunables';

describe('difficulty', () => {
  it('orders Easy to Hardcore', () => {
    expect(DIFFICULTIES.map(difficultyRank)).toEqual([0, 1, 2, 3]);
    expect(atLeast('hard', 'medium')).toBe(true);
    expect(atLeast('medium', 'medium')).toBe(true);
    expect(atLeast('easy', 'medium')).toBe(false);
  });

  it('recognises only known names', () => {
    expect(isDifficulty('hardcore')).toBe(true);
    expect(isDifficulty('nightmare')).toBe(false);
    expect(isDifficulty(3)).toBe(false);
  });

  it('Medium is the game as designed', () => {
    const m = profileFor('medium');
    expect(m.maxHp).toBe(HEALTH.maxHp);
    expect([m.visionMult, m.hearingMult, m.decayMult, m.knifeHits, m.guardFactor]).toEqual([
      1, 1, 1, 1, 1,
    ]);
  });

  it('gets harder step by step', () => {
    const p = DIFFICULTIES.map(profileFor);
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1]!;
      const b = p[i]!;
      expect(b.maxHp).toBeLessThan(a.maxHp);
      expect(b.visionMult).toBeGreaterThan(a.visionMult);
      expect(b.hearingMult).toBeGreaterThan(a.hearingMult);
      expect(b.decayMult).toBeLessThan(a.decayMult);
      expect(b.guardFactor).toBeGreaterThan(a.guardFactor);
    }
    expect(profileFor('hardcore').maxHp).toBe(1);
    expect(profileFor('hardcore').knifeHits).toBe(2);
  });
});
