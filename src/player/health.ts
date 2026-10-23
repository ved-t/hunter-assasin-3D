// Player health: a few hit points, lost one per guard hit, and won back one at a time after a calm spell
// with no damage and no guard seeing the player. Pure state.

import { HEALTH } from '../config/tunables';

export class Health {
  hp: number = HEALTH.maxHp;
  /** Seconds since the last hit or the last moment a guard had eyes on the player. */
  calm = 0;
  /** Took at least one hit this mission. */
  damaged = false;

  get dead(): boolean {
    return this.hp <= 0;
  }

  get full(): boolean {
    return this.hp >= HEALTH.maxHp;
  }

  /** Lose `amount` HP. Returns false if already dead. */
  damage(amount = 1): boolean {
    if (this.dead) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.damaged = true;
    this.calm = 0;
    return true;
  }

  /** Advance the regen clock. Returns true if a hit point came back this step. */
  update(dt: number, detected: boolean): boolean {
    if (detected || this.dead) {
      this.calm = 0;
      return false;
    }
    this.calm += dt;
    if (this.full || this.calm < HEALTH.regenDelayS) return false;
    this.hp++;
    this.calm = 0;
    return true;
  }
}
