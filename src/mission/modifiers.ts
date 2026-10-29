// What the difficulty and the equipped perk change for one attempt. Handed to Mission, which passes each
// field to the system it affects, so the sim stays pure and a test can run any loadout headless.

import { HEALTH } from '../config/tunables';

export interface MissionModifiers {
  /** Player hit points (difficulty). */
  maxHp: number;
  /** Guard sight, hearing and awareness-drain multipliers (difficulty). */
  visionMult: number;
  hearingMult: number;
  decayMult: number;
  /** Multiplies the player's footstep noise radius. */
  noiseScale: number;
  /** Seconds of calm before a hit point comes back. */
  regenDelayS: number;
  /** Bottles on top of the level's count. */
  bonusBottles: number;
}

/** Medium, no perk. */
export const NO_MODIFIERS: Readonly<MissionModifiers> = {
  maxHp: HEALTH.maxHp,
  visionMult: 1,
  hearingMult: 1,
  decayMult: 1,
  noiseScale: 1,
  regenDelayS: HEALTH.regenDelayS,
  bonusBottles: 0,
};
