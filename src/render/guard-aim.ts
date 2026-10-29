// How far a skinned guard has his pistol raised, and how hard it is kicking, from his gun's state.
// Pure, so it is tested without three.js; render/guard-models.ts turns it into bone rotations.

import type { GunPhase } from '../ai/weapon';
import { GUARD_AIM as A, KNIFE } from '../config/tunables';

/** What the aim reads from ai/weapon's Gun. */
export interface GunView {
  phase: GunPhase;
  /** 0..1 through the wind-up. */
  windupFraction: number;
  /** Seconds since the last shot. */
  sinceShot: number;
}

/** How raised the pistol should be (0 = as the clip holds it, 1 = at his eye line). */
export function aimTarget(gun: GunView): number {
  if (gun.phase === 'windup') {
    const t = 1 - gun.windupFraction;
    return 1 - t * t; // ease-out: most of the raise happens early, so the tell reads at once
  }
  return gun.sinceShot < A.holdS ? 1 : 0;
}

/** Follows `target`: rising with it at once, lowering no faster than GUARD_AIM.lowerS allows. */
export function settleAim(current: number, target: number, dt: number): number {
  return target >= current ? target : Math.max(target, current - dt / A.lowerS);
}

/** Recoil, 0..1: 1 at the shot, falling off sharply over GUARD_AIM.kickS. */
export function recoilKick(sinceShot: number): number {
  if (!(sinceShot >= 0) || sinceShot >= A.kickS) return 0;
  const t = 1 - sinceShot / A.kickS;
  return t * t;
}

/** Wound flinch, 0..1, from the seconds of stagger left: a fast snap back, then an ease out. */
export function woundFlinch(staggerLeft: number): number {
  if (!(staggerLeft > 0)) return 0;
  const t = Math.min(1, 1 - staggerLeft / KNIFE.woundStaggerS);
  if (t < A.flinchPeakFraction) return t / A.flinchPeakFraction;
  const k = 1 - (t - A.flinchPeakFraction) / (1 - A.flinchPeakFraction);
  return k * k;
}
