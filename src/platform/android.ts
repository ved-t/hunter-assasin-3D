// Android (Capacitor) adapter: AdMob ads behind Google's UMP consent flow, saves in Capacitor Preferences,
// app background/foreground as host pause, and the system back button. The plugins are passed in, so this
// module is only loaded inside the native app (index.ts) and tests can hand it fakes.

import {
  AdmobConsentStatus,
  InterstitialAdPluginEvents,
  RewardAdPluginEvents,
  type AdMobPlugin,
} from '@capacitor-community/admob';
import type { AppPlugin } from '@capacitor/app';
import type { PreferencesPlugin } from '@capacitor/preferences';
import { ADS } from '../config/tunables';
import { ADMOB_IDS, ADMOB_TESTING } from './admob-ids';
import { BasePlatform } from './base';
import type { PlatformStorage } from './platform';

const STORAGE_PREFIX = 'shadow-hunter:';

export interface AndroidPlugins {
  admob: Pick<
    AdMobPlugin,
    | 'initialize'
    | 'requestConsentInfo'
    | 'showConsentForm'
    | 'showPrivacyOptionsForm'
    | 'prepareInterstitial'
    | 'showInterstitial'
    | 'prepareRewardVideoAd'
    | 'showRewardVideoAd'
    | 'addListener'
  >;
  app: Pick<AppPlugin, 'addListener' | 'exitApp'>;
  preferences: Pick<PreferencesPlugin, 'get' | 'set'>;
}

/** Storage over Capacitor Preferences, with a memory copy that answers when the plugin call fails. */
export function createPreferencesStorage(prefs: AndroidPlugins['preferences']): PlatformStorage {
  const memory = new Map<string, string>();
  return {
    async get(key) {
      const k = STORAGE_PREFIX + key;
      try {
        const { value } = await prefs.get({ key: k });
        if (value !== null) return value;
      } catch {
        // fall through to memory
      }
      return memory.get(k) ?? null;
    },
    async set(key, value) {
      const k = STORAGE_PREFIX + key;
      memory.set(k, value);
      try {
        await prefs.set({ key: k, value });
      } catch {
        // memory copy already written
      }
    },
  };
}

type AdKind = 'interstitial' | 'rewarded';

export class AndroidPlatform extends BasePlatform {
  readonly name = 'android';
  readonly isMobile = true;
  override readonly canQuit = true;
  override privacyOptionsRequired = false;
  readonly storage: PlatformStorage;
  /** Ads may be requested at all (consent allows it); a missing fill still fails per request. */
  rewardedAvailable = false;

  private canRequestAds = false;
  private readonly loaded: Record<AdKind, Promise<boolean> | null> = {
    interstitial: null,
    rewarded: null,
  };
  /** The ad on screen: set by show, ended by its Dismissed/FailedToShow event. */
  private current: { earned: boolean; end: () => void } | null = null;

  constructor(private readonly plugins: AndroidPlugins) {
    super();
    this.storage = createPreferencesStorage(plugins.preferences);
  }

  async init(): Promise<void> {
    const { admob, app } = this.plugins;
    this.watchPage();
    await app.addListener('pause', () => this.holds.set('hidden', true));
    await app.addListener('resume', () => this.holds.set('hidden', false));
    await app.addListener('backButton', () => this.events.emit('back', undefined));

    await this.gatherConsent();
    if (!this.canRequestAds) return;
    await admob.initialize({ initializeForTesting: ADMOB_TESTING });
    const end = () => this.current?.end();
    await admob.addListener(RewardAdPluginEvents.Rewarded, () => {
      if (this.current) this.current.earned = true;
    });
    await admob.addListener(RewardAdPluginEvents.Dismissed, end);
    await admob.addListener(RewardAdPluginEvents.FailedToShow, end);
    await admob.addListener(InterstitialAdPluginEvents.Dismissed, end);
    await admob.addListener(InterstitialAdPluginEvents.FailedToShow, end);
    this.rewardedAvailable = true;
    void this.prepare('interstitial');
    void this.prepare('rewarded');
  }

  /** Google UMP: ask for consent where the law requires it (EEA/UK); ads only once it allows them. */
  private async gatherConsent(): Promise<void> {
    const { admob } = this.plugins;
    try {
      let info = await admob.requestConsentInfo();
      if (info.status === AdmobConsentStatus.REQUIRED && info.isConsentFormAvailable) {
        info = await admob.showConsentForm();
      }
      this.canRequestAds = info.canRequestAds;
      this.privacyOptionsRequired = info.privacyOptionsRequirementStatus === 'REQUIRED';
    } catch (err) {
      // Offline or misconfigured: no ads this session rather than ads without valid consent.
      console.warn('[platform:android] consent unavailable', err);
      this.canRequestAds = false;
    }
  }

  override async showPrivacyOptions(): Promise<void> {
    try {
      await this.adBreak(() => this.plugins.admob.showPrivacyOptionsForm());
    } catch {
      // form unavailable; nothing to change
    }
  }

  override quit(): void {
    void this.plugins.app.exitApp();
  }

  loadingStart(): void {}
  loadingStop(): void {}
  gameplayStart(): void {}
  gameplayStop(): void {}

  async showInterstitial(): Promise<void> {
    if (this.canRequestAds) await this.show('interstitial');
  }

  async showRewarded(): Promise<boolean> {
    if (!this.rewardedAvailable) return false;
    return this.show('rewarded');
  }

  /** Load the next ad of this kind in the background; resolves whether one is ready. */
  private prepare(kind: AdKind): Promise<boolean> {
    const { admob } = this.plugins;
    const options = {
      adId: kind === 'interstitial' ? ADMOB_IDS.interstitial : ADMOB_IDS.rewarded,
      isTesting: ADMOB_TESTING,
      immersiveMode: true,
    };
    const loading = (
      kind === 'interstitial' ? admob.prepareInterstitial(options) : admob.prepareRewardVideoAd(options)
    ).then(
      () => true,
      () => false,
    );
    this.loaded[kind] = loading;
    return loading;
  }

  /**
   * Show the prepared ad (loading one first if the last load failed or was used), holding the game paused
   * until it is dismissed. Resolves true if a reward was earned; interstitials always resolve false.
   */
  private async show(kind: AdKind): Promise<boolean> {
    const ready = (await this.loaded[kind]) || (await this.prepare(kind));
    // Either this ad gets used now or none loaded; the next show (or the reload below) asks again.
    this.loaded[kind] = null;
    if (!ready) return false;
    const earned = await this.adBreak(
      () =>
        new Promise<boolean>((resolve) => {
          const timeout = setTimeout(() => this.current?.end(), ADS.sdkAdTimeoutS * 1000);
          const current = {
            earned: false,
            end: () => {
              if (this.current !== current) return;
              this.current = null;
              clearTimeout(timeout);
              resolve(current.earned);
            },
          };
          this.current = current;
          const { admob } = this.plugins;
          const shown = kind === 'interstitial' ? admob.showInterstitial() : admob.showRewardVideoAd();
          shown.catch(() => current.end());
        }),
    );
    void this.prepare(kind);
    return earned;
  }
}
