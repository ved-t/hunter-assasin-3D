// A guard's sidearm: a visible wind-up before every shot, so hits can be dodged by breaking line of
// sight, and accuracy that falls with distance and with how fast the player is moving. Pure.

import { WEAPON } from '../config/tunables';

export type GunPhase = 'idle' | 'windup';
/** What happened this step: a wind-up began, it was abandoned, or the shot went off. */
export type GunEvent = 'windup' | 'cancel' | 'fire' | null;

export class Gun {
  phase: GunPhase = 'idle';
  /** Seconds into the current wind-up. */
  windup = 0;
  /** Seconds since the last shot. */
  sinceShot = Infinity;

  /** 0..1 through the wind-up (0 while idle). */
  get windupFraction(): number {
    return this.phase === 'windup' ? Math.min(1, this.windup / WEAPON.windupS) : 0;
  }

  /**
   * `canShoot`: Alert, the player in sight and in range. Losing it mid wind-up cancels the shot.
   * Shots are at least WEAPON.shotIntervalS apart, wind-up included.
   */
  step(dt: number, canShoot: boolean): GunEvent {
    this.sinceShot += dt;
    if (this.phase === 'windup') {
      if (!canShoot) {
        this.reset();
        return 'cancel';
      }
      this.windup += dt;
      if (this.windup < WEAPON.windupS) return null;
      this.reset();
      this.sinceShot = 0;
      return 'fire';
    }
    if (!canShoot || this.sinceShot < WEAPON.shotIntervalS - WEAPON.windupS) return null;
    this.phase = 'windup';
    this.windup = 0;
    return 'windup';
  }

  reset(): void {
    this.phase = 'idle';
    this.windup = 0;
  }
}

/** Chance a shot hits a player `dist` metres away moving at `speed` m/s. */
export function hitChance(dist: number, speed: number): number {
  const byDistance = Math.min(
    WEAPON.hitChanceNear,
    Math.max(WEAPON.hitChanceMin, WEAPON.hitChanceNear - WEAPON.hitFalloffPerM * dist),
  );
  const bySpeed = Math.min(
    1,
    Math.max(WEAPON.minSpeedFactor, 1 - WEAPON.speedPenaltyPerMps * speed),
  );
  return byDistance * bySpeed;
}
