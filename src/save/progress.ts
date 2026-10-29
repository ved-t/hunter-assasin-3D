// Campaign progress, persisted through Platform storage: best stars and time per level and difficulty,
// the difficulty last picked, gems, and the loadout (owned and equipped skins and perk). Every rule is a
// pure function returning a new Progress, and each field is validated on load with a fallback, so a bad
// or older save never breaks the game (a save from before difficulties counts as Medium).

import { CAMPAIGN, type CampaignLevel } from '../config/campaign';
import {
  DEFAULT_DIFFICULTY,
  DIFFICULTIES,
  isDifficulty,
  profileFor,
  type Difficulty,
} from '../config/difficulty';
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

export type LevelRecords = Record<string, LevelRecord>;

export interface Progress {
  /** Won levels, per difficulty. */
  records: Record<Difficulty, LevelRecords>;
  /** The difficulty picked last (and played by Play). Hardcore only once unlocked. */
  difficulty: Difficulty;
  gems: number;
  /** Unlock ids bought (free items are always owned and not listed). */
  owned: string[];
  equipped: Equipped;
}

function noRecords(): Record<Difficulty, LevelRecords> {
  return { easy: {}, medium: {}, hard: {}, hardcore: {} };
}

export function newProgress(): Progress {
  return {
    records: noRecords(),
    difficulty: DEFAULT_DIFFICULTY,
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
  const records = (typeof r.records === 'object' && r.records !== null ? r.records : {}) as Record<
    string,
    unknown
  >;
  for (const d of DIFFICULTIES) parseRecords(records[d], p.records[d]);
  // Saves from before difficulties kept one record per level: that was Medium.
  parseRecords(r.levels, p.records.medium);
  if (isDifficulty(r.difficulty)) p.difficulty = r.difficulty;
  if (p.difficulty === 'hardcore' && !hardcoreUnlocked(p)) p.difficulty = DEFAULT_DIFFICULTY;
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

/** Copy the valid level records in `raw` into `into` (records already there win). */
function parseRecords(raw: unknown, into: LevelRecords): void {
  if (typeof raw !== 'object' || raw === null) return;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    const rec = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;
    const { stars, bestTimeS } = rec;
    if (typeof stars !== 'number' || typeof bestTimeS !== 'number') continue;
    if (!Number.isFinite(bestTimeS) || bestTimeS < 0 || into[id]) continue;
    into[id] = { stars: Math.min(3, Math.max(1, Math.round(stars))), bestTimeS };
  }
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

/** The level's record on difficulty `d` (default: the one picked), or undefined if not yet won there. */
export function levelRecord(
  p: Progress,
  levelId: string,
  d: Difficulty = p.difficulty,
): LevelRecord | undefined {
  return p.records[d][levelId];
}

/**
 * A won mission on difficulty `d`: keep the best rating and time there, and pay gems for beating the
 * previous best on that difficulty.
 */
export function recordWin(
  p: Progress,
  levelId: string,
  stars: number,
  timeS: number,
  d: Difficulty = p.difficulty,
): { progress: Progress; reward: WinReward } {
  const prev = p.records[d][levelId];
  const firstClear = !prev;
  const newStars = Math.max(0, stars - (prev?.stars ?? 0));
  const bestTime = !prev || timeS < prev.bestTimeS;
  const gems =
    newStars * PROGRESSION.gemsPerNewStar + (firstClear ? PROGRESSION.gemsFirstClear : 0);
  const record: LevelRecord = {
    stars: Math.max(stars, prev?.stars ?? 0),
    bestTimeS: bestTime ? timeS : (prev?.bestTimeS ?? timeS),
  };
  const records = { ...p.records, [d]: { ...p.records[d], [levelId]: record } };
  return {
    progress: { ...p, gems: p.gems + gems, records },
    reward: { gems, firstClear, newStars, bestTime },
  };
}

/** Won on at least one difficulty. */
function wonAnywhere(p: Progress, levelId: string): boolean {
  return DIFFICULTIES.some((d) => !!p.records[d][levelId]);
}

/**
 * The first level is always open; every other one opens when the one before it is won, on any
 * difficulty (so a level cleared on Easy can be tried on Hard straight away).
 */
export function isUnlocked(
  p: Progress,
  index: number,
  campaign: readonly CampaignLevel[] = CAMPAIGN,
): boolean {
  if (index <= 0) return index === 0 && campaign.length > 0;
  const before = campaign[index - 1];
  return !!before && wonAnywhere(p, before.id);
}

/** Hardcore opens once every campaign level has been won on Hard (or on Hardcore itself). */
export function hardcoreUnlocked(
  p: Progress,
  campaign: readonly CampaignLevel[] = CAMPAIGN,
): boolean {
  return (
    campaign.length > 0 &&
    campaign.every((l) => !!p.records.hard[l.id] || !!p.records.hardcore[l.id])
  );
}

export function canPlayDifficulty(p: Progress, d: Difficulty): boolean {
  return d !== 'hardcore' || hardcoreUnlocked(p);
}

/** Pick the difficulty Play and the level cards use; a locked Hardcore is refused. */
export function setDifficulty(p: Progress, d: Difficulty): Progress {
  return canPlayDifficulty(p, d) && d !== p.difficulty ? { ...p, difficulty: d } : p;
}

/** What "Play" starts: the first level not yet won on `d`, or the last one once all are. */
export function nextToPlay(
  p: Progress,
  campaign: readonly CampaignLevel[] = CAMPAIGN,
  d: Difficulty = p.difficulty,
): string {
  const open = campaign.find((l) => !p.records[d][l.id]);
  return (open ?? campaign[campaign.length - 1])?.id ?? '';
}

export function totalStars(
  p: Progress,
  campaign: readonly CampaignLevel[] = CAMPAIGN,
  d: Difficulty = p.difficulty,
): number {
  return campaign.reduce((sum, l) => sum + (p.records[d][l.id]?.stars ?? 0), 0);
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

/** What difficulty `d` (default: the one picked) and the equipped perk do to a mission. */
export function modifiersFor(p: Progress, d: Difficulty = p.difficulty): MissionModifiers {
  const { maxHp, visionMult, hearingMult, decayMult, knifeHits } = profileFor(d);
  const m = { ...NO_MODIFIERS, maxHp, visionMult, hearingMult, decayMult, knifeHits };
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
