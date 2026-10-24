// When to ask the platform for an interstitial. Only at natural breaks (leaving a result screen), never
// early in a session and never too soon after the last ad of any kind. Pure: callers pass wall-clock
// seconds. The portal SDKs pace ads too; this only decides when the game asks.

import { ADS } from '../config/tunables';

export class AdPolicy {
  private lastAdAt = -Infinity;

  /** `sessionStart`: wall-clock seconds when the game booted. */
  constructor(private readonly sessionStart: number) {}

  /** May the game show an interstitial at this break? */
  interstitialDue(now: number): boolean {
    return (
      now - this.sessionStart >= ADS.firstInterstitialAfterS &&
      now - this.lastAdAt >= ADS.interstitialMinGapS
    );
  }

  /** An ad (interstitial or rewarded) just finished; restarts the gap. */
  adShown(now: number): void {
    this.lastAdAt = now;
  }
}
