import { describe, expect, it } from 'vitest';
import { CAMPAIGN as FULL_CAMPAIGN, type CampaignLevel } from '../config/campaign';
import { HEALTH, PERKS, PROGRESSION } from '../config/tunables';
import { DEFAULT_GLOVE, DEFAULT_KNIFE, UNLOCKS } from '../config/unlocks';
import { NO_MODIFIERS } from '../mission/modifiers';
import type { PlatformStorage } from '../platform/platform';
import {
  buy,
  canPlayDifficulty,
  equip,
  hardcoreUnlocked,
  isUnlocked,
  levelRecord,
  loadProgress,
  modifiersFor,
  newProgress,
  nextToPlay,
  parseProgress,
  recordWin,
  saveProgress,
  setDifficulty,
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
    expect(p.records.medium).toEqual({ a: { stars: 3, bestTimeS: 40 } });
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
    expect(levelRecord(progress, 'a')).toEqual({ stars: 2, bestTimeS: 60 });
  });

  it('pays only for stars above the best, and keeps the best time', () => {
    const first = recordWin(newProgress(), 'a', 2, 60).progress;
    const worse = recordWin(first, 'a', 1, 70);
    expect(worse.reward.gems).toBe(0);
    expect(levelRecord(worse.progress, 'a')).toEqual({ stars: 2, bestTimeS: 60 });
    const better = recordWin(first, 'a', 3, 50);
    expect(better.reward).toMatchObject({ gems: PROGRESSION.gemsPerNewStar, newStars: 1 });
    expect(levelRecord(better.progress, 'a')).toEqual({ stars: 3, bestTimeS: 50 });
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
    const earned =
      FULL_CAMPAIGN.length * (3 * PROGRESSION.gemsPerNewStar + PROGRESSION.gemsFirstClear);
    expect(UNLOCKS.reduce((sum, u) => sum + u.cost, 0)).toBeLessThanOrEqual(earned);
  });
});

describe('difficulty', () => {
  const winAll = (p: Progress, d: Parameters<typeof recordWin>[4]) =>
    CAMPAIGN.reduce((q, l) => recordWin(q, l.id, 1, 30, d).progress, p);

  it('starts on Medium and reads a save from before difficulties as Medium', () => {
    expect(newProgress().difficulty).toBe('medium');
    const p = parseProgress({ gems: 5, levels: { a: { stars: 2, bestTimeS: 40 } } });
    expect(p.records.medium).toEqual({ a: { stars: 2, bestTimeS: 40 } });
    expect(p.records.hard).toEqual({});
    expect(p.difficulty).toBe('medium');
  });

  it('keeps a record per difficulty, each paying for its own stars', () => {
    let p = recordWin(newProgress(), 'a', 3, 40).progress;
    const hard = recordWin(p, 'a', 2, 55, 'hard');
    expect(hard.reward.firstClear).toBe(true);
    expect(hard.reward.newStars).toBe(2);
    p = hard.progress;
    expect(levelRecord(p, 'a', 'medium')).toEqual({ stars: 3, bestTimeS: 40 });
    expect(levelRecord(p, 'a', 'hard')).toEqual({ stars: 2, bestTimeS: 55 });
    expect(totalStars(p, CAMPAIGN, 'medium')).toBe(3);
    expect(totalStars(p, CAMPAIGN, 'hard')).toBe(2);
    expect(totalStars(p, CAMPAIGN, 'easy')).toBe(0);
  });

  it('opens a level on every difficulty once the one before is won on any', () => {
    let p = recordWin(newProgress(), 'a', 1, 30, 'easy').progress;
    expect(isUnlocked(p, 1, CAMPAIGN)).toBe(true);
    p = setDifficulty(p, 'hard');
    expect(isUnlocked(p, 1, CAMPAIGN)).toBe(true);
    expect(nextToPlay(p, CAMPAIGN)).toBe('a'); // not yet won on Hard
  });

  it('opens Hardcore once the whole campaign is won on Hard', () => {
    let p = winAll(newProgress(), 'medium');
    expect(hardcoreUnlocked(p, CAMPAIGN)).toBe(false);
    p = recordWin(recordWin(p, 'a', 1, 30, 'hard').progress, 'b', 1, 30, 'hard').progress;
    expect(hardcoreUnlocked(p, CAMPAIGN)).toBe(false);
    p = recordWin(p, 'c', 1, 30, 'hard').progress;
    expect(hardcoreUnlocked(p, CAMPAIGN)).toBe(true);
  });

  it('refuses a locked Hardcore, both picked and loaded', () => {
    const p = newProgress();
    expect(canPlayDifficulty(p, 'hardcore')).toBe(false);
    expect(setDifficulty(p, 'hardcore')).toBe(p);
    expect(setDifficulty(p, 'easy').difficulty).toBe('easy');
    expect(parseProgress({ difficulty: 'hardcore' }).difficulty).toBe('medium');
    expect(parseProgress({ difficulty: 'nightmare' }).difficulty).toBe('medium');
    expect(parseProgress({ difficulty: 'hard' }).difficulty).toBe('hard');
  });

  it('turns the difficulty into mission modifiers, perk on top', () => {
    const p = equip(buy(rich(), 'perk-regen').progress, 'perk-regen');
    const easy = modifiersFor(p, 'easy');
    expect(easy.maxHp).toBe(5);
    expect(easy.visionMult).toBeLessThan(1);
    expect(easy.regenDelayS).toBe(PERKS.fastRegenDelayS);
    const hc = modifiersFor(p, 'hardcore');
    expect(hc.maxHp).toBe(1);
    expect(hc.knifeHits).toBe(2);
    expect(modifiersFor(setDifficulty(p, 'hard')).maxHp).toBe(2);
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
