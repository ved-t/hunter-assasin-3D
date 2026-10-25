// Platform abstraction. All portal/native differences live behind this interface (CLAUDE.md).
// Implementations: dev.ts (local and plain web), crazygames.ts, playgama.ts, android.ts.

export interface PlatformUser {
  id: string;
  name: string;
  avatarUrl?: string;
}

export interface PlatformStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export interface Platform {
  readonly name: string;
  readonly isMobile: boolean;
  readonly storage: PlatformStorage;
  /** A rewarded ad can be offered right now (false with an ad blocker or no ad SDK). */
  readonly rewardedAvailable: boolean;
  /** The host has a way out of the game (Android back on the title screen). */
  readonly canQuit: boolean;

  init(): Promise<void>;
  /** Loading screen shown / hidden (portal SDK loading events). */
  loadingStart(): void;
  loadingStop(): void;
  /** Player is in active gameplay / left it (menus, pause, ads). */
  gameplayStart(): void;
  gameplayStop(): void;
  /** Resolves when the ad finished or was skipped/unavailable. The host pauses the game meanwhile. */
  showInterstitial(): Promise<void>;
  /** Resolves true if the reward was earned. The host pauses the game meanwhile. */
  showRewarded(): Promise<boolean>;
  /** A moment worth celebrating (a 3-star win); portals may use it for promotion. */
  happyTime(): void;
  getUser(): Promise<PlatformUser | null>;
  /** Leave the game, where `canQuit`. */
  quit(): void;
  /** Pause/resume requested by the host (tab hidden, ad shown, app backgrounded). Returns an unsubscribe. */
  onPause(fn: () => void): () => void;
  onResume(fn: () => void): () => void;
  /** The host muted or unmuted the game (portal audio setting). Returns an unsubscribe. */
  onMuteChange(fn: (muted: boolean) => void): () => void;
  /** A hardware/system back press (Android). Returns an unsubscribe. */
  onBack(fn: () => void): () => void;
  /** The ad consent provider requires a way to revisit consent (shown as a Settings button). */
  readonly privacyOptionsRequired: boolean;
  showPrivacyOptions(): Promise<void>;
}
