// Guard bodies and their in-world signals. Bodies are the skinned Mixamo guards (guard-models.ts) once
// that model has loaded, and until then (or if it is missing) one InstancedMesh of capsules with a
// flashlight nub showing facing. One instanced billboard mesh draws lens glows, the "?" / "!" state
// icons and the gun's wind-up tell and muzzle flash for either.
// Reads guard sim state and interpolates it; never writes back.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Guard } from '../ai/guard';
import { BODIES, FLASHLIGHT, GUARD, GUARD_VISUALS as V } from '../config/tunables';
import { lerpAngle } from '../core/angles';
import { flickerIntensity } from '../lighting/flicker';
import type { FlashlightState } from '../lighting/flashlights';
import type { DeathClip } from './guard-anim';
import { GuardRigs, type GuardModel } from './guard-models';

const PITCH = THREE.MathUtils.degToRad(GUARD.flashlightPitchDeg);
const DROP_PITCH = THREE.MathUtils.degToRad(BODIES.dropLensPitchDeg);
/** Billboard atlas cells: lens glow, "?", "!". */
const CELL_GLOW = 0;
const CELL_QUESTION = 1;
const CELL_BANG = 2;
const CELLS = 3;
const ATLAS_CELL_PX = 64;

/** Interpolated lens pose and brightness for a guard's flashlight. Writes into and returns `out`. */
export function guardFlashlight(
  g: Guard,
  alpha: number,
  time: number,
  out: FlashlightState,
): FlashlightState {
  out.id = g.id;
  out.intensity = flickerIntensity(g.flicker, time, g.id);
  if (g.dead) {
    out.x = g.dropLens.x;
    out.y = g.dropLens.height;
    out.z = g.dropLens.z;
    out.yaw = g.dropLens.yaw;
    out.pitch = DROP_PITCH;
    return out;
  }
  const x = g.prevPos.x + (g.pos.x - g.prevPos.x) * alpha;
  const z = g.prevPos.z + (g.pos.z - g.prevPos.z) * alpha;
  const yaw = lerpAngle(g.prevYaw, g.yaw, alpha);
  out.x = x - Math.sin(yaw) * GUARD.flashlightForward;
  out.y = GUARD.flashlightHeight;
  out.z = z - Math.cos(yaw) * GUARD.flashlightForward;
  out.yaw = yaw;
  out.pitch = PITCH;
  return out;
}

function buildBodyGeometry(): THREE.BufferGeometry {
  const r = V.bodyRadius;
  const body = new THREE.CapsuleGeometry(r, GUARD.height - 2 * r, 4, 12).translate(
    0,
    GUARD.height / 2,
    0,
  );
  // Flashlight nub: a short cylinder pointing forward (−Z) at lens height.
  const nubLength = 0.22;
  const nub = new THREE.CylinderGeometry(0.05, 0.06, nubLength, 10)
    .rotateX(Math.PI / 2)
    .translate(0, GUARD.flashlightHeight, -(GUARD.flashlightForward - nubLength / 2));
  const merged = mergeGeometries([body, nub]);
  body.dispose();
  nub.dispose();
  if (!merged) throw new Error('guard body geometry merge failed');
  return merged;
}

function buildAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_CELL_PX * CELLS;
  canvas.height = ATLAS_CELL_PX;
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  const half = ATLAS_CELL_PX / 2;
  const glow = g.createRadialGradient(half, half, 0, half, half, half);
  glow.addColorStop(0, 'rgba(255,255,255,1)');
  glow.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = glow;
  g.fillRect(CELL_GLOW * ATLAS_CELL_PX, 0, ATLAS_CELL_PX, ATLAS_CELL_PX);
  g.font = `900 ${ATLAS_CELL_PX * 0.8}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#fff';
  g.shadowColor = 'rgba(255,255,255,0.8)';
  g.shadowBlur = ATLAS_CELL_PX * 0.12;
  g.fillText('?', (CELL_QUESTION + 0.5) * ATLAS_CELL_PX, half + 2);
  g.fillText('!', (CELL_BANG + 0.5) * ATLAS_CELL_PX, half + 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const BILLBOARD_VERTEX = /* glsl */ `
  attribute vec4 aCenter; // xyz, w = size (m)
  attribute vec4 aTint;   // rgb × brightness, a = atlas cell
  varying vec2 vUv;
  varying vec3 vTint;
  void main() {
    vec4 mv = viewMatrix * vec4(aCenter.xyz, 1.0);
    mv.xy += position.xy * aCenter.w;
    vUv = vec2((aTint.a + uv.x) / ${CELLS.toFixed(1)}, uv.y);
    vTint = aTint.rgb;
    gl_Position = projectionMatrix * mv;
  }
`;

const BILLBOARD_FRAGMENT = /* glsl */ `
  uniform sampler2D uAtlas;
  varying vec2 vUv;
  varying vec3 vTint;
  void main() {
    vec4 t = texture2D(uAtlas, vUv);
    gl_FragColor = vec4(vTint * t.rgb, t.a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class GuardVisuals {
  readonly group = new THREE.Group();
  private readonly bodies: THREE.InstancedMesh;
  private readonly billboards: THREE.Mesh;
  private readonly geo: THREE.InstancedBufferGeometry;
  private readonly center: THREE.InstancedBufferAttribute;
  private readonly tint: THREE.InstancedBufferAttribute;
  private readonly atlas: THREE.CanvasTexture;
  private rigs: GuardRigs | null = null;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly side = new THREE.Vector3(1, 0, 0);
  private readonly qFall = new THREE.Quaternion();
  private readonly colors = {
    suspicious: new THREE.Color(V.suspiciousColor),
    search: new THREE.Color(V.searchColor),
    alert: new THREE.Color(V.alertColor),
    lens: new THREE.Color(FLASHLIGHT.color),
    flash: new THREE.Color(V.muzzleFlashColor),
  };

  constructor(readonly capacity: number) {
    const n = Math.max(1, capacity);
    this.bodies = new THREE.InstancedMesh(
      buildBodyGeometry(),
      new THREE.MeshStandardMaterial({ color: V.bodyColor, roughness: 0.7 }),
      n,
    );
    this.bodies.name = 'guards';
    this.bodies.castShadow = this.bodies.receiveShadow = true;
    this.bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bodies.frustumCulled = false;
    this.bodies.count = 0;

    // Up to three billboards per guard: lens glow, state icon, and the muzzle tell or flash.
    this.atlas = buildAtlas();
    this.geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geo.index = quad.index;
    this.geo.setAttribute('position', quad.getAttribute('position'));
    this.geo.setAttribute('uv', quad.getAttribute('uv'));
    this.center = new THREE.InstancedBufferAttribute(new Float32Array(n * 3 * 4), 4);
    this.tint = new THREE.InstancedBufferAttribute(new Float32Array(n * 3 * 4), 4);
    this.center.setUsage(THREE.DynamicDrawUsage);
    this.tint.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aCenter', this.center);
    this.geo.setAttribute('aTint', this.tint);
    this.geo.instanceCount = 0;
    this.billboards = new THREE.Mesh(
      this.geo,
      new THREE.ShaderMaterial({
        uniforms: { uAtlas: { value: this.atlas } },
        vertexShader: BILLBOARD_VERTEX,
        fragmentShader: BILLBOARD_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.billboards.name = 'guard-billboards';
    this.billboards.frustumCulled = false;
    this.group.add(this.bodies, this.billboards);
  }

  /** Swap the capsules for skinned guards. */
  setModel(model: GuardModel): void {
    this.rigs?.group.removeFromParent();
    this.rigs?.dispose();
    this.rigs = new GuardRigs(model, this.capacity);
    this.group.add(this.rigs.group);
    this.bodies.visible = false;
  }

  /** A new attempt (or level): animations start over. */
  reset(): void {
    this.rigs?.reset();
  }

  /** How guard `i` was killed, so he falls the right way. */
  setDeath(i: number, clip: DeathClip): void {
    this.rigs?.setDeath(i, clip);
  }

  /**
   * `lights[i]` must be guardFlashlight(guards[i], …) for this frame. With skinned guards, each
   * light is moved to the flashlight in his hand, so call this before rendering the beams.
   */
  update(
    guards: readonly Guard[],
    lights: FlashlightState[],
    alpha: number,
    frameDt: number,
    camera: THREE.Camera,
  ): void {
    const n = Math.min(guards.length, this.capacity);
    this.rigs?.update(guards, lights, alpha, frameDt, camera);
    const ce = this.center.array as Float32Array;
    const ti = this.tint.array as Float32Array;
    let b = 0;
    const put = (
      x: number,
      y: number,
      z: number,
      size: number,
      color: THREE.Color,
      k: number,
      cell: number,
    ) => {
      const o = b * 4;
      ce[o] = x;
      ce[o + 1] = y;
      ce[o + 2] = z;
      ce[o + 3] = size;
      ti[o] = color.r * k;
      ti[o + 1] = color.g * k;
      ti[o + 2] = color.b * k;
      ti[o + 3] = cell;
      b++;
    };
    for (let i = 0; i < n; i++) {
      const g = guards[i] as Guard;
      const l = lights[i] as FlashlightState;
      const x = g.prevPos.x + (g.pos.x - g.prevPos.x) * alpha;
      const z = g.prevPos.z + (g.pos.z - g.prevPos.z) * alpha;
      let y = 0;
      if (this.rigs) {
        // Skinned bodies were posed above.
      } else if (g.dead) {
        // Tip forward about the feet onto the floor, lifted so the capsule rests on its side.
        const fall = Math.min(1, g.deadFor / V.fallS) * (Math.PI / 2);
        this.q
          .setFromAxisAngle(this.up, g.yaw)
          .multiply(this.qFall.setFromAxisAngle(this.side, -fall));
        y = V.bodyRadius * Math.sin(fall);
      } else {
        this.q.setFromAxisAngle(this.up, l.yaw);
      }
      if (!this.rigs)
        this.bodies.setMatrixAt(i, this.m.compose(this.p.set(x, y, z), this.q, this.one));

      // Lens glow: bright when the guard faces the camera.
      const tx = camera.position.x - l.x;
      const ty = camera.position.y - l.y;
      const tz = camera.position.z - l.z;
      const len = Math.hypot(tx, ty, tz) || 1;
      const cp = Math.cos(l.pitch);
      const facing =
        (-Math.sin(l.yaw) * cp * tx - Math.sin(l.pitch) * ty - Math.cos(l.yaw) * cp * tz) / len;
      const glow = Math.pow(Math.max(0, facing), V.lensGlowFalloff) * l.intensity;
      if (glow > 0.01) put(l.x, l.y, l.z, V.lensGlowSize, this.colors.lens, glow, CELL_GLOW);

      if (g.state !== 'patrol' && !g.dead) {
        const color = this.colors[g.state];
        put(
          x,
          V.iconHeight,
          z,
          V.iconSize,
          color,
          1,
          g.state === 'alert' ? CELL_BANG : CELL_QUESTION,
        );
      }

      // The gun, held low on his right: a red glint swelling through the wind-up, then the flash.
      if (!g.dead) {
        const yaw = l.yaw;
        const mx = x - Math.sin(yaw) * V.muzzleForward + Math.cos(yaw) * V.muzzleRight;
        const mz = z - Math.cos(yaw) * V.muzzleForward - Math.sin(yaw) * V.muzzleRight;
        const w = g.gun.windupFraction;
        if (g.gun.sinceShot < V.muzzleFlashS) {
          put(mx, V.muzzleHeight, mz, V.muzzleFlashSize, this.colors.flash, 1.5, CELL_GLOW);
        } else if (w > 0) {
          const size = V.tellSizeMin + (V.tellSizeMax - V.tellSizeMin) * w;
          put(mx, V.muzzleHeight, mz, size, this.colors.alert, 0.6 + 0.9 * w, CELL_GLOW);
        }
      }
    }
    this.bodies.count = this.rigs ? 0 : n;
    this.bodies.instanceMatrix.needsUpdate = true;
    this.geo.instanceCount = b;
    this.center.needsUpdate = this.tint.needsUpdate = true;
  }

  dispose(): void {
    this.bodies.geometry.dispose();
    (this.bodies.material as THREE.Material).dispose();
    this.bodies.dispose();
    this.geo.dispose();
    (this.billboards.material as THREE.Material).dispose();
    this.atlas.dispose();
    this.rigs?.dispose();
  }
}
