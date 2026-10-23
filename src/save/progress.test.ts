import { describe, expect, it } from 'vitest';
import type { CampaignLevel } from '../config/campaign';
import { HEALTH, PERKS, PROGRESSION } from '../config/tunables';
import { DEFAULT_GLOVE, DEFAULT_KNIFE, UNLOCKS } from '../config/unlocks';
import { NO_MODIFIERS } from '../mission/modifiers';
import type { PlatformStorage } from '../platform/platform';
import {
  buy,
  equip,
  isUnlocked,
  loadProgress,
  modifiersFor,
  newProgress,
  nextToPlay,
  parseProgress,
  recordWin,
  saveProgress,
  totalStars,
  type Progress,
} from './progress';

function memoryStorage(): PlatformStorage {
  const m = new Map<string, string>();
  return {
    get: async (k) => m.get(k) ?? null,
    set: async (k, v) => void m.set(k, v),
  };
}

const CAMPAIGN: CampaignLevel[] = [
  { id: 'a', name: 'A', theme: 'warehouse' },
  { id: 'b', name: 'B', theme: 'warehouse' },
  { id: 'c', name: 'C', theme: 'office' },
];

const rich = (gems = 1000): Progress => ({ ...newProgress(), gems });

describe('progress storage', () => {
  it('starts empty with the free skins equipped', async () => {
    const p = await loadProgress(memoryStorage());
    expect(p).toEqual(newProgress());
    expect(p.equipped).toEqual({ knife: DEFAULT_KNIFE, glove: DEFAULT_GLOVE, perk: null });
  });

  it('round-trips through storage', async () => {
    const s = memoryStorage();
    let p = recordWin(rich(), 'a', 2, 50).progress;
    p = equip(buy(p, 'perk-regen').progress, 'perk-regen');
    await saveProgress(s, p);
    expect(await loadProgress(s)).toEqual(p);
  });

  it('survives corrupt or hostile saves field by field', async () => {
    const s = memoryStorage();
    await s.set('progress.v1', '{not json');
    expect(await loadProgress(s)).toEqual(newProgress());
    const p = parseProgress({
      gems: -5,
      levels: { a: { stars: 9, bestTimeS: 40 }, b: { stars: 2, bestTimeS: -1 }, c: 'x' },
      owned: ['knife-brass', 'knife-brass', 'nope', 'knife-steel', 7],
      equipped: { knife: 'knife-damascus', glove: 'knife-brass', perk: 'perk-quiet' },
    });
    expect(p.gems).toBe(0);
    expect(p.levels).toEqual({ a: { stars: 3, bestTimeS: 40 } });
    expect(p.owned).toEqual(['knife-brass']);
    // Not owned, or the wrong slot, falls back to the defaults.
    expect(p.equipped).toEqual({ knife: DEFAULT_KNIFE, glove: DEFAULT_GLOVE, perk: null });
  });
});

describe('recordWin', () => {
  it('pays for the first clear and every star', () => {
    const { progress, reward } = recordWin(newProgress(), 'a', 2, 60);
    expect(reward).toEqual({
      gems: 2 * PROGRESSION.gemsPerNewStar + PROGRESSION.gemsFirstClear,
      firstClear: true,
      newStars: 2,
      bestTime: true,
    });
    expect(progress.gems).toBe(reward.gems);
    expect(progress.levels.a).toEqual({ stars: 2, bestTimeS: 60 });
  });

  it('pays only for stars above the best, and keeps the best time', () => {
    const first = recordWin(newProgress(), 'a', 2, 60).progress;
    const worse = recordWin(first, 'a', 1, 70);
    expect(worse.reward.gems).toBe(0);
    expect(worse.progress.levels.a).toEqual({ stars: 2, bestTimeS: 60 });
    const better = recordWin(first, 'a', 3, 50);
    expect(better.reward).toMatchObject({ gems: PROGRESSION.gemsPerNewStar, newStars: 1 });
    expect(better.progress.levels.a).toEqual({ stars: 3, bestTimeS: 50 });
  });

  it('does not change the progress it was given', () => {
    const p = newProgress();
    recordWin(p, 'a', 3, 10);
    expect(p).toEqual(newProgress());
  });
});

describe('campaign flow', () => {
  it('opens each level when the one before it is won', () => {
    let p = newProgress();
    expect(CAMPAIGN.map((_, i) => isUnlocked(p, i, CAMPAIGN))).toEqual([true, false, false]);
    p = recordWin(p, 'a', 1, 30).progress;
    expect(CAMPAIGN.map((_, i) => isUnlocked(p, i, CAMPAIGN))).toEqual([true, true, false]);
    expect(isUnlocked(p, -1, CAMPAIGN)).toBe(false);
  });

  it('plays the first unwon level, then the last once all are won', () => {
    let p = newProgress();
    expect(nextToPlay(p, CAMPAIGN)).toBe('a');
    p = recordWin(p, 'a', 1, 30).progress;
    expect(nextToPlay(p, CAMPAIGN)).toBe('b');
    p = recordWin(recordWin(p, 'b', 3, 30).progress, 'c', 2, 30).progress;
    expect(nextToPlay(p, CAMPAIGN)).toBe('c');
    expect(totalStars(p, CAMPAIGN)).toBe(6);
  });

  it('a full 3-star campaign earns enough to buy the whole catalogue', () => {
    const campaignLevels = 12; // the full campaign from Phase 5b on
    const earned = campaignLevels * (3 * PROGRESSION.gemsPerNewStar + PROGRESSION.gemsFirstClear);
    expect(UNLOCKS.reduce((sum, u) => sum + u.cost, 0)).toBeLessThanOrEqual(earned);
  });
});

describe('loadout', () => {
  it('buys with gems, once', () => {
    const { progress, result } = buy(rich(60), 'knife-brass');
    expect(result).toBe('bought');
    expect(progress.gems).toBe(10);
    expect(buy(progress, 'knife-brass').result).toBe('owned');
    expect(buy(progress, 'knife-steel').result).toBe('owned');
    expect(buy(progress, 'glove-olive').result).toBe('poor');
    expect(buy(progress, 'nope').result).toBe('unknown');
  });

  it('equips only owned items, one per slot, and toggles the perk', () => {
    let p = rich();
    expect(equip(p, 'knife-brass')).toBe(p);
    p = buy(buy(p, 'knife-brass').progress, 'perk-quiet').progress;
    p = buy(p, 'perk-regen').progress;
    p = equip(equip(p, 'knife-brass'), 'perk-quiet');
    expect(p.equipped).toEqual({ knife: 'knife-brass', glove: DEFAULT_GLOVE, perk: 'perk-quiet' });
    p = equip(p, 'perk-regen');
    expect(p.equipped.perk).toBe('perk-regen');
    p = equip(p, 'perk-regen');
    expect(p.equipped.perk).toBeNull();
  });

  it('turns the equipped perk into mission modifiers', () => {
    const p = rich();
    const wear = (id: string) => modifiersFor(equip(buy(p, id).progress, id));
    expect(modifiersFor(p)).toEqual(NO_MODIFIERS);
    expect(wear('perk-quiet').noiseScale).toBe(PERKS.quietStepsNoiseScale);
    expect(wear('perk-regen').regenDelayS).toBe(PERKS.fastRegenDelayS);
    expect(wear('perk-regen').regenDelayS).toBeLessThan(HEALTH.regenDelayS);
    expect(wear('perk-bottle').bonusBottles).toBe(PERKS.extraBottles);
    expect(wear('knife-brass')).toEqual(NO_MODIFIERS);
  });
});
