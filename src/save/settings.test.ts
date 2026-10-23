import { describe, expect, it } from 'vitest';
import { SETTINGS_LIMITS } from '../config/tunables';
import type { PlatformStorage } from '../platform/platform';
import { DEFAULT_SETTINGS, loadSettings, parseSettings, saveSettings } from './settings';

function memoryStorage(): PlatformStorage {
  const m = new Map<string, string>();
  return {
    get: async (k) => m.get(k) ?? null,
    set: async (k, v) => void m.set(k, v),
  };
}

describe('settings', () => {
  it('defaults when nothing is saved', async () => {
    expect(await loadSettings(memoryStorage())).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips through storage', async () => {
    const s = memoryStorage();
    const value = {
      quality: 'low',
      lookSensitivity: 1.7,
      invertY: true,
      gyro: true,
      minimapMode: 'fixed',
      volumeMaster: 0.5,
      volumeSfx: 0.25,
    } as const;
    await saveSettings(s, value);
    expect(await loadSettings(s)).toEqual(value);
  });

  it('keeps valid fields and defaults the rest from an older save', () => {
    expect(parseSettings({ quality: 'high' })).toEqual({ ...DEFAULT_SETTINGS, quality: 'high' });
  });

  it('clamps sensitivity and rejects wrong types', () => {
    expect(parseSettings({ lookSensitivity: 99 }).lookSensitivity).toBe(
      SETTINGS_LIMITS.sensitivityMax,
    );
    expect(parseSettings({ lookSensitivity: -1 }).lookSensitivity).toBe(
      SETTINGS_LIMITS.sensitivityMin,
    );
    expect(
      parseSettings({
        lookSensitivity: NaN,
        invertY: 'yes',
        gyro: 1,
        quality: 'ultra',
        minimapMode: 'spinning',
        volumeMaster: 'loud',
        volumeSfx: Infinity,
      }),
    ).toEqual(DEFAULT_SETTINGS);
  });

  it('clamps volumes to 0..1', () => {
    expect(parseSettings({ volumeMaster: 4, volumeSfx: -1 })).toMatchObject({
      volumeMaster: 1,
      volumeSfx: 0,
    });
  });

  it('survives garbage', async () => {
    const s = memoryStorage();
    await s.set('settings.v1', '{not json');
    expect(await loadSettings(s)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings([1, 2])).toEqual(DEFAULT_SETTINGS);
  });
});
