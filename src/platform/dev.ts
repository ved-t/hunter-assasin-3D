// Dev platform: no real ads (fake ones with ?ads=1), localStorage saves, pause on tab hide. Used for
// local development and as the fallback when a portal SDK is missing.

import { ADS } from '../config/tunables';
import { BasePlatform } from './base';
import type { PlatformStorage } from './platform';

const STORAGE_PREFIX = 'shadow-hunter:';

/**
 * Storage over a Web Storage backing, falling back to memory when it is missing or throws
 * (private mode, blocked third-party storage inside portal iframes, quota errors).
 */
export function createWebStorage(backing: Storage | null): PlatformStorage {
  const memory = new Map<string, string>();
  return {
    async get(key) {
      const k = STORAGE_PREFIX + key;
      try {
        const value = backing?.getItem(k);
        if (value !== null && value !== undefined) return value;
      } catch {
        // fall through to memory
      }
      return memory.get(k) ?? null;
    },
    async set(key, value) {
      const k = STORAGE_PREFIX + key;
      memory.set(k, value);
      try {
        backing?.setItem(k, value);
      } catch {
        // memory copy already written
      }
    },
  };
}

function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function detectMobile(): boolean {
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
  // iPadOS reports a desktop Mac UA but has multi-touch.
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true;
  return window.matchMedia('(pointer: coarse)').matches;
}

/** A stand-in ad for ?ads=1: a full-screen card for ADS.devFakeAdS, so the pause/mute flow can be seen. */
function fakeAd(label: string): Promise<void> {
  const card = document.createElement('div');
  card.className = 'dev-fake-ad';
  card.textContent = `Fake ${label} ad`;
  document.body.appendChild(card);
  return new Promise((resolve) =>
    setTimeout(() => {
      card.remove();
      resolve();
    }, ADS.devFakeAdS * 1000),
  );
}

export interface DevPlatformOptions {
  /** Log every platform call to the console. */
  verbose: boolean;
  /** Show fake ads instead of skipping them (?ads=1). */
  fakeAds: boolean;
}

export class DevPlatform extends BasePlatform {
  readonly name = 'dev';
  readonly isMobile = detectMobile();
  readonly storage = createWebStorage(safeLocalStorage());
  readonly rewardedAvailable = true;

  constructor(private readonly opts: DevPlatformOptions) {
    super();
  }

  async init(): Promise<void> {
    this.watchPage();
  }

  loadingStart(): void {
    this.log('loadingStart');
  }
  loadingStop(): void {
    this.log('loadingStop');
  }
  gameplayStart(): void {
    this.log('gameplayStart');
  }
  gameplayStop(): void {
    this.log('gameplayStop');
  }

  async showInterstitial(): Promise<void> {
    this.log('showInterstitial');
    if (this.opts.fakeAds) await this.adBreak(() => fakeAd('interstitial'));
  }

  async showRewarded(): Promise<boolean> {
    this.log('showRewarded (granted)');
    if (this.opts.fakeAds) await this.adBreak(() => fakeAd('rewarded'));
    return true;
  }

  override happyTime(): void {
    this.log('happyTime');
  }

  private log(message: string): void {
    if (this.opts.verbose) console.info(`[platform:dev] ${message}`);
  }
}
