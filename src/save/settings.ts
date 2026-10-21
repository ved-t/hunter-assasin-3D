// Player settings, persisted through Platform storage. More fields arrive in Phase 1 (sensitivity, invert Y, gyro).

import { isQualitySetting, type QualitySetting } from '../config/quality';
import type { PlatformStorage } from '../platform/platform';

const SETTINGS_KEY = 'settings.v1';

export interface Settings {
  quality: QualitySetting;
}

export const DEFAULT_SETTINGS: Settings = { quality: 'auto' };

export async function loadSettings(storage: PlatformStorage): Promise<Settings> {
  const raw = await storage.get(SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(raw) as Partial<Record<keyof Settings, unknown>>;
    return {
      quality:
        typeof parsed.quality === 'string' && isQualitySetting(parsed.quality)
          ? parsed.quality
          : DEFAULT_SETTINGS.quality,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(storage: PlatformStorage, settings: Settings): Promise<void> {
  await storage.set(SETTINGS_KEY, JSON.stringify(settings));
}
