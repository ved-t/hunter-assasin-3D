// Player settings, persisted through Platform storage. Each field is validated on load and falls back
// to its default, so a bad or older save never breaks the game.

import { isQualitySetting, type QualitySetting } from '../config/quality';
import { SETTINGS_LIMITS } from '../config/tunables';
import type { PlatformStorage } from '../platform/platform';
import { isMinimapMode, type MinimapMode } from '../ui/minimap-math';

const SETTINGS_KEY = 'settings.v1';

export interface Settings {
  quality: QualitySetting;
  /** Look sensitivity multiplier for mouse, touch and gyro. */
  lookSensitivity: number;
  invertY: boolean;
  /** Gyro look. Off by default; turning it on asks iOS for motion permission. */
  gyro: boolean;
  /** Rotating keeps the view direction up; fixed keeps north up. */
  minimapMode: MinimapMode;
  /** 0..1: everything, and sound effects (music gets its own slider with the Phase 5d tracks). */
  volumeMaster: number;
  volumeSfx: number;
}

export const DEFAULT_SETTINGS: Settings = {
  quality: 'auto',
  lookSensitivity: SETTINGS_LIMITS.sensitivityDefault,
  invertY: false,
  gyro: false,
  minimapMode: 'rotating',
  volumeMaster: SETTINGS_LIMITS.volumeDefault,
  volumeSfx: SETTINGS_LIMITS.volumeDefault,
};

export function clampSensitivity(v: number): number {
  return Math.min(SETTINGS_LIMITS.sensitivityMax, Math.max(SETTINGS_LIMITS.sensitivityMin, v));
}

export function clampVolume(v: number): number {
  return Math.min(1, Math.max(0, v));
}

const volume = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? clampVolume(v) : fallback;

/** Validate an untrusted parsed object field by field. */
export function parseSettings(raw: unknown): Settings {
  const p = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<
    Record<keyof Settings, unknown>
  >;
  const d = DEFAULT_SETTINGS;
  return {
    quality: typeof p.quality === 'string' && isQualitySetting(p.quality) ? p.quality : d.quality,
    lookSensitivity:
      typeof p.lookSensitivity === 'number' && Number.isFinite(p.lookSensitivity)
        ? clampSensitivity(p.lookSensitivity)
        : d.lookSensitivity,
    invertY: typeof p.invertY === 'boolean' ? p.invertY : d.invertY,
    gyro: typeof p.gyro === 'boolean' ? p.gyro : d.gyro,
    minimapMode: isMinimapMode(p.minimapMode) ? p.minimapMode : d.minimapMode,
    volumeMaster: volume(p.volumeMaster, d.volumeMaster),
    volumeSfx: volume(p.volumeSfx, d.volumeSfx),
  };
}

export async function loadSettings(storage: PlatformStorage): Promise<Settings> {
  const raw = await storage.get(SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    return parseSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(storage: PlatformStorage, settings: Settings): Promise<void> {
  await storage.set(SETTINGS_KEY, JSON.stringify(settings));
}
