// Which animation clip a guard plays, and how fast, read from his sim state. Pure, so it is tested
// without three.js; render/guard-models.ts applies the choice to each guard's mixer.

import type { GuardState } from '../ai/guard-fsm';
import { GUARD_ANIM as A } from '../config/tunables';

export const GUARD_CLIPS = [
  'idle',
  'walk',
  'run',
  'turnLeft',
  'turnRight',
  'look',
  'shoot',
  'deathBack',
  'deathFront',
] as const;
export type GuardClip = (typeof GUARD_CLIPS)[number];
export type DeathClip = 'deathBack' | 'deathFront';

/** Clips that play once and hold their last frame. */
export const ONE_SHOT: ReadonlySet<GuardClip> = new Set(['deathBack', 'deathFront']);

export interface ClipInput {
  dead: boolean;
  /** How he was killed (set when he dies). */
  death: DeathClip;
  state: GuardState;
  /** Ground speed (m/s). */
  speed: number;
  /** Turn rate (rad/s), positive = turning left (three.js yaw). */
  yawRate: number;
  /** Winding up or just fired. */
  aiming: boolean;
}

export interface ClipChoice {
  clip: GuardClip;
  /** Playback rate: locomotion matches the clip's stride to his speed. */
  timeScale: number;
}

/** The clip for this frame. */
export function pickClip(i: ClipInput, out: ClipChoice): ClipChoice {
  out.timeScale = 1;
  if (i.dead) {
    out.clip = i.death;
  } else if (i.aiming) {
    out.clip = 'shoot';
  } else if (i.speed >= A.runFromMps) {
    out.clip = 'run';
    out.timeScale = clampScale(i.speed / A.runClipMps);
  } else if (i.speed >= A.walkFromMps) {
    out.clip = 'walk';
    out.timeScale = clampScale(i.speed / A.walkClipMps);
  } else if (Math.abs(i.yawRate) >= A.turnFromRadPerS) {
    out.clip = i.yawRate > 0 ? 'turnLeft' : 'turnRight';
  } else if (i.state === 'suspicious' || i.state === 'search') {
    out.clip = 'look';
  } else {
    out.clip = 'idle';
  }
  return out;
}

function clampScale(s: number): number {
  return Math.min(A.maxTimeScale, Math.max(A.minTimeScale, s));
}

/**
 * Killed from behind he pitches forward (the "death from the back" clip); from the side, he falls
 * the other way. `yaw` is his facing (three.js: forward = (−sin, −cos)); (px, pz) is the player.
 */
export function deathClipFor(
  yaw: number,
  gx: number,
  gz: number,
  px: number,
  pz: number,
): DeathClip {
  const dx = px - gx;
  const dz = pz - gz;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) return 'deathBack';
  // Cosine between his facing and the direction to the player: −1 = directly behind him.
  const cos = (-Math.sin(yaw) * dx - Math.cos(yaw) * dz) / d;
  return cos <= -Math.cos((A.backArcDeg / 2) * (Math.PI / 180)) ? 'deathBack' : 'deathFront';
}
