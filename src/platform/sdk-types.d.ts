// Narrow ambient types for the portal SDKs, covering only what the adapters call. Checked against
// docs.crazygames.com/sdk (HTML5 SDK v3) and wiki.playgama.com/playgama/bridge-sdk (Bridge v2).

declare namespace CrazyGamesSdk {
  interface AdError {
    code: 'adsDisabledBasicLaunch' | 'unfilled' | 'adblock' | 'adCooldown' | 'other' | string;
    message: string;
  }
  interface AdCallbacks {
    adStarted?: () => void;
    adFinished?: () => void;
    adError?: (error: AdError) => void;
  }
  interface Settings {
    muteAudio: boolean;
  }
  interface User {
    username: string;
    profilePictureUrl?: string;
  }
  interface Sdk {
    /** 'uninitialized' until init() resolves. */
    environment: 'uninitialized' | 'local' | 'crazygames' | 'disabled';
    init(): Promise<void>;
    game: {
      loadingStart(): void;
      loadingStop(): void;
      gameplayStart(): void;
      gameplayStop(): void;
      happytime(): void;
      settings: Settings;
      addSettingsChangeListener(fn: (settings: Settings) => void): void;
    };
    ad: {
      requestAd(type: 'midgame' | 'rewarded', callbacks: AdCallbacks): void;
      hasAdblock(): Promise<boolean>;
    };
    /** Mirrors localStorage (synchronous); throws when the data module is disabled. */
    data: Pick<Storage, 'getItem' | 'setItem'>;
    user: {
      isUserAccountAvailable: boolean;
      getUser(): Promise<User | null>;
      systemInfo?: { device?: { type?: 'desktop' | 'tablet' | 'mobile' } };
    };
  }
}

declare namespace PlaygamaBridge {
  type InterstitialState = 'loading' | 'opened' | 'closed' | 'failed';
  type RewardedState = 'loading' | 'opened' | 'rewarded' | 'closed' | 'failed';
  interface EventNames {
    INTERSTITIAL_STATE_CHANGED: string;
    REWARDED_STATE_CHANGED: string;
    PAUSE_STATE_CHANGED: string;
    AUDIO_STATE_CHANGED: string;
  }
  interface Emitter {
    on(event: string, fn: (value: never) => void): void;
    off?(event: string, fn: (value: never) => void): void;
  }
  interface Bridge {
    EVENT_NAME: EventNames;
    initialize(): Promise<void>;
    platform: Emitter & {
      id: string;
      language: string;
      isAudioEnabled: boolean;
      sendMessage(message: string): void;
    };
    advertisement: Emitter & {
      isInterstitialSupported: boolean;
      isRewardedSupported: boolean;
      showInterstitial(placement?: string): void;
      showRewarded(placement?: string): void;
    };
    storage: {
      get(keys: string[]): Promise<unknown[]>;
      set(keys: string[], values: string[]): Promise<void>;
    };
    device: { type: 'mobile' | 'tablet' | 'desktop' | 'tv' };
    player: {
      isAuthorized: boolean;
      id: string | null;
      name: string | null;
      photos: string[];
    };
  }
}

interface Window {
  CrazyGames?: { SDK: CrazyGamesSdk.Sdk };
  bridge?: PlaygamaBridge.Bridge;
}
