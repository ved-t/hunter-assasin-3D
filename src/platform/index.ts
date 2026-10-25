// Picks and initialises the Platform implementation for the build target (__PLATFORM__, from the Vite
// mode). Each portal adapter is its own chunk, so a build only fetches its own SDK glue. Dev is the
// fallback everywhere: a missing, blocked or failing SDK must never stop the game from booting.

import { DevPlatform, type DevPlatformOptions } from './dev';
import type { Platform } from './platform';

/**
 * Try the target's adapter (`create` returns null when its SDK script didn't load), falling back
 * to `fallback` when it is missing or its init throws. Returns an initialised platform.
 */
export async function initWithFallback(
  create: () => Promise<Platform | null>,
  fallback: () => Platform,
): Promise<Platform> {
  try {
    const platform = await create();
    if (platform) {
      await platform.init();
      return platform;
    }
    console.warn('[platform] SDK unavailable here; using the dev platform');
  } catch (err) {
    console.warn('[platform] SDK init failed; using the dev platform', err);
  }
  const dev = fallback();
  await dev.init();
  return dev;
}

async function createAdapter(): Promise<Platform | null> {
  switch (__PLATFORM__) {
    case 'crazygames': {
      const sdk = window.CrazyGames?.SDK;
      if (!sdk) return null;
      const { CrazyGamesPlatform } = await import('./crazygames');
      return new CrazyGamesPlatform(sdk);
    }
    case 'playgama': {
      const bridge = window.bridge;
      if (!bridge) return null;
      const { PlaygamaPlatform } = await import('./playgama');
      return new PlaygamaPlatform(bridge);
    }
    case 'android': {
      const { Capacitor } = await import('@capacitor/core');
      // A browser preview of dist-android has no native plugins.
      if (!Capacitor.isNativePlatform()) return null;
      const [{ AndroidPlatform }, { AdMob }, { App }, { Preferences }] = await Promise.all([
        import('./android'),
        import('@capacitor-community/admob'),
        import('@capacitor/app'),
        import('@capacitor/preferences'),
      ]);
      return new AndroidPlatform({ admob: AdMob, app: App, preferences: Preferences });
    }
    default:
      return null;
  }
}

export async function createPlatform(opts: DevPlatformOptions): Promise<Platform> {
  if (__PLATFORM__ === 'dev') {
    const dev = new DevPlatform(opts);
    await dev.init();
    return dev;
  }
  return initWithFallback(createAdapter, () => new DevPlatform(opts));
}

export type { Platform } from './platform';
