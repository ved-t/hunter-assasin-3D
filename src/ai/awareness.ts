// A guard's 0–100 awareness of the player, with the last-known position (LKP) of the stimulus.
// Pure state: perception feeds stimuli in, the FSM reads thresholds out.

import { AWARENESS } from '../config/tunables';
import type { Vec2 } from '../level/collision';

export class Awareness {
  value = 0;
  /** Seconds since the last stimulus. */
  sinceStimulus = Infinity;
  /** Where the last stimulus came from; null until the first one. */
  lkp: Vec2 | null = null;
  /** Unit direction the player was last seen moving (zero if unknown, e.g. a sound). */
  readonly heading: Vec2 = { x: 0, z: 0 };
  /** Lower bound for decay, and how long it lasts (s). */
  floor = 0;
  floorTimer = 0;

  /**
   * Adds `amount` and moves the LKP to (x, z). A heading of zero length keeps the previous heading,
   * since sounds say where the player is but not where they are going.
   */
  stimulus(amount: number, x: number, z: number, headingX = 0, headingZ = 0): void {
    if (amount <= 0) return;
    this.raiseTo(this.value + amount, x, z, headingX, headingZ);
  }

  /** Raise to at least `value` (capped at max) and count it as a stimulus at (x, z). */
  raiseTo(value: number, x: number, z: number, headingX = 0, headingZ = 0): void {
    this.value = Math.min(AWARENESS.max, Math.max(this.value, value));
    this.sinceStimulus = 0;
    if (this.lkp) {
      this.lkp.x = x;
      this.lkp.z = z;
    } else {
      this.lkp = { x, z };
    }
    const len = Math.hypot(headingX, headingZ);
    if (len > 0) {
      this.heading.x = headingX / len;
      this.heading.z = headingZ / len;
    }
  }

  /** Keep awareness at or above `floor` for `seconds`. */
  setFloor(floor: number, seconds: number): void {
    this.floor = floor;
    this.floorTimer = seconds;
    if (this.value < floor) this.value = floor;
  }

  update(dt: number): void {
    this.sinceStimulus += dt;
    if (this.floorTimer > 0) {
      this.floorTimer -= dt;
      if (this.floorTimer <= 0) this.floor = 0;
    }
    if (this.sinceStimulus > AWARENESS.holdS) {
      this.value = Math.max(this.floor, this.value - AWARENESS.decayPerS * dt);
    }
  }
}
