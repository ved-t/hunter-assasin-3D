// The first-person gloved hand and knife, built in code (smooth-shaded, mid-detail) and drawn in an
// overlay pass: its own small scene, camera and fixed lights, rendered after the world over a cleared
// depth buffer so it never clips into walls. Three draw calls: hand (glove and sleeve in vertex colours),
// blade, grip. Its lights are created once here and only change intensity, so nothing recompiles.
//
// Hand space (a right hand): the grip runs along +Y (blade up), the back of the hand faces −X, the
// fingers close round the front (+Z) to the palm (+X), and the forearm leaves the heel of the hand
// toward −Z, bent toward −Y by the wrist angle.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { VIEWMODEL as V } from '../config/tunables';
import type { GloveLook, KnifeLook } from '../config/unlocks';
import type { ViewmodelPose } from '../player/viewmodel';

const SLEEVE_COLOR = new THREE.Color(0x15171b);
const STEEL_COLOR = new THREE.Color(0x3a3d42);
const BLADE_LENGTH = 0.15;
const BLADE_WIDTH = 0.026;
const GUARD_Y = 0.05;
const UP = new THREE.Vector3(0, 1, 0);

/** Merges parts (all made non-indexed so they can mix) and frees them. */
function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  const g = mergeGeometries(flat);
  for (const p of new Set([...parts, ...flat])) p.dispose();
  if (!g) throw new Error('viewmodel geometry merge failed');
  return g;
}

/** A finger (or thumb) as a tube along `points`, rounded at the tip and at the knuckle. */
function digit(points: THREE.Vector3[], radius: number): THREE.BufferGeometry {
  const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 14, radius, 8, false);
  const a = points[0] as THREE.Vector3;
  const b = points[points.length - 1] as THREE.Vector3;
  const knuckle = new THREE.SphereGeometry(radius * 1.1, 8, 6).translate(a.x, a.y, a.z);
  const tip = new THREE.SphereGeometry(radius, 8, 6).translate(b.x, b.y, b.z);
  return merged([tube, knuckle, tip]);
}

/** A finger closing round the grip at height y: from its knuckle on the back of the hand, round the
 * front, to the tip pressed into the palm. A spiral, so the knuckle stands proud of the grip. */
function finger(y: number, radius: number, wrapDeg: number): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  const start = THREE.MathUtils.degToRad(25);
  const end = THREE.MathUtils.degToRad(wrapDeg);
  const n = 7;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const a = start + (end - start) * u;
    const r = 0.025 + 0.012 * (1 - u) * (1 - u);
    pts.push(new THREE.Vector3(-Math.cos(a) * r, y - 0.004 * u, Math.sin(a) * r));
  }
  return digit(pts, radius);
}

/** A tapered tube of `length` along `dir`, centred `along` metres from `from`. */
function limb(
  rNear: number,
  rFar: number,
  length: number,
  from: THREE.Vector3,
  dir: THREE.Vector3,
  along: number,
  open: boolean,
): THREE.BufferGeometry {
  // CylinderGeometry runs along +Y with radiusTop at +Y: turn +Y back toward the hand.
  const g = new THREE.CylinderGeometry(rNear, rFar, length, 16, 1, open);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().negate()));
  const c = from.clone().addScaledVector(dir, along);
  return g.translate(c.x, c.y, c.z);
}

function colorize(g: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const n = g.getAttribute('position').count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) color.toArray(c, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

/** Direction the forearm leaves the fist, in hand space. */
function forearmDir(): THREE.Vector3 {
  const w = THREE.MathUtils.degToRad(V.wristAngleDeg);
  return new THREE.Vector3(0, Math.cos(w), -Math.sin(w));
}

/** Glove (first `gloveVerts` vertices) and sleeve as one geometry. */
function buildHand(): { geometry: THREE.BufferGeometry; gloveVerts: number } {
  // Back of the hand and palm: reaches forward to the knuckles, back to the heel.
  const fist = new RoundedBoxGeometry(0.04, 0.086, 0.058, 3, 0.015).translate(
    -0.018,
    -0.002,
    -0.017,
  );
  const fingers = [
    finger(0.03, 0.0095, 240),
    finger(0.01, 0.0098, 245),
    finger(-0.01, 0.0093, 240),
    finger(-0.028, 0.0083, 230),
  ];
  // The thumb comes off the palm on the inner side and closes over the index and middle fingers.
  const thumb = digit(
    [
      new THREE.Vector3(0.004, -0.01, -0.038),
      new THREE.Vector3(0.022, 0.012, -0.026),
      new THREE.Vector3(0.03, 0.026, -0.002),
      new THREE.Vector3(0.02, 0.03, 0.02),
      new THREE.Vector3(0.004, 0.026, 0.03),
    ],
    0.0105,
  );
  // Wrist and a slightly flared glove cuff, then the sleeve, running from the heel of the hand.
  const heel = new THREE.Vector3(-0.014, -0.02, -0.04);
  const dir = forearmDir();
  const wrist = limb(0.028, 0.03, 0.08, heel, dir, 0.035, true);
  const cuff = limb(0.033, 0.036, 0.035, heel, dir, 0.085, false);
  const glove = colorize(merged([fist, ...fingers, thumb, wrist, cuff]), new THREE.Color(1, 1, 1));
  const sleeve = colorize(merged([limb(0.04, 0.05, 0.4, heel, dir, 0.3, true)]), SLEEVE_COLOR);
  const gloveVerts = glove.getAttribute('position').count;
  const geometry = mergeGeometries([glove, sleeve]);
  glove.dispose();
  sleeve.dispose();
  if (!geometry) throw new Error('hand geometry merge failed');
  return { geometry, gloveVerts };
}

/** Drop-point blade: a flat profile, extruded thin with a bevel that reads as the ground edge. */
function buildBlade(): THREE.BufferGeometry {
  const w = BLADE_WIDTH / 2;
  const L = BLADE_LENGTH;
  const s = new THREE.Shape();
  s.moveTo(-w, 0);
  s.lineTo(-w, L * 0.72);
  s.quadraticCurveTo(-w, L * 0.93, -w + 0.003, L);
  s.quadraticCurveTo(w, L * 0.84, w, L * 0.45);
  s.lineTo(w, 0);
  s.closePath();
  const depth = 0.0012;
  const g = new THREE.ExtrudeGeometry(s, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.0011,
    bevelSize: 0.0012,
    bevelSegments: 2,
    curveSegments: 12,
  });
  // Profile X becomes hand Z (edge forward, toward the fingers); the flats face ±X.
  return g
    .translate(0, 0, -depth / 2)
    .rotateY(-Math.PI / 2)
    .translate(0, GUARD_Y + 0.005, 0);
}

/** Grip (lathe with finger swells), crossguard and pommel ring; steel parts darker in vertex colour.
 * The first `gripVerts` vertices are the grip, recoloured per knife skin. */
function buildGrip(): { geometry: THREE.BufferGeometry; gripVerts: number } {
  const profile = [
    [0, -0.064],
    [0.009, -0.063],
    [0.0135, -0.059],
    [0.0135, -0.054],
    [0.0128, -0.05],
    [0.0152, -0.03],
    [0.0138, -0.012],
    [0.0152, 0.008],
    [0.0138, 0.026],
    [0.0145, 0.04],
    [0.0135, 0.047],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const grip = colorize(
    merged([new THREE.LatheGeometry(profile, 16).scale(0.85, 1, 1)]),
    new THREE.Color(1, 1, 1),
  );
  const guard = new RoundedBoxGeometry(0.012, 0.007, 0.046, 2, 0.0025).translate(0, GUARD_Y, 0);
  const pommel = new THREE.TorusGeometry(0.0128, 0.0022, 6, 16)
    .rotateX(Math.PI / 2)
    .translate(0, -0.055, 0);
  const steel = colorize(merged([guard, pommel]), STEEL_COLOR);
  const gripVerts = grip.getAttribute('position').count;
  const geometry = mergeGeometries([grip, steel]);
  grip.dispose();
  steel.dispose();
  if (!geometry) throw new Error('grip geometry merge failed');
  return { geometry, gripVerts };
}

/** A procedural damascus figure: wavy light and dark bands. */
function damascusTexture(): THREE.CanvasTexture {
  const w = 256;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      const wave =
        v * 14 +
        Math.sin(u * Math.PI * 6 + Math.sin(v * 9) * 1.5) * 0.9 +
        Math.sin(u * Math.PI * 14) * 0.25;
      const k = Math.round(150 + 105 * (0.5 + 0.5 * Math.sin(wave * Math.PI * 2)));
      const o = (y * w + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = k;
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  // Blade UVs are the profile's metres: one pattern across the blade's width and along its length.
  tex.repeat.set(1 / BLADE_WIDTH, 1 / BLADE_LENGTH);
  return tex;
}

function setColors(g: THREE.BufferGeometry, from: number, to: number, color: THREE.Color): void {
  const attr = g.getAttribute('color') as THREE.BufferAttribute;
  for (let i = from; i < to; i++) attr.setXYZ(i, color.r, color.g, color.b);
  attr.needsUpdate = true;
}

/** Rotation taking hand space to the rest pose: grip (+Y) along the blade direction, back of the
 * hand (−X) toward the dorsum direction (made perpendicular to the blade). */
function restRotation(): THREE.Quaternion {
  const b = V.restBlade;
  const d = V.restDorsum;
  const blade = new THREE.Vector3(b.x, b.y, b.z).normalize();
  const dorsum = new THREE.Vector3(d.x, d.y, d.z);
  dorsum.addScaledVector(blade, -dorsum.dot(blade)).normalize();
  // Hand axes in view space: X = −dorsum, Y = blade, Z = X × Y.
  const x = dorsum.clone().negate();
  const z = new THREE.Vector3().crossVectors(x, blade);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, blade, z));
}

export class ViewmodelMesh {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(V.fovDeg, 1, V.near, V.far);
  /** Hand space, posed every frame relative to the overlay camera. */
  private readonly rig = new THREE.Group();
  private readonly handMat = new THREE.MeshStandardMaterial({ vertexColors: true });
  private readonly bladeMat = new THREE.MeshStandardMaterial();
  private readonly gripMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
  private readonly hand: THREE.Mesh;
  private readonly grip: THREE.Mesh;
  private readonly gloveVerts: number;
  private readonly gripVerts: number;
  private readonly key: THREE.DirectionalLight;
  private readonly rest = restRotation();
  private readonly offset = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private damascus: THREE.CanvasTexture | null = null;
  private readonly color = new THREE.Color();

  constructor() {
    const hand = buildHand();
    const grip = buildGrip();
    this.gloveVerts = hand.gloveVerts;
    this.gripVerts = grip.gripVerts;
    this.hand = new THREE.Mesh(hand.geometry, this.handMat);
    this.grip = new THREE.Mesh(grip.geometry, this.gripMat);
    const blade = new THREE.Mesh(buildBlade(), this.bladeMat);
    for (const m of [this.hand, this.grip, blade]) {
      m.frustumCulled = false;
      this.rig.add(m);
    }
    this.camera.add(this.rig);
    this.scene.add(this.camera);
    this.scene.add(new THREE.HemisphereLight(V.fillSky, V.fillGround, V.fillIntensity));
    this.key = new THREE.DirectionalLight(V.keyColor, V.keyBase);
    this.key.position.set(-0.4, 1, 0.6);
    this.scene.add(this.key);
  }

  setKnife(look: KnifeLook): void {
    this.bladeMat.color.setHex(look.blade);
    this.bladeMat.metalness = look.metalness;
    this.bladeMat.roughness = look.roughness;
    const wantMap = look.pattern === 'damascus';
    if (wantMap && !this.damascus) this.damascus = damascusTexture();
    const map = wantMap ? this.damascus : null;
    if (this.bladeMat.map !== map) {
      this.bladeMat.map = map;
      this.bladeMat.needsUpdate = true;
    }
    setColors(this.grip.geometry, 0, this.gripVerts, this.color.setHex(look.grip));
  }

  setGlove(look: GloveLook): void {
    this.handMat.roughness = look.roughness;
    setColors(this.hand.geometry, 0, this.gloveVerts, this.color.setHex(look.color));
  }

  /** Per frame: follow the world camera's aspect, pose the hand, light it by the player's exposure. */
  update(pose: ViewmodelPose, aspect: number, exposure: number, visible: boolean): void {
    this.rig.visible = visible;
    if (this.camera.aspect !== aspect) {
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
    }
    const p = V.restPos;
    this.rig.position.set(p.x + pose.x, p.y + pose.y, p.z + pose.z);
    this.offset.setFromEuler(this.euler.set(pose.rx, pose.ry, pose.rz));
    this.rig.quaternion.multiplyQuaternions(this.offset, this.rest);
    this.key.intensity = V.keyBase + V.keyPerExposure * exposure;
  }

  dispose(): void {
    this.rig.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    for (const m of [this.handMat, this.bladeMat, this.gripMat]) m.dispose();
    this.damascus?.dispose();
  }
}
