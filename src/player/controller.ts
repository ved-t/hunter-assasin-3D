// First-person player movement. Pure sim state on the XZ plane, no three.js.
// Look is applied per rendered frame (lowest latency); movement runs in the fixed 60 Hz step.

import { GUARD, INPUT, PLAYER } from '../config/tunables';
import type { InputState } from '../input/input-state';
import { moveCircle, pushOutOfCircle, resolveCircle, type Vec2 } from '../level/collision';
import type { Grid } from '../level/grid';

export type PlayerGait = 'still' | 'crouch' | 'sneak' | 'walk' | 'run';

const PITCH_LIMIT = (INPUT.pitchLimitDeg * Math.PI) / 180;
/** Below this speed (m/s) the player counts as standing still. */
const STILL_SPEED = 0.1;
/** Closest a living guard's centre can be to the player's. */
const GUARD_CLEARANCE = PLAYER.radius + GUARD.radius;

/** A body the player can't walk through while it's alive (Guard satisfies this). */
export interface Blocker {
  readonly pos: Vec2;
  readonly dead: boolean;
}

const SPEED: Record<Exclude<PlayerGait, 'still'>, number> = {
  crouch: PLAYER.crouchSpeed,
  sneak: PLAYER.sneakSpeed,
  walk: PLAYER.walkSpeed,
  run: PLAYER.runSpeed,
};

export interface PlayerSpawnWorld {
  x: number;
  z: number;
  /** Compass heading (deg): 0 = −Z, 90 = +X. */
  yawDeg: number;
}

export class PlayerController {
  readonly pos: Vec2;
  readonly prevPos: Vec2;
  readonly vel: Vec2 = { x: 0, z: 0 };
  /** Camera yaw (rad), three.js convention: 0 looks −Z, positive turns left. */
  yaw: number;
  /** Camera pitch (rad): positive looks up. */
  pitch = 0;
  crouched = false;
  gait: PlayerGait = 'still';
  eyeHeight: number = PLAYER.eyeHeight;
  prevEyeHeight: number = PLAYER.eyeHeight;
  /** Footstep noise radius for the current gait (m). */
  noiseRadius = 0;
  /** Multiplies every footstep's noise radius (the quiet-steps perk). */
  noiseScale = 1;
  /** Radius of the footstep taken this step (m), or 0 if no foot landed. */
  footstep = 0;
  private stepTimer = 0;
  invertY = false;

  constructor(spawn: PlayerSpawnWorld) {
    this.pos = { x: spawn.x, z: spawn.z };
    this.prevPos = { x: spawn.x, z: spawn.z };
    this.yaw = (-spawn.yawDeg * Math.PI) / 180;
  }

  /** Look delta in radians: +yaw = turn right, +pitch = look down (screen convention). */
  applyLook(yawDelta: number, pitchDelta: number): void {
    this.yaw -= yawDelta;
    this.pitch -= this.invertY ? -pitchDelta : pitchDelta;
    if (this.pitch > PITCH_LIMIT) this.pitch = PITCH_LIMIT;
    if (this.pitch < -PITCH_LIMIT) this.pitch = -PITCH_LIMIT;
    // Keep yaw bounded so float precision never degrades over a long session.
    if (this.yaw > Math.PI) this.yaw -= 2 * Math.PI;
    else if (this.yaw < -Math.PI) this.yaw += 2 * Math.PI;
  }

  /** `blockers`: living guards push the player out of their circle; bodies don't. */
  step(dt: number, input: InputState, grid: Grid, blockers: readonly Blocker[] = []): void {
    this.prevPos.x = this.pos.x;
    this.prevPos.z = this.pos.z;
    this.prevEyeHeight = this.eyeHeight;

    if (input.crouchToggle) this.crouched = !this.crouched;

    // Target velocity: view-space input rotated by yaw. Forward is −Z at yaw 0.
    const moving = input.moveX !== 0 || input.moveY !== 0;
    const moveGait = this.crouched ? 'crouch' : input.gait;
    const speed = moving ? SPEED[moveGait] : 0;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const tx = (input.moveX * cos - input.moveY * sin) * speed;
    const tz = (-input.moveX * sin - input.moveY * cos) * speed;

    // Accelerate toward the target (snappy but not instant).
    const rate = moving ? PLAYER.acceleration : PLAYER.deceleration;
    const dx = tx - this.vel.x;
    const dz = tz - this.vel.z;
    const dist = Math.hypot(dx, dz);
    const maxDelta = rate * dt;
    if (dist <= maxDelta) {
      this.vel.x = tx;
      this.vel.z = tz;
    } else {
      this.vel.x += (dx / dist) * maxDelta;
      this.vel.z += (dz / dist) * maxDelta;
    }

    moveCircle(grid, this.pos, this.vel.x * dt, this.vel.z * dt, PLAYER.radius);
    let blocked = false;
    for (const b of blockers) {
      if (b.dead) continue;
      const { x, z } = this.pos;
      pushOutOfCircle(this.pos, b.pos, GUARD_CLEARANCE);
      blocked ||= x !== this.pos.x || z !== this.pos.z;
    }
    // A guard can shove the player toward a wall; walls win.
    if (blocked) resolveCircle(grid, this.pos, PLAYER.radius);
    // Use the velocity we actually achieved so pushing into a wall doesn't store up speed.
    this.vel.x = (this.pos.x - this.prevPos.x) / dt;
    this.vel.z = (this.pos.z - this.prevPos.z) / dt;

    const actual = Math.hypot(this.vel.x, this.vel.z);
    this.gait = actual < STILL_SPEED ? 'still' : moveGait;
    this.noiseRadius = PLAYER.noiseRadius[this.gait] * this.noiseScale;
    this.footstep = 0;
    if (this.gait === 'still') {
      this.stepTimer = 0; // the first step lands as soon as the player moves again
    } else {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.footstep = this.noiseRadius;
        this.stepTimer += PLAYER.footstepIntervalS[this.gait];
      }
    }

    const targetEye = this.crouched ? PLAYER.crouchEyeHeight : PLAYER.eyeHeight;
    this.eyeHeight += (targetEye - this.eyeHeight) * (1 - Math.exp(-PLAYER.eyeLerpRate * dt));

    input.consumeEdges();
  }

  get speed(): number {
    return Math.hypot(this.vel.x, this.vel.z);
  }
}
