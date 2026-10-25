// Playgama Bridge v2 adapter (wiki.playgama.com/playgama/bridge-sdk). Covers Bridge's required steps:
// saves through bridge.storage, the host's pause and audio states, game_ready once the title is up, and
// interstitials only at natural breaks (main.ts decides when). Bridge routes each call to whichever
// portal it runs on, and to a mock platform off-portal.

import { ADS } from '../config/tunables';
import { BasePlatform } from './base';
import type { PlatformStorage } from './platform';

const STORAGE_PREFIX = 'shadow-hunter:';

/** Storage over bridge.storage, with a memory copy that answers when the platform call fails. */
export function createBridgeStorage(storage: PlaygamaBridge.Bridge['storage']): PlatformStorage {
  const memory = new Map<string, string>();
  return {
    async get(key) {
      const k = STORAGE_PREFIX + key;
      try {
        const [value] = await storage.get([k]);
        if (typeof value === 'string') return value;
        // Some platforms hand back parsed JSON; the save layer expects the raw string.
        if (value !== null && value !== undefined) return JSON.stringify(value);
      } catch {
        // fall through to memory
      }
      return memory.get(k) ?? null;
    },
    async set(key, value) {
      const k = STORAGE_PREFIX + key;
      memory.set(k, value);
      try {
        await storage.set([k], [value]);
      } catch {
        // memory copy already written
      }
    },
  };
}

export class PlaygamaPlatform extends BasePlatform {
  readonly name = 'playgama';
  // Bridge modules exist only once initialize() resolves; these are set there.
  isMobile = false;
  storage!: PlatformStorage;
  rewardedAvailable = false;
  private readySent = false;

  constructor(private readonly bridge: PlaygamaBridge.Bridge) {
    super();
  }

  async init(): Promise<void> {
    await this.bridge.initialize();
    this.storage = createBridgeStorage(this.bridge.storage);
    const device = this.bridge.device.type;
    this.isMobile = device === 'mobile' || device === 'tablet';
    this.watchPage();
    const { platform, advertisement, EVENT_NAME } = this.bridge;
    platform.on(EVENT_NAME.PAUSE_STATE_CHANGED, (paused: boolean) =>
      this.holds.set('host', paused),
    );
    platform.on(EVENT_NAME.AUDIO_STATE_CHANGED, (enabled: boolean) =>
      this.events.emit('mute', !enabled),
    );
    this.rewardedAvailable = advertisement.isRewardedSupported;
  }

  /** The audio event only fires on later changes, so each subscriber gets the current state now. */
  override onMuteChange(fn: (muted: boolean) => void): () => void {
    const off = super.onMuteChange(fn);
    fn(!this.bridge.platform.isAudioEnabled);
    return off;
  }

  loadingStart(): void {}

  /** The title screen is up and playable: the host hides its loader and starts analytics. */
  loadingStop(): void {
    if (this.readySent) return;
    this.readySent = true;
    this.bridge.platform.sendMessage('game_ready');
  }

  // Bridge has no gameplay start/stop message (only per-level analytics), and pausing is host-driven.
  gameplayStart(): void {}
  gameplayStop(): void {}

  async showInterstitial(): Promise<void> {
    if (!this.bridge.advertisement.isInterstitialSupported) return;
    await this.showAd('interstitial');
  }

  async showRewarded(): Promise<boolean> {
    if (!this.rewardedAvailable) return false;
    return this.showAd('rewarded');
  }

  /**
   * Shows one ad and follows its state events until it closes or fails. Resolves true if the reward was
   * granted (always false for interstitials). The game holds paused from `opened` until the end.
   */
  private showAd(kind: 'interstitial' | 'rewarded'): Promise<boolean> {
    const { advertisement, EVENT_NAME } = this.bridge;
    const event =
      kind === 'interstitial'
        ? EVENT_NAME.INTERSTITIAL_STATE_CHANGED
        : EVENT_NAME.REWARDED_STATE_CHANGED;
    return new Promise((resolve) => {
      let rewarded = false;
      let settled = false;
      const end = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        advertisement.off?.(event, onState);
        this.holds.set('ad', false);
        resolve(rewarded);
      };
      const onState = (state: PlaygamaBridge.RewardedState) => {
        if (settled) return;
        if (state === 'opened') this.holds.set('ad', true);
        else if (state === 'rewarded') rewarded = true;
        else if (state === 'closed' || state === 'failed') end();
      };
      const timeout = setTimeout(end, ADS.sdkAdTimeoutS * 1000);
      advertisement.on(event, onState);
      try {
        if (kind === 'interstitial') advertisement.showInterstitial();
        else advertisement.showRewarded();
      } catch {
        end();
      }
    });
  }
}
