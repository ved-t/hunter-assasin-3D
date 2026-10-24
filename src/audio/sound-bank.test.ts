import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SAMPLE_FOR } from './game-audio';
import { ambienceKey, parseBankIndex, preferredFormat, SOUND_KEYS, soundUrl } from './sound-bank';

describe('parseBankIndex', () => {
  it('keeps valid entries and drops unknown keys and bad values', () => {
    const index = parseBankIndex({
      sounds: {
        step: { pack: 'sfx', variants: 5 },
        knife: { pack: 'sfx', variants: 0 },
        shot: { pack: '../evil', variants: 1 },
        win: { pack: 'sfx', variants: 1.5 },
        laser: { pack: 'sfx', variants: 1 },
      },
    });
    expect(index.sounds).toEqual({ step: { pack: 'sfx', variants: 5 } });
  });

  it('reads garbage as an empty bank', () => {
    expect(parseBankIndex(null).sounds).toEqual({});
    expect(parseBankIndex({ sounds: 3 }).sounds).toEqual({});
  });
});

describe('sound files', () => {
  it('picks Vorbis where the browser plays it, else AAC', () => {
    expect(preferredFormat(() => 'probably')).toBe('ogg');
    expect(preferredFormat(() => '')).toBe('m4a');
  });

  it('builds page-relative variant paths', () => {
    expect(soundUrl('sfx', 'step', 2, 'm4a')).toBe('assets/audio/sfx/step-2.m4a');
  });

  it('maps each theme to its own ambience', () => {
    expect(
      new Set(['warehouse', 'office', 'mansion'].map((t) => ambienceKey(t as never))).size,
    ).toBe(3);
  });
});

describe('the shipped bank', () => {
  const bank = parseBankIndex(
    JSON.parse(readFileSync('public/assets/audio/bank.json', 'utf8')) as unknown,
  );

  it('has every recording the game asks for, plus both music tracks', () => {
    for (const key of [...Object.values(SAMPLE_FOR), 'step', 'musicMenu', 'musicLevel'] as const) {
      expect(bank.sounds[key], key).toBeDefined();
    }
  });

  it('lists only known sounds', () => {
    const raw = JSON.parse(readFileSync('public/assets/audio/bank.json', 'utf8')) as {
      sounds: Record<string, unknown>;
    };
    for (const key of Object.keys(raw.sounds)) expect(SOUND_KEYS).toContain(key);
  });
});
