// Changes an equipped perk makes to one attempt. Handed to Mission, which passes each field to the
// system it affects, so the sim stays pure and a test can run any loadout headless.

import { HEALTH } from '../config/tunables';

export interface MissionModifiers {
  /** Multiplies the player's footstep noise radius. */
  noiseScale: number;
  /** Seconds of calm before a hit point comes back. */
  regenDelayS: number;
  /** Bottles on top of the level's count. */
  bonusBottles: number;
}

export const NO_MODIFIERS: Readonly<MissionModifiers> = {
  noiseScale: 1,
  regenDelayS: HEALTH.regenDelayS,
  bonusBottles: 0,
};
