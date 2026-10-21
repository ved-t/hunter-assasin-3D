// Fake light pools: additive soft quads where each flashlight's rays land, on the floor and on walls.
// Two InstancedMeshes (floor, walls) for every guard, so two draw calls in total. Because each ray
// stops at its own wall, a beam that grazes a corner splashes the near wall and lights the corridor
// beyond it, which is what lets the player read a guard's light around a corner.

import * as THREE from 'three';
import { FLASHLIGHT, LEVEL } from '../config/tunables';
import { radialTexture } from '../level/mesh-builder';
import type { BeamRays } from './beam-rays';

const RAYS: number = FLASHLIGHT.rays;
/** Floor samples per ray: a near one and a far one, so the pool reads as a fan, not a row of dots. */
const FLOOR_SAMPLES = [0.55, 1] as const;
/** Keep floor pools this far short of the wall a ray hits (m). */
const WALL_GAP = 0.3;
/** Wall pools stay inside this band of the wall's height (m from floor / top). */
const WALL_MARGIN = 0.4;

export interface PoolSource {
  /** Lens position. */
  x: number;
  y: number;
  z: number;
  /** Tilt below level (rad). */
  pitch: number;
  rays: BeamRays;
  /** Brightness 0..1, already reduced where a real SpotLight carries this flashlight. */
  intensity: number;
}

export class PoolMesh {
  readonly group = new THREE.Group();
  private readonly floor: THREE.InstancedMesh;
  private readonly walls: THREE.InstancedMesh;
  private readonly texture: THREE.Texture;
  private readonly base = new THREE.Color(FLASHLIGHT.color);
  private readonly c = new THREE.Color();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly p = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(capacity: number) {
    this.texture = radialTexture();
    const material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
    });
    const floorGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const wallGeo = new THREE.PlaneGeometry(1, 1); // faces +Z; rotated to the wall normal
    const n = Math.max(1, capacity);
    this.floor = new THREE.InstancedMesh(floorGeo, material, n * RAYS * FLOOR_SAMPLES.length);
    this.walls = new THREE.InstancedMesh(wallGeo, material, n * RAYS);
    for (const mesh of [this.floor, this.walls]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // Allocate instanceColor now so its buffer never changes size.
      mesh.setColorAt(0, this.c.setRGB(0, 0, 0));
      mesh.instanceColor?.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
    this.floor.name = 'flashlight-floor-pools';
    this.walls.name = 'flashlight-wall-pools';
  }

  update(sources: readonly PoolSource[]): void {
    let nf = 0;
    let nw = 0;
    const maxF = this.floor.instanceMatrix.count;
    const maxW = this.walls.instanceMatrix.count;
    for (const src of sources) {
      if (src.intensity <= 0.001) continue;
      const tanPitch = Math.tan(src.pitch);
      // Where the beam's axis meets the floor.
      const axisFloor = tanPitch > 0 ? src.y / tanPitch : FLASHLIGHT.floorMaxM;
      const r = src.rays;
      for (let i = 0; i < RAYS; i++) {
        const len = r.lengths[i] as number;
        const dx = r.dirX[i] as number;
        const dz = r.dirZ[i] as number;
        const yaw = Math.atan2(dx, dz);
        this.q.setFromAxisAngle(this.up, yaw);
        // Floor: near and far samples along the ray, short of any wall.
        const reach = Math.min(axisFloor, len - WALL_GAP, FLASHLIGHT.floorMaxM);
        for (const f of FLOOR_SAMPLES) {
          if (nf >= maxF || reach <= 0) break;
          const d = reach * f;
          const size = Math.max(FLASHLIGHT.poolMinSizeM, FLASHLIGHT.poolSizePerM * d);
          const a = this.falloff(d) * src.intensity;
          this.s.set(size, 1, size * FLASHLIGHT.floorPoolStretch);
          this.p.set(src.x + dx * d, LEVEL.decalLift * 3, src.z + dz * d);
          this.floor.setMatrixAt(nf, this.m.compose(this.p, this.q, this.s));
          this.floor.setColorAt(nf, this.c.copy(this.base).multiplyScalar(a));
          nf++;
        }
        // Wall: a splash where the ray hits, at the height the beam axis would reach.
        if (r.hit[i] && nw < maxW) {
          const size = Math.max(FLASHLIGHT.poolMinSizeM, FLASHLIGHT.poolSizePerM * len);
          const y = THREE.MathUtils.clamp(
            src.y - len * tanPitch,
            WALL_MARGIN,
            LEVEL.wallHeight - WALL_MARGIN,
          );
          const nx = r.nx[i] as number;
          const nz = r.nz[i] as number;
          this.q.setFromAxisAngle(this.up, Math.atan2(nx, nz));
          this.s.set(size, size, 1);
          this.p.set(
            src.x + dx * len + nx * FLASHLIGHT.poolLift,
            y,
            src.z + dz * len + nz * FLASHLIGHT.poolLift,
          );
          this.walls.setMatrixAt(nw, this.m.compose(this.p, this.q, this.s));
          this.walls.setColorAt(
            nw,
            this.c.copy(this.base).multiplyScalar(this.falloff(len) * src.intensity),
          );
          nw++;
        }
      }
    }
    this.floor.count = nf;
    this.walls.count = nw;
    for (const mesh of [this.floor, this.walls]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  /** Pool brightness for light that travelled d metres. */
  private falloff(d: number): number {
    const t = Math.min(1, d / FLASHLIGHT.rangeM);
    return FLASHLIGHT.poolOpacity * (1 - t) * (1 - t);
  }

  dispose(): void {
    for (const mesh of [this.floor, this.walls]) {
      mesh.geometry.dispose();
      mesh.dispose();
    }
    (this.floor.material as THREE.Material).dispose();
    this.texture.dispose();
  }
}
