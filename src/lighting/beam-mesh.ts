// Fake flashlight beams: one InstancedMesh for every beam (one draw call). Each instance is an open
// cone, additive, soft at grazing angles and fading along its length. The cone's rim is pulled in
// per horizontal sector to the 7 ray lengths, so a beam never shows through the wall it hits.
// High tier adds one Points cloud of dust drifting inside the beams that hold a real light.

import * as THREE from 'three';
import { FLASHLIGHT, LEVEL } from '../config/tunables';
import { rayAngle } from './beam-rays';

const HALF = THREE.MathUtils.degToRad(FLASHLIGHT.halfAngleDeg);
const RAYS: number = FLASHLIGHT.rays;
/** Ray lengths travel in two vec4 instance attributes. */
const MAX_RAYS = 8;
if (RAYS > MAX_RAYS) throw new Error(`FLASHLIGHT.rays must be ≤ ${MAX_RAYS}`);
const RADIAL_SEGMENTS = 24;
/** Lens radius of the cone's narrow end (m). */
const LENS_RADIUS = 0.04;

/** Per-beam data the visuals need each frame. */
export interface BeamInstance {
  /** Lens position. */
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Tilt below level (rad). */
  pitch: number;
  /** 0..1 (flicker × on/off). */
  intensity: number;
  /** Horizontal distance to a wall per ray (ray 0 = leftmost). */
  lengths: Float32Array;
}

/** Fractional ray index for a local horizontal angle, matching beam-rays.ts. */
function rayIndexFor(angle: number): number {
  const first = rayAngle(0);
  const last = rayAngle(RAYS - 1);
  return THREE.MathUtils.clamp(((angle - first) / (last - first)) * (RAYS - 1), 0, RAYS - 1);
}

/** Open cone along −Z: a lens ring at z = 0 and a unit-direction rim ring scaled in the shader. */
function buildConeGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const rim: number[] = [];
  const ray: number[] = [];
  const horiz: number[] = [];
  const indices: number[] = [];
  const sinH = Math.sin(HALF);
  const cosH = Math.cos(HALF);
  for (let i = 0; i <= RADIAL_SEGMENTS; i++) {
    const phi = (i / RADIAL_SEGMENTS) * Math.PI * 2;
    const dx = sinH * Math.cos(phi);
    const dy = sinH * Math.sin(phi);
    const dz = -cosH;
    const angle = Math.atan2(dx, -dz);
    const r = rayIndexFor(angle);
    const h = Math.hypot(dx, dz);
    // Lens ring.
    positions.push(LENS_RADIUS * Math.cos(phi), LENS_RADIUS * Math.sin(phi), 0);
    rim.push(0);
    ray.push(r);
    horiz.push(h);
    // Rim ring: a unit direction, scaled to its clipped length in the vertex shader.
    positions.push(dx, dy, dz);
    rim.push(1);
    ray.push(r);
    horiz.push(h);
  }
  for (let i = 0; i < RADIAL_SEGMENTS; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, b, c, c, b, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('aRim', new THREE.Float32BufferAttribute(rim, 1));
  geo.setAttribute('aRay', new THREE.Float32BufferAttribute(ray, 1));
  geo.setAttribute('aHoriz', new THREE.Float32BufferAttribute(horiz, 1));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

const RAY_LENGTH_GLSL = /* glsl */ `
  float rayLength(vec4 a, vec4 b, float i) {
    int k = int(i);
    return k < 4 ? a[k] : b[k - 4];
  }
  /** Horizontal wall distance for a fractional ray index. */
  float clippedLength(vec4 a, vec4 b, float ray) {
    float lo = floor(ray);
    float hi = min(lo + 1.0, ${(RAYS - 1).toFixed(1)});
    return mix(rayLength(a, b, lo), rayLength(a, b, hi), ray - lo);
  }
`;

const BEAM_VERTEX = /* glsl */ `
  attribute float aRim;
  attribute float aRay;
  attribute float aHoriz;
  attribute vec4 aLenA;
  attribute vec4 aLenB;
  attribute vec4 aTint;
  uniform float uRange;
  varying float vDist;
  varying float vRim;
  varying float vClipped;
  varying vec3 vNormalView;
  varying vec3 vViewPos;
  varying vec4 vTint;
  ${RAY_LENGTH_GLSL}
  void main() {
    float horizontal = clippedLength(aLenA, aLenB, aRay);
    float len = min(horizontal / max(aHoriz, 0.2), uRange);
    vec3 p = aRim > 0.5 ? position * len : position;
    vDist = aRim * len;
    vRim = aRim;
    vClipped = step(horizontal, uRange - 0.05);
    vTint = aTint;
    mat4 mv = modelViewMatrix * instanceMatrix;
    vec4 viewPos = mv * vec4(p, 1.0);
    vViewPos = viewPos.xyz;
    vNormalView = normalize(mat3(mv) * normal);
    gl_Position = projectionMatrix * viewPos;
  }
`;

const BEAM_FRAGMENT = /* glsl */ `
  uniform float uRange;
  uniform float uOpacity;
  uniform float uNearFade;
  uniform float uFogDensity;
  varying float vDist;
  varying float vRim;
  varying float vClipped;
  varying vec3 vNormalView;
  varying vec3 vViewPos;
  varying vec4 vTint;
  void main() {
    // Soft edges: surfaces seen edge-on (the cone's silhouette) fade out.
    float facing = abs(dot(normalize(vNormalView), normalize(-vViewPos)));
    float soft = facing * facing;
    float t = clamp(vDist / uRange, 0.0, 1.0);
    float along = (1.0 - t) * (1.0 - t) * smoothstep(0.0, uNearFade, vDist);
    // Where a wall cut the beam short, ease it out just before the wall.
    float wallEase = 1.0 - vClipped * smoothstep(0.75, 1.0, vRim) * 0.7;
    float depth = -vViewPos.z;
    float fog = exp(-uFogDensity * uFogDensity * depth * depth);
    float a = uOpacity * vTint.a * soft * along * wallEase * fog;
    gl_FragColor = vec4(vTint.rgb, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const DUST_VERTEX = /* glsl */ `
  attribute vec3 aSeed;
  attribute float aSlot;
  uniform mat4 uSlotMatrix[SLOTS];
  uniform vec4 uSlotLenA[SLOTS];
  uniform vec4 uSlotLenB[SLOTS];
  uniform float uSlotIntensity[SLOTS];
  uniform float uRange;
  uniform float uTanHalf;
  uniform float uHalf;
  uniform float uTime;
  uniform float uDrift;
  uniform float uSize;
  uniform float uPixelRatio;
  varying float vAlpha;
  ${RAY_LENGTH_GLSL}
  void main() {
    int slot = int(aSlot);
    // Each mote drifts slowly outward along the beam and wraps.
    float u = fract(aSeed.x + uTime * uDrift / uRange);
    float s = u * uRange;
    float r = sqrt(aSeed.y) * s * uTanHalf;
    float phi = aSeed.z * 6.2831853;
    vec3 local = vec3(r * cos(phi), r * sin(phi), -s);
    float angle = atan(local.x, s);
    float ray = clamp((angle / uHalf + 1.0) * 0.5 * ${(RAYS - 1).toFixed(1)}, 0.0, ${(RAYS - 1).toFixed(1)});
    float wall = clippedLength(uSlotLenA[slot], uSlotLenB[slot], ray);
    float inside = step(length(local.xz), wall);
    vAlpha = uSlotIntensity[slot] * inside * (1.0 - u) * smoothstep(0.0, 0.15, u);
    vec4 viewPos = modelViewMatrix * uSlotMatrix[slot] * vec4(local, 1.0);
    gl_Position = projectionMatrix * viewPos;
    gl_PointSize = vAlpha > 0.0 ? uSize * uPixelRatio * clamp(4.0 / -viewPos.z, 0.5, 3.0) : 0.0;
  }
`;

const DUST_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = uOpacity * vAlpha * (1.0 - smoothstep(0.4, 1.0, d));
    gl_FragColor = vec4(uColor, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const additive = {
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
} as const;

export class BeamMesh {
  readonly mesh: THREE.InstancedMesh;
  private readonly lenA: THREE.InstancedBufferAttribute;
  private readonly lenB: THREE.InstancedBufferAttribute;
  private readonly tint: THREE.InstancedBufferAttribute;
  private readonly color = new THREE.Color(FLASHLIGHT.color);
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly p = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);

  constructor(capacity: number) {
    const geo = buildConeGeometry();
    const n = Math.max(1, capacity);
    this.lenA = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    this.lenB = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    this.tint = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    for (const a of [this.lenA, this.lenB, this.tint]) a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aLenA', this.lenA);
    geo.setAttribute('aLenB', this.lenB);
    geo.setAttribute('aTint', this.tint);
    const material = new THREE.ShaderMaterial({
      ...additive,
      side: THREE.DoubleSide,
      uniforms: {
        uRange: { value: FLASHLIGHT.rangeM },
        uOpacity: { value: FLASHLIGHT.beamOpacity },
        uNearFade: { value: FLASHLIGHT.beamNearFadeM },
        uFogDensity: { value: LEVEL.fogDensity },
      },
      vertexShader: BEAM_VERTEX,
      fragmentShader: BEAM_FRAGMENT,
    });
    this.mesh = new THREE.InstancedMesh(geo, material, n);
    this.mesh.name = 'flashlight-beams';
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    // Instances move every frame; culling by a stale bounding sphere would drop them.
    this.mesh.frustumCulled = false;
  }

  update(beams: readonly BeamInstance[]): void {
    const n = Math.min(beams.length, this.mesh.instanceMatrix.count);
    const la = this.lenA.array as Float32Array;
    const lb = this.lenB.array as Float32Array;
    const ti = this.tint.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const b = beams[i] as BeamInstance;
      this.e.set(-b.pitch, b.yaw, 0);
      this.q.setFromEuler(this.e);
      this.m.compose(this.p.set(b.x, b.y, b.z), this.q, this.one);
      this.mesh.setMatrixAt(i, this.m);
      for (let k = 0; k < MAX_RAYS; k++) {
        const v = k < RAYS ? (b.lengths[k] as number) : FLASHLIGHT.rangeM;
        if (k < 4) la[i * 4 + k] = v;
        else lb[i * 4 + k - 4] = v;
      }
      ti[i * 4] = this.color.r;
      ti[i * 4 + 1] = this.color.g;
      ti[i * 4 + 2] = this.color.b;
      ti[i * 4 + 3] = b.intensity;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.lenA.needsUpdate = this.lenB.needsUpdate = this.tint.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}

/** Dust motes for up to `slots` beams (the real-lit ones), one draw call. */
export class BeamDust {
  readonly points: THREE.Points;
  private readonly material: THREE.ShaderMaterial;
  private readonly matrices: THREE.Matrix4[];
  private readonly lenA: THREE.Vector4[];
  private readonly lenB: THREE.Vector4[];
  private readonly intensity: number[];
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly p = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);

  constructor(
    readonly slots: number,
    seed: () => number,
  ) {
    const count = slots * FLASHLIGHT.dustPerBeam;
    const seeds = new Float32Array(count * 3);
    const slot = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      seeds[i * 3] = seed();
      seeds[i * 3 + 1] = seed();
      seeds[i * 3 + 2] = seed();
      slot[i] = Math.floor(i / FLASHLIGHT.dustPerBeam);
    }
    const geo = new THREE.BufferGeometry();
    // Positions are computed in the shader; three still needs a position attribute to draw.
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 3));
    geo.setAttribute('aSlot', new THREE.Float32BufferAttribute(slot, 1));
    this.matrices = Array.from({ length: slots }, () => new THREE.Matrix4());
    this.lenA = Array.from({ length: slots }, () => new THREE.Vector4());
    this.lenB = Array.from({ length: slots }, () => new THREE.Vector4());
    this.intensity = new Array<number>(slots).fill(0);
    this.material = new THREE.ShaderMaterial({
      ...additive,
      defines: { SLOTS: Math.max(1, slots) },
      uniforms: {
        uSlotMatrix: { value: this.matrices },
        uSlotLenA: { value: this.lenA },
        uSlotLenB: { value: this.lenB },
        uSlotIntensity: { value: this.intensity },
        uRange: { value: FLASHLIGHT.rangeM },
        uTanHalf: { value: Math.tan(HALF) },
        uHalf: { value: HALF },
        uTime: { value: 0 },
        uDrift: { value: FLASHLIGHT.dustDriftMPerS },
        uSize: { value: FLASHLIGHT.dustSizePx },
        uPixelRatio: { value: 1 },
        uColor: { value: new THREE.Color(FLASHLIGHT.color) },
        uOpacity: { value: FLASHLIGHT.dustOpacity },
      },
      vertexShader: DUST_VERTEX,
      fragmentShader: DUST_FRAGMENT,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.name = 'beam-dust';
    this.points.frustumCulled = false;
  }

  /** `beams[i]` is the beam carried by slot i, or null; `weights[i]` its real-light weight. */
  update(
    beams: readonly (BeamInstance | null)[],
    weights: readonly number[],
    time: number,
    pixelRatio: number,
  ): void {
    for (let i = 0; i < this.slots; i++) {
      const b = beams[i];
      if (!b) {
        this.intensity[i] = 0;
        continue;
      }
      this.e.set(-b.pitch, b.yaw, 0);
      this.q.setFromEuler(this.e);
      (this.matrices[i] as THREE.Matrix4).compose(this.p.set(b.x, b.y, b.z), this.q, this.one);
      const l = b.lengths;
      const at = (k: number) => (k < RAYS ? (l[k] as number) : FLASHLIGHT.rangeM);
      (this.lenA[i] as THREE.Vector4).set(at(0), at(1), at(2), at(3));
      (this.lenB[i] as THREE.Vector4).set(at(4), at(5), at(6), at(7));
      this.intensity[i] = b.intensity * (weights[i] ?? 0);
    }
    const u = this.material.uniforms;
    (u.uTime as THREE.IUniform<number>).value = time;
    (u.uPixelRatio as THREE.IUniform<number>).value = pixelRatio;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
