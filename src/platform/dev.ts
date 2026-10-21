// Dev platform: no ads, localStorage saves, pause on tab hide. Used for local development.

import type { Platform, PlatformStorage, PlatformUser } from './platform';
import { Emitter } from '../core/events';

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

interface PauseEvents {
  pause: void;
  resume: void;
}

export class DevPlatform implements Platform {
  readonly name = 'dev';
  readonly isMobile = detectMobile();
  readonly storage = createWebStorage(safeLocalStorage());
  private readonly events = new Emitter<PauseEvents>();

  constructor(private readonly verbose: boolean) {}

  async init(): Promise<void> {
    document.addEventListener('visibilitychange', () => {
      this.events.emit(document.hidden ? 'pause' : 'resume', undefined);
    });
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
    this.log('showInterstitial (no-op)');
  }

  async showRewarded(): Promise<boolean> {
    this.log('showRewarded (no-op, granted)');
    return true;
  }

  async getUser(): Promise<PlatformUser | null> {
    return null;
  }

  onPause(fn: () => void): () => void {
    return this.events.on('pause', fn);
  }

  onResume(fn: () => void): () => void {
    return this.events.on('resume', fn);
  }

  private log(message: string): void {
    if (this.verbose) console.info(`[platform:dev] ${message}`);
  }
}
