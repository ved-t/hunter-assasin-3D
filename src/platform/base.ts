// Shared host-pause plumbing for every platform. Several things can hold the game paused at once (the
// tab hidden, focus gone from the portal iframe, an ad showing); the game hears one pause when the first
// starts and one resume when the last ends, so an ad finishing in a hidden tab doesn't resume it.

import { Emitter } from '../core/events';
import type { Platform, PlatformStorage, PlatformUser } from './platform';

export type HoldReason = 'hidden' | 'blur' | 'ad' | 'host';

interface HostEvents {
  pause: void;
  resume: void;
  mute: boolean;
  back: void;
}

export class PauseHolds {
  private readonly holds = new Set<HoldReason>();

  constructor(private readonly onChange: (paused: boolean) => void) {}

  get paused(): boolean {
    return this.holds.size > 0;
  }

  set(reason: HoldReason, on: boolean): void {
    const was = this.paused;
    if (on) this.holds.add(reason);
    else this.holds.delete(reason);
    if (this.paused !== was) this.onChange(this.paused);
  }
}

export abstract class BasePlatform implements Platform {
  abstract readonly name: string;
  abstract readonly isMobile: boolean;
  abstract readonly storage: PlatformStorage;
  abstract readonly rewardedAvailable: boolean;
  readonly canQuit: boolean = false;
  readonly privacyOptionsRequired: boolean = false;

  protected readonly events = new Emitter<HostEvents>();
  protected readonly holds = new PauseHolds((paused) =>
    this.events.emit(paused ? 'pause' : 'resume', undefined),
  );

  abstract init(): Promise<void>;
  abstract loadingStart(): void;
  abstract loadingStop(): void;
  abstract gameplayStart(): void;
  abstract gameplayStop(): void;
  abstract showInterstitial(): Promise<void>;
  abstract showRewarded(): Promise<boolean>;

  happyTime(): void {}

  async getUser(): Promise<PlatformUser | null> {
    return null;
  }

  quit(): void {}

  onPause(fn: () => void): () => void {
    return this.events.on('pause', fn);
  }

  onResume(fn: () => void): () => void {
    return this.events.on('resume', fn);
  }

  onMuteChange(fn: (muted: boolean) => void): () => void {
    return this.events.on('mute', fn);
  }

  onBack(fn: () => void): () => void {
    return this.events.on('back', fn);
  }

  async showPrivacyOptions(): Promise<void> {}

  /**
   * Pause while the tab is hidden and, inside a portal iframe, while focus is elsewhere on the page
   * (portals require the game to go quiet then).
   */
  protected watchPage(): void {
    document.addEventListener('visibilitychange', () => this.holds.set('hidden', document.hidden));
    if (window.self === window.top) return;
    window.addEventListener('blur', () => this.holds.set('blur', true));
    window.addEventListener('focus', () => this.holds.set('blur', false));
    // Focus comes back with the first tap or click on the game.
    window.addEventListener('pointerdown', () => this.holds.set('blur', false), { capture: true });
  }

  /** Hold the game paused (muted, loop stopped) while `run` shows an ad. */
  protected async adBreak<T>(run: () => Promise<T>): Promise<T> {
    this.holds.set('ad', true);
    try {
      return await run();
    } finally {
      this.holds.set('ad', false);
    }
  }
}
