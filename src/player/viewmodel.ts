// First-person hand-and-knife motion, as pure numbers: idle breathing, walk and run bob, sway that lags
// the look, crouch lowering, a raised "ready" pose while a takedown is possible, the stab (driven by the
// knife lock, so it lands with the kill), a throw flick, and the drop out of view on death. The render
// side (render/viewmodel-mesh.ts) applies the pose as an offset from the hand's rest transform.

import { PLAYER, VIEWMODEL as V } from '../config/tunables';
import type { PlayerGait } from './controller';

export interface ViewmodelInput {
  /** Real frame time (s). */
  dt: number;
  /** Ground speed (m/s). */
  speed: number;
  gait: PlayerGait;
  crouched: boolean;
  /** Look applied this frame (rad): + yaw turns right, + pitch looks down. */
  lookYaw: number;
  lookPitch: number;
  /** 0..1 through the knife lock, 0 when not stabbing. */
  stab: number;
  /** A bottle left the hand this frame. */
  threw: boolean;
  /** A takedown is possible right now. */
  ready: boolean;
  /** 0..1 through the death fall. */
  fall: number;
}

/** Offset from the rest pose: position (m, camera space) and rotation (rad, XYZ order). */
export interface ViewmodelPose {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
}

/** Moves `value` toward `target` with time constant `tau` (s), frame-rate independent. */
function ease(value: number, target: number, tau: number, dt: number): number {
  return target + (value - target) * Math.exp(-dt / tau);
}

/** Stab curve over the lock: a fast thrust that holds, then a slower recovery. */
export function stabCurve(s: number): number {
  if (s <= 0 || s >= 1) return 0;
  if (s < V.stabThrustFraction) {
    const k = s / V.stabThrustFraction;
    return 1 - (1 - k) * (1 - k);
  }
  const k = (s - V.stabThrustFraction) / (1 - V.stabThrustFraction);
  return 1 - k * k * (3 - 2 * k);
}

/** Throw curve over its duration: the bottle has just left, so a quick flick out, then a slow return. */
export function throwCurve(t: number): number {
  if (t <= 0 || t >= 1) return 0;
  return Math.sin(Math.PI * Math.sqrt(t)); // peaks at t = 0.25
}

export class ViewmodelAnimator {
  readonly pose: ViewmodelPose = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
  private time = 0;
  private bobPhase = 0;
  private bobAmp = 0;
  private swayX = 0;
  private swayY = 0;
  private crouch = 0;
  private ready = 0;
  /** Seconds since the last throw, or Infinity. */
  private sinceThrow = Infinity;

  update(i: ViewmodelInput): ViewmodelPose {
    const dt = Math.min(i.dt, V.maxDtS);
    this.time += dt;

    // Bob: one cycle per two footsteps' worth of distance, stronger at a run.
    const moving = i.gait !== 'still';
    const ampTarget = moving
      ? Math.min(1, i.speed / PLAYER.walkSpeed) * (i.gait === 'run' ? V.runBobScale : 1)
      : 0;
    this.bobAmp = ease(this.bobAmp, ampTarget, V.bobEaseS, dt);
    this.bobPhase += i.speed * V.bobCyclesPerM * Math.PI * 2 * dt;

    // Sway: the hand lags behind the look, springing back.
    this.swayX = ease(this.swayX - i.lookYaw * V.swayPerRad, 0, V.swayReturnS, dt);
    this.swayY = ease(this.swayY + i.lookPitch * V.swayPerRad, 0, V.swayReturnS, dt);
    this.swayX = Math.max(-V.swayMaxM, Math.min(V.swayMaxM, this.swayX));
    this.swayY = Math.max(-V.swayMaxM, Math.min(V.swayMaxM, this.swayY));

    this.crouch = ease(this.crouch, i.crouched ? 1 : 0, V.poseEaseS, dt);
    this.ready = ease(this.ready, i.ready ? 1 : 0, V.poseEaseS, dt);
    this.sinceThrow = i.threw ? 0 : this.sinceThrow + dt;

    const breathe = Math.sin(this.time * V.breatheHz * Math.PI * 2);
    const bobX = Math.sin(this.bobPhase) * V.bobXM * this.bobAmp;
    const bobY = -Math.abs(Math.cos(this.bobPhase)) * V.bobYM * this.bobAmp;
    const stab = stabCurve(i.stab);
    const flick = throwCurve(this.sinceThrow / V.throwS);
    const fall = i.fall * i.fall;

    const p = this.pose;
    p.x = bobX + this.swayX - stab * V.stabInM;
    p.y =
      bobY +
      this.swayY +
      breathe * V.breatheM -
      this.crouch * V.crouchDropM +
      this.ready * V.readyRaiseM +
      stab * V.stabRaiseM +
      flick * V.throwLiftM -
      fall * V.fallDropM;
    p.z = -stab * V.stabReachM - flick * V.throwReachM;
    p.rx = -stab * V.stabPitchRad + this.ready * V.readyPitchRad + flick * V.throwPitchRad;
    p.ry = bobX * V.bobYawPerM;
    p.rz = bobX * V.bobRollPerM + this.swayX * V.swayRollPerM - fall * V.fallRollRad;
    return p;
  }
}
