// Campaign progress, persisted through Platform storage: best stars and time per level, gems, and the
// loadout (owned and equipped skins and perk). Every rule is a pure function returning a new Progress, and
// each field is validated on load with a fallback, so a bad or older save never breaks the game.

import { CAMPAIGN, type CampaignLevel } from '../config/campaign';
import { PERKS, PROGRESSION } from '../config/tunables';
import { DEFAULT_GLOVE, DEFAULT_KNIFE, unlockById } from '../config/unlocks';
import { NO_MODIFIERS, type MissionModifiers } from '../mission/modifiers';
import type { PlatformStorage } from '../platform/platform';

const PROGRESS_KEY = 'progress.v1';

export interface LevelRecord {
  /** Best rating so far (1..3); a record exists only once the level has been won. */
  stars: number;
  bestTimeS: number;
}

export interface Equipped {
  knife: string;
  glove: string;
  perk: string | null;
}

export interface Progress {
  levels: Record<string, LevelRecord>;
  gems: number;
  /** Unlock ids bought (free items are always owned and not listed). */
  owned: string[];
  equipped: Equipped;
}

export function newProgress(): Progress {
  return {
    levels: {},
    gems: 0,
    owned: [],
    equipped: { knife: DEFAULT_KNIFE, glove: DEFAULT_GLOVE, perk: null },
  };
}

export function owns(p: Progress, id: string): boolean {
  const item = unlockById(id);
  return !!item && (item.cost === 0 || p.owned.includes(id));
}

/** Validate an untrusted parsed object field by field. */
export function parseProgress(raw: unknown): Progress {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const p = newProgress();
  if (typeof r.gems === 'number' && Number.isFinite(r.gems))
    p.gems = Math.max(0, Math.floor(r.gems));
  if (typeof r.levels === 'object' && r.levels !== null) {
    for (const [id, v] of Object.entries(r.levels as Record<string, unknown>)) {
      const rec = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;
      const { stars, bestTimeS } = rec;
      if (typeof stars !== 'number' || typeof bestTimeS !== 'number') continue;
      if (!Number.isFinite(bestTimeS) || bestTimeS < 0) continue;
      p.levels[id] = { stars: Math.min(3, Math.max(1, Math.round(stars))), bestTimeS };
    }
  }
  if (Array.isArray(r.owned)) {
    p.owned = [...new Set(r.owned.filter((id): id is string => typeof id === 'string'))].filter(
      (id) => (unlockById(id)?.cost ?? 0) > 0,
    );
  }
  const e = (typeof r.equipped === 'object' && r.equipped !== null ? r.equipped : {}) as Record<
    string,
    unknown
  >;
  const pick = (v: unknown, kind: 'knife' | 'glove'): string | null =>
    typeof v === 'string' && unlockById(v)?.kind === kind && owns(p, v) ? v : null;
  p.equipped.knife = pick(e.knife, 'knife') ?? DEFAULT_KNIFE;
  p.equipped.glove = pick(e.glove, 'glove') ?? DEFAULT_GLOVE;
  p.equipped.perk =
    typeof e.perk === 'string' && unlockById(e.perk)?.kind === 'perk' && owns(p, e.perk)
      ? e.perk
      : null;
  return p;
}

export async function loadProgress(storage: PlatformStorage): Promise<Progress> {
  const raw = await storage.get(PROGRESS_KEY);
  if (!raw) return newProgress();
  try {
    return parseProgress(JSON.parse(raw));
  } catch {
    return newProgress();
  }
}

export async function saveProgress(storage: PlatformStorage, p: Progress): Promise<void> {
  await storage.set(PROGRESS_KEY, JSON.stringify(p));
}

export interface WinReward {
  gems: number;
  firstClear: boolean;
  /** Stars above the previous best. */
  newStars: number;
  bestTime: boolean;
}

/** A won mission: keep the best rating and time, and pay gems for beating the previous best. */
export function recordWin(
  p: Progress,
  levelId: string,
  stars: number,
  timeS: number,
): { progress: Progress; reward: WinReward } {
  const prev = p.levels[levelId];
  const firstClear = !prev;
  const newStars = Math.max(0, stars - (prev?.stars ?? 0));
  const bestTime = !prev || timeS < prev.bestTimeS;
  const gems =
    newStars * PROGRESSION.gemsPerNewStar + (firstClear ? PROGRESSION.gemsFirstClear : 0);
  const record: LevelRecord = {
    stars: Math.max(stars, prev?.stars ?? 0),
    bestTimeS: bestTime ? timeS : (prev?.bestTimeS ?? timeS),
  };
  return {
    progress: { ...p, gems: p.gems + gems, levels: { ...p.levels, [levelId]: record } },
    reward: { gems, firstClear, newStars, bestTime },
  };
}

/** The first level is always open; every other one opens when the one before it is won. */
export function isUnlocked(
  p: Progress,
  index: number,
  campaign: readonly CampaignLevel[] = CAMPAIGN,
): boolean {
  if (index <= 0) return index === 0 && campaign.length > 0;
  const before = campaign[index - 1];
  return !!before && !!p.levels[before.id];
}

/** What "Play" starts: the first level not yet won, or the last one once all are. */
export function nextToPlay(p: Progress, campaign: readonly CampaignLevel[] = CAMPAIGN): string {
  const open = campaign.find((l) => !p.levels[l.id]);
  return (open ?? campaign[campaign.length - 1])?.id ?? '';
}

export function totalStars(p: Progress, campaign: readonly CampaignLevel[] = CAMPAIGN): number {
  return campaign.reduce((sum, l) => sum + (p.levels[l.id]?.stars ?? 0), 0);
}

export type BuyResult = 'bought' | 'owned' | 'poor' | 'unknown';

export function buy(p: Progress, id: string): { progress: Progress; result: BuyResult } {
  const item = unlockById(id);
  if (!item) return { progress: p, result: 'unknown' };
  if (owns(p, id)) return { progress: p, result: 'owned' };
  if (p.gems < item.cost) return { progress: p, result: 'poor' };
  return {
    progress: { ...p, gems: p.gems - item.cost, owned: [...p.owned, id] },
    result: 'bought',
  };
}

/** Equip an owned item in its slot. For perks, equipping the one already worn takes it off. */
export function equip(p: Progress, id: string): Progress {
  const item = unlockById(id);
  if (!item || !owns(p, id)) return p;
  const e = { ...p.equipped };
  if (item.kind === 'perk') e.perk = e.perk === id ? null : id;
  else e[item.kind] = id;
  return { ...p, equipped: e };
}

/** What the equipped perk does to a mission. */
export function modifiersFor(p: Progress): MissionModifiers {
  const m = { ...NO_MODIFIERS };
  switch (p.equipped.perk) {
    case 'perk-quiet':
      m.noiseScale = PERKS.quietStepsNoiseScale;
      break;
    case 'perk-regen':
      m.regenDelayS = PERKS.fastRegenDelayS;
      break;
    case 'perk-bottle':
      m.bonusBottles = PERKS.extraBottles;
      break;
  }
  return m;
}
