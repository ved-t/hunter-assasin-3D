// The fixed pool of real SpotLights, handed each frame to the flashlights nearest the camera.
// Lights are created only at load and when the quality tier changes (which already forces a
// recompile); otherwise they are never added or removed. Free slots park at intensity 0, and
// stay visible so the shader's light count never changes.

import * as THREE from 'three';
import { TIER_SETTINGS, type QualityTier } from '../config/quality';
import { FLASHLIGHT } from '../config/tunables';

export interface SpotCandidate {
  id: number;
  x: number;
  z: number;
}

/**
 * Decide which candidates hold the real lights. `slots[i]` is the id slot i currently holds
 * (−1 = free) and is updated in place. The first `shadowSlots` slots (the shadow casters) go to
 * the nearest candidates, the rest to the next nearest. A current holder ranks as if it were
 * `margin` metres closer, so lights don't flip between two guards at similar distances.
 * Ids that stay in the same group keep their slot.
 */
export function assignSlots(
  candidates: readonly SpotCandidate[],
  camX: number,
  camZ: number,
  slots: Int32Array,
  shadowSlots: number,
  margin: number,
): void {
  const held = new Set(slots);
  const ranked = candidates
    .map((c) => ({
      id: c.id,
      d: Math.hypot(c.x - camX, c.z - camZ) - (held.has(c.id) ? margin : 0),
    }))
    .sort((a, b) => a.d - b.d || a.id - b.id)
    .map((r) => r.id);
  const shadow = Math.min(shadowSlots, slots.length);
  fillGroup(slots, 0, shadow, ranked.slice(0, shadow));
  fillGroup(slots, shadow, slots.length, ranked.slice(shadow, slots.length));
}

function fillGroup(slots: Int32Array, from: number, to: number, ids: number[]): void {
  const pending = new Set(ids);
  for (let i = from; i < to; i++) {
    const id = slots[i] as number;
    if (pending.has(id)) pending.delete(id);
    else slots[i] = -1;
  }
  const rest = ids.filter((id) => pending.has(id));
  for (let i = from; i < to && rest.length > 0; i++) {
    if (slots[i] === -1) slots[i] = rest.shift() as number;
  }
}

/** Where a flashlight is and how bright it is, for the real light that follows it. */
export interface SpotPose extends SpotCandidate {
  y: number;
  /** Unit beam direction. */
  dx: number;
  dy: number;
  dz: number;
  /** 0..1 (flicker × on/off). */
  intensity: number;
}

export class SpotPool {
  private lights: THREE.SpotLight[] = [];
  /** Desired holder per slot. */
  private target = new Int32Array(0);
  /** Holder actually lit per slot (lags `target` while fading). */
  private current = new Int32Array(0);
  private weight = new Float32Array(0);
  private shadowSlots = 0;
  private readonly byId = new Map<number, SpotPose>();

  constructor(
    private readonly scene: THREE.Scene,
    tier: QualityTier,
  ) {
    this.rebuild(tier);
  }

  get size(): number {
    return this.lights.length;
  }

  /** Recreate the pool for a tier. Only call at load or on a tier change. */
  rebuild(tier: QualityTier): void {
    this.dispose();
    const t = TIER_SETTINGS[tier];
    const n = t.realSpotLights;
    this.shadowSlots = t.shadows ? Math.min(t.shadowSpotLights, n) : 0;
    this.target = new Int32Array(n).fill(-1);
    this.current = new Int32Array(n).fill(-1);
    this.weight = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const light = new THREE.SpotLight(
        FLASHLIGHT.color,
        0,
        FLASHLIGHT.rangeM,
        THREE.MathUtils.degToRad(FLASHLIGHT.halfAngleDeg),
        FLASHLIGHT.spotPenumbra,
        FLASHLIGHT.spotDecay,
      );
      light.name = `spot-pool:${i}`;
      if (i < this.shadowSlots) {
        light.castShadow = true;
        light.shadow.mapSize.set(t.shadowMapSize, t.shadowMapSize);
        light.shadow.bias = FLASHLIGHT.spotShadowBias;
        light.shadow.normalBias = FLASHLIGHT.spotShadowNormalBias;
        light.shadow.camera.near = FLASHLIGHT.spotShadowNear;
        light.shadow.camera.far = FLASHLIGHT.rangeM;
      }
      this.scene.add(light, light.target);
      this.lights.push(light);
    }
  }

  /** Assign lights for this frame and fade them between holders. */
  update(poses: readonly SpotPose[], camX: number, camZ: number, dt: number): void {
    this.byId.clear();
    for (const p of poses) this.byId.set(p.id, p);
    assignSlots(poses, camX, camZ, this.target, this.shadowSlots, FLASHLIGHT.spotSwitchMarginM);
    const rate = dt / FLASHLIGHT.spotFadeS;
    for (let i = 0; i < this.lights.length; i++) {
      const light = this.lights[i] as THREE.SpotLight;
      if (this.current[i] !== this.target[i]) {
        // Dim, then jump to the new holder and brighten, so a light never slides across the level.
        this.weight[i] = Math.max(0, (this.weight[i] as number) - rate);
        if (this.weight[i] === 0) this.current[i] = this.target[i] as number;
      } else {
        this.weight[i] = Math.min(1, (this.weight[i] as number) + rate);
      }
      const pose = this.byId.get(this.current[i] as number);
      if (!pose) {
        light.intensity = 0;
        continue;
      }
      light.intensity = FLASHLIGHT.spotIntensity * (this.weight[i] as number) * pose.intensity;
      light.position.set(pose.x, pose.y, pose.z);
      light.target.position.set(
        pose.x + pose.dx * FLASHLIGHT.rangeM,
        pose.y + pose.dy * FLASHLIGHT.rangeM,
        pose.z + pose.dz * FLASHLIGHT.rangeM,
      );
      light.target.updateMatrixWorld();
    }
  }

  /** How much of flashlight `id` the real light is carrying (0..1); fake pools fade by the rest. */
  weightOf(id: number): number {
    for (let i = 0; i < this.current.length; i++) {
      if (this.current[i] === id) return this.weight[i] as number;
    }
    return 0;
  }

  /** Id lit by slot i (−1 = none) and its current weight. */
  holderAt(i: number): number {
    return this.current[i] ?? -1;
  }

  weightAt(i: number): number {
    return this.weight[i] ?? 0;
  }

  dispose(): void {
    for (const light of this.lights) {
      this.scene.remove(light, light.target);
      light.shadow.map?.dispose();
      light.dispose();
    }
    this.lights = [];
  }
}
