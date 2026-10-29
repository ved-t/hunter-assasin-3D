// Player health: a few hit points (how many depends on the difficulty), lost one per guard hit, and won back one at a time after a calm spell
// with no damage and no guard seeing the player. Pure state.

import { HEALTH } from '../config/tunables';

export class Health {
  hp: number;
  /** Seconds since the last hit or the last moment a guard had eyes on the player. */
  calm = 0;
  /** Took at least one hit this mission. */
  damaged = false;
  /** Seconds of invulnerability left (after a revive). */
  invulnerable = 0;

  /** `regenDelayS`: seconds of calm per hit point back (the faster-regen perk shortens it). */
  constructor(
    readonly maxHp: number = HEALTH.maxHp,
    private readonly regenDelayS: number = HEALTH.regenDelayS,
  ) {
    this.hp = maxHp;
  }

  get dead(): boolean {
    return this.hp <= 0;
  }

  get full(): boolean {
    return this.hp >= this.maxHp;
  }

  /** Lose `amount` HP. Returns false if already dead or invulnerable. */
  damage(amount = 1): boolean {
    if (this.dead || this.invulnerable > 0) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.damaged = true;
    this.calm = 0;
    return true;
  }

  /** Back from 0 HP with `hp` hit points and `invulnS` seconds of invulnerability. */
  revive(hp: number, invulnS: number): void {
    this.hp = Math.min(this.maxHp, Math.max(1, hp));
    this.calm = 0;
    this.invulnerable = invulnS;
  }

  /** Advance the regen clock. Returns true if a hit point came back this step. */
  update(dt: number, detected: boolean): boolean {
    if (this.invulnerable > 0) this.invulnerable = Math.max(0, this.invulnerable - dt);
    if (detected || this.dead) {
      this.calm = 0;
      return false;
    }
    this.calm += dt;
    if (this.full || this.calm < this.regenDelayS) return false;
    this.hp++;
    this.calm = 0;
    return true;
  }
}
