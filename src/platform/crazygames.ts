// CrazyGames HTML5 SDK v3 adapter (docs.crazygames.com/sdk). Loading and gameplay events go straight
// through; ads pause and mute the game from adStarted until adFinished/adError; saves go through the data
// module (account-synced, localStorage for guests); the portal's mute setting overrides the in-game one.

import { ADS } from '../config/tunables';
import { BasePlatform } from './base';
import { createWebStorage, detectMobile } from './dev';
import type { PlatformStorage, PlatformUser } from './platform';

/** Ad errors after which no rewarded ad can succeed this session, so the revive offer is hidden. */
const REWARDED_DEAD_ERRORS = new Set(['adsDisabledBasicLaunch', 'adblock']);

export class CrazyGamesPlatform extends BasePlatform {
  readonly name = 'crazygames';
  // Every SDK field other than init() is off-limits until init resolves; these are set there.
  isMobile = false;
  storage!: PlatformStorage;
  rewardedAvailable = true;

  constructor(private readonly sdk: CrazyGamesSdk.Sdk) {
    super();
  }

  async init(): Promise<void> {
    await this.sdk.init();
    // 'disabled' means a domain the SDK doesn't serve: every call would throw, so let the dev platform run.
    if (this.sdk.environment === 'disabled') throw new Error('CrazyGames SDK disabled on this domain');
    this.storage = createWebStorage(this.sdk.data as Storage);
    const device = this.sdk.user.systemInfo?.device?.type;
    this.isMobile = device ? device !== 'desktop' : detectMobile();
    this.watchPage();
    this.sdk.game.addSettingsChangeListener((s) => this.events.emit('mute', s.muteAudio));
    try {
      if (await this.sdk.ad.hasAdblock()) this.rewardedAvailable = false;
    } catch {
      // detection is best-effort; requestAd reports adblock too
    }
  }

  /** The settings listener only fires on later changes, so each subscriber gets the current state now. */
  override onMuteChange(fn: (muted: boolean) => void): () => void {
    const off = super.onMuteChange(fn);
    fn(this.sdk.game.settings.muteAudio);
    return off;
  }

  loadingStart(): void {
    this.sdk.game.loadingStart();
  }
  loadingStop(): void {
    this.sdk.game.loadingStop();
  }
  gameplayStart(): void {
    this.sdk.game.gameplayStart();
  }
  gameplayStop(): void {
    this.sdk.game.gameplayStop();
  }

  async showInterstitial(): Promise<void> {
    await this.requestAd('midgame');
  }

  async showRewarded(): Promise<boolean> {
    if (!this.rewardedAvailable) return false;
    return this.requestAd('rewarded');
  }

  override happyTime(): void {
    this.sdk.game.happytime();
  }

  override async getUser(): Promise<PlatformUser | null> {
    if (!this.sdk.user.isUserAccountAvailable) return null;
    try {
      const user = await this.sdk.user.getUser();
      return user ? { id: '', name: user.username, avatarUrl: user.profilePictureUrl } : null;
    } catch {
      return null;
    }
  }

  /** Resolves true when the ad played to the end, false on any error (unfilled, cooldown, adblock…). */
  private requestAd(type: 'midgame' | 'rewarded'): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      const end = (finished: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.holds.set('ad', false);
        resolve(finished);
      };
      const timeout = setTimeout(() => end(false), ADS.sdkAdTimeoutS * 1000);
      try {
        this.sdk.ad.requestAd(type, {
          adStarted: () => {
            if (!settled) this.holds.set('ad', true);
          },
          adFinished: () => end(true),
          adError: (error) => {
            if (REWARDED_DEAD_ERRORS.has(error.code)) this.rewardedAvailable = false;
            end(false);
          },
        });
      } catch {
        end(false);
      }
    });
  }
}
