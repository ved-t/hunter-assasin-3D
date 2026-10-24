// Recorded sounds, lazily fetched and decoded by pack (shared SFX, the two music tracks, one ambience
// loop per theme). bank.json, written by scripts/assets/build-audio.mjs, says which pack holds each
// sound and how many variants it has. Files can be fetched before the AudioContext exists (the menu
// loads before the first tap); they are decoded once it does. Anything missing or still loading reads
// as null, and callers fall back to the synth.

import { ASSET_FILES } from '../config/tunables';
import type { Theme } from '../level/types';

export const SOUND_KEYS = [
  'step',
  'knife',
  'windup',
  'shot',
  'hurt',
  'throw',
  'shatter',
  'pickup',
  'win',
  'fail',
  'musicMenu',
  'musicLevel',
  'ambWarehouse',
  'ambOffice',
  'ambMansion',
] as const;
export type SoundKey = (typeof SOUND_KEYS)[number];

export type AudioFormat = 'ogg' | 'm4a';

export interface BankIndex {
  sounds: Partial<Record<SoundKey, { pack: string; variants: number }>>;
}

/** The ambience loop of a theme. */
export function ambienceKey(theme: Theme): SoundKey {
  return theme === 'office' ? 'ambOffice' : theme === 'mansion' ? 'ambMansion' : 'ambWarehouse';
}

/** Validates bank.json field by field; unknown keys and bad entries are dropped. */
export function parseBankIndex(raw: unknown): BankIndex {
  const out: BankIndex = { sounds: {} };
  const sounds = (raw as { sounds?: unknown } | null)?.sounds;
  if (typeof sounds !== 'object' || sounds === null) return out;
  for (const key of SOUND_KEYS) {
    const e = (sounds as Record<string, unknown>)[key] as
      { pack?: unknown; variants?: unknown } | undefined;
    if (
      typeof e?.pack === 'string' &&
      /^[a-z0-9-]+$/.test(e.pack) &&
      typeof e.variants === 'number' &&
      Number.isInteger(e.variants) &&
      e.variants > 0
    ) {
      out.sounds[key] = { pack: e.pack, variants: e.variants };
    }
  }
  return out;
}

/** Published path of one variant (relative to the page). */
export function soundUrl(
  pack: string,
  key: SoundKey,
  variant: number,
  format: AudioFormat,
): string {
  return `${ASSET_FILES.audioDir}${pack}/${key}-${variant}.${format}`;
}

/** Ogg Vorbis where the browser says it plays it, else AAC (Safari). */
export function preferredFormat(canPlayType: (type: string) => string): AudioFormat {
  return canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'm4a';
}

export class SoundBank {
  private ctx: BaseAudioContext | null = null;
  private index: Promise<BankIndex> | null = null;
  private readonly buffers = new Map<SoundKey, AudioBuffer[]>();
  private readonly packs = new Map<string, Promise<void>>();
  /** Fetched before there was a context to decode with. */
  private readonly undecoded: {
    key: SoundKey;
    data: ArrayBuffer;
    fallback: () => Promise<ArrayBuffer>;
  }[] = [];

  constructor(private readonly format: AudioFormat) {}

  /** The context exists (first user gesture): decode everything fetched so far. */
  setContext(ctx: BaseAudioContext): void {
    this.ctx = ctx;
    for (const u of this.undecoded.splice(0)) void this.decode(u.key, u.data, u.fallback);
  }

  /** A loaded variant picked by `random` (0..1), or null if none is ready. */
  get(key: SoundKey, random: number): AudioBuffer | null {
    const list = this.buffers.get(key);
    if (!list || list.length === 0) return null;
    return list[Math.min(list.length - 1, Math.floor(random * list.length))] ?? null;
  }

  has(key: SoundKey): boolean {
    return (this.buffers.get(key)?.length ?? 0) > 0;
  }

  /** Fetches the pack holding `key` once (no-op if the bank has no such sound). */
  loadFor(key: SoundKey): Promise<void> {
    return this.loadIndex().then((index) => {
      const entry = index.sounds[key];
      return entry ? this.loadPack(entry.pack) : undefined;
    });
  }

  /** Fetches every sound of a pack once. Failures are logged and leave the synth in place. */
  loadPack(pack: string): Promise<void> {
    let pending = this.packs.get(pack);
    if (!pending) {
      pending = this.loadIndex()
        .then((index) =>
          Promise.all(
            SOUND_KEYS.flatMap((key) => {
              const e = index.sounds[key];
              if (e?.pack !== pack) return [];
              return Array.from({ length: e.variants }, (_, i) => this.fetchVariant(pack, key, i));
            }),
          ),
        )
        .then(() => undefined)
        .catch((err: unknown) => console.warn(`[audio] pack "${pack}" not loaded:`, err));
      this.packs.set(pack, pending);
    }
    return pending;
  }

  private loadIndex(): Promise<BankIndex> {
    this.index ??= fetch(`${ASSET_FILES.audioDir}bank.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`bank.json: HTTP ${res.status}`);
        return res.json() as Promise<unknown>;
      })
      .then(parseBankIndex)
      .catch((err: unknown) => {
        console.warn('[audio] no sound bank, synth only:', err);
        return { sounds: {} };
      });
    return this.index;
  }

  private async fetchVariant(pack: string, key: SoundKey, i: number): Promise<void> {
    const get = async (format: AudioFormat) => {
      const res = await fetch(soundUrl(pack, key, i, format));
      if (!res.ok) throw new Error(`${key}-${i}.${format}: HTTP ${res.status}`);
      return res.arrayBuffer();
    };
    // If the preferred format won't decode after all, the other one is tried once.
    const fallback = () => get(this.format === 'ogg' ? 'm4a' : 'ogg');
    const data = await get(this.format);
    if (this.ctx) await this.decode(key, data, fallback);
    else this.undecoded.push({ key, data, fallback });
  }

  private async decode(
    key: SoundKey,
    data: ArrayBuffer,
    fallback: () => Promise<ArrayBuffer>,
  ): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    let buffer: AudioBuffer;
    try {
      buffer = await ctx.decodeAudioData(data);
    } catch {
      try {
        buffer = await ctx.decodeAudioData(await fallback());
      } catch (err) {
        console.warn(`[audio] ${key} did not decode:`, err);
        return;
      }
    }
    const list = this.buffers.get(key) ?? [];
    list.push(buffer);
    this.buffers.set(key, list);
  }
}
