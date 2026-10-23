// Every flashlight's visuals, updated once per rendered frame: cast the ray fan, then drive the beam
// mesh, the light pools, the real SpotLight pool and (high tier) the beam dust. Fixed draw calls:
// beams 1, floor pools 1, wall pools 1, dust 1.

import * as THREE from 'three';
import { TIER_SETTINGS, type QualityTier } from '../config/quality';
import type { Grid } from '../level/grid';
import { BeamDust, BeamMesh, type BeamInstance } from './beam-mesh';
import { BeamRays, castBeamFan } from './beam-rays';
import { PoolMesh, type PoolSource } from './pool-mesh';
import { SpotPool, type SpotPose } from './spot-pool';

/** One flashlight this frame: lens position, aim and brightness (0..1, flicker included). */
export interface FlashlightState {
  id: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Tilt below level (rad). */
  pitch: number;
  intensity: number;
}

interface Slot {
  rays: BeamRays;
  beam: BeamInstance;
  pool: PoolSource;
  spot: SpotPose;
}

export class Flashlights {
  readonly group = new THREE.Group();
  private readonly beams: BeamMesh;
  private readonly pools: PoolMesh;
  private readonly spots: SpotPool;
  private dust: BeamDust | null = null;
  private readonly slots: Slot[];
  private readonly beamList: BeamInstance[] = [];
  private readonly poolList: PoolSource[] = [];
  private readonly spotList: SpotPose[] = [];
  private readonly byId = new Map<number, BeamInstance>();
  private readonly dustBeams: (BeamInstance | null)[] = [];
  private readonly dustWeights: number[] = [];

  constructor(
    scene: THREE.Scene,
    private grid: Grid,
    readonly capacity: number,
    tier: QualityTier,
    private readonly random: () => number,
  ) {
    this.group.name = 'flashlights';
    this.beams = new BeamMesh(capacity);
    this.pools = new PoolMesh(capacity);
    this.group.add(this.pools.group, this.beams.mesh);
    scene.add(this.group);
    this.spots = new SpotPool(scene, tier);
    this.slots = Array.from({ length: capacity }, () => {
      const rays = new BeamRays();
      return {
        rays,
        beam: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, intensity: 0, lengths: rays.lengths },
        pool: { x: 0, y: 0, z: 0, pitch: 0, rays, intensity: 0 },
        spot: { id: 0, x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0, intensity: 0 },
      };
    });
    this.setDust(TIER_SETTINGS[tier].beamDust);
  }

  /** A new level: rays are cast against its grid from now on. */
  setGrid(grid: Grid): void {
    this.grid = grid;
  }

  /** Tier change: resize the real-light pool (one recompile, already happening) and toggle dust. */
  applyTier(tier: QualityTier): void {
    this.spots.rebuild(tier);
    this.setDust(TIER_SETTINGS[tier].beamDust);
  }

  update(
    lights: readonly FlashlightState[],
    camera: THREE.Camera,
    dt: number,
    time: number,
    pixelRatio: number,
  ): void {
    const n = Math.min(lights.length, this.capacity);
    this.beamList.length = this.poolList.length = this.spotList.length = 0;
    this.byId.clear();
    for (let i = 0; i < n; i++) {
      const l = lights[i] as FlashlightState;
      const s = this.slots[i] as Slot;
      castBeamFan(this.grid, l.x, l.z, l.yaw, s.rays);
      const b = s.beam;
      b.x = l.x;
      b.y = l.y;
      b.z = l.z;
      b.yaw = l.yaw;
      b.pitch = l.pitch;
      b.intensity = l.intensity;
      this.beamList.push(b);
      this.byId.set(l.id, b);
      const cp = Math.cos(l.pitch);
      const sp = s.spot;
      sp.id = l.id;
      sp.x = l.x;
      sp.y = l.y;
      sp.z = l.z;
      sp.dx = -Math.sin(l.yaw) * cp;
      sp.dy = -Math.sin(l.pitch);
      sp.dz = -Math.cos(l.yaw) * cp;
      sp.intensity = l.intensity;
      this.spotList.push(sp);
    }

    this.spots.update(this.spotList, camera.position.x, camera.position.z, dt);

    for (let i = 0; i < n; i++) {
      const l = lights[i] as FlashlightState;
      const p = (this.slots[i] as Slot).pool;
      p.x = l.x;
      p.y = l.y;
      p.z = l.z;
      p.pitch = l.pitch;
      // The real light lights the scene itself; hand the fake pool over as it fades in.
      p.intensity = l.intensity * (1 - this.spots.weightOf(l.id));
      this.poolList.push(p);
    }
    this.beams.update(this.beamList);
    this.pools.update(this.poolList);

    if (this.dust) {
      for (let i = 0; i < this.dust.slots; i++) {
        this.dustBeams[i] = this.byId.get(this.spots.holderAt(i)) ?? null;
        this.dustWeights[i] = this.spots.weightAt(i);
      }
      this.dust.update(this.dustBeams, this.dustWeights, time, pixelRatio);
    }
  }

  debugLine(): string {
    const holders: string[] = [];
    for (let i = 0; i < this.spots.size; i++) {
      const id = this.spots.holderAt(i);
      holders.push(id < 0 ? '-' : `g${id}`);
    }
    return `spots   ${holders.join(' ')}${this.dust ? '  dust' : ''}`;
  }

  private setDust(on: boolean): void {
    if (this.dust && (!on || this.dust.slots !== this.spots.size)) {
      this.group.remove(this.dust.points);
      this.dust.dispose();
      this.dust = null;
    }
    if (on && !this.dust) {
      this.dust = new BeamDust(this.spots.size, this.random);
      this.group.add(this.dust.points);
    }
  }

  dispose(): void {
    this.beams.dispose();
    this.pools.dispose();
    this.spots.dispose();
    this.dust?.dispose();
    this.group.removeFromParent();
  }
}
