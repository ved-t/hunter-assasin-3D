// Platform abstraction. All portal/native differences live behind this interface (CLAUDE.md).
// Implementations: dev.ts now; playgama.ts, crazygames.ts, android.ts in Phase 6.

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

  init(): Promise<void>;
  /** Loading screen shown / hidden (portal SDK loading events). */
  loadingStart(): void;
  loadingStop(): void;
  /** Player is in active gameplay / left it (menus, pause, ads). */
  gameplayStart(): void;
  gameplayStop(): void;
  /** Resolves when the ad finished or was skipped/unavailable. Game audio must be muted meanwhile. */
  showInterstitial(): Promise<void>;
  /** Resolves true if the reward was earned. */
  showRewarded(): Promise<boolean>;
  getUser(): Promise<PlatformUser | null>;
  /** Pause/resume requested by the host (tab hidden, ad shown, app backgrounded). Returns an unsubscribe. */
  onPause(fn: () => void): () => void;
  onResume(fn: () => void): () => void;
}
