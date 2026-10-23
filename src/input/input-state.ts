// Device-independent input. Devices write into an InputState; the player controller only reads it.
// Movement is sampled every sim step; look deltas are accumulated and consumed once per rendered frame.

import { INPUT } from '../config/tunables';

export type Gait = 'sneak' | 'walk' | 'run';

/** Touch joystick push → gait. Returns null inside the deadzone (no movement). */
export function gaitFromStick(magnitude: number): Gait | null {
  if (magnitude < INPUT.stickDeadzone) return null;
  if (magnitude < INPUT.stickSneakMax) return 'sneak';
  if (magnitude >= INPUT.stickRunMin) return 'run';
  return 'walk';
}

/** Fraction of pending look to apply this frame for an exponential smoother with time constant tau. */
export function smoothingFactor(dt: number, tau: number): number {
  return tau <= 0 ? 1 : 1 - Math.exp(-dt / tau);
}

export class InputState {
  /** Move direction in view space: x = strafe right, y = forward. Length ≤ 1; 0 = no move. */
  moveX = 0;
  moveY = 0;
  gait: Gait = 'walk';
  /** Edge flags, set by devices and cleared by consumeEdges() after a sim step reads them. */
  crouchToggle = false;
  context = false;
  throw = false;
  /** Accumulated look in radians: +yaw = turn right, +pitch = look down (screen convention). */
  private lookYaw = 0;
  private lookPitch = 0;

  addLook(yaw: number, pitch: number): void {
    this.lookYaw += yaw;
    this.lookPitch += pitch;
  }

  /** Returns and clears the accumulated look delta. */
  consumeLook(out: { yaw: number; pitch: number }): { yaw: number; pitch: number } {
    out.yaw = this.lookYaw;
    out.pitch = this.lookPitch;
    this.lookYaw = 0;
    this.lookPitch = 0;
    return out;
  }

  consumeEdges(): void {
    this.crouchToggle = false;
    this.context = false;
    this.throw = false;
  }

  /** Drop all held input (pause, focus loss). Edges and look are discarded too. */
  reset(): void {
    this.moveX = this.moveY = 0;
    this.gait = 'walk';
    this.consumeEdges();
    this.lookYaw = this.lookPitch = 0;
  }
}
