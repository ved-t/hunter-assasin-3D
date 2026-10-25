// Skinned guards: the Mixamo guard GLB (scripts/assets/build-characters.mjs), one SkeletonUtils clone
// and AnimationMixer per guard slot, all sharing the clips. The sim state picks each guard's clip
// (guard-anim.ts); mixers of far and off-screen guards update less often, and guards outside the view
// are hidden. The flashlight and pistol in their hands are two InstancedMeshes for all guards; the
// flashlight follows the left hand and points along the sim's beam, and the rendered beam is moved to
// start at its lens. Reads guard sim state; never writes back. If the GLB is missing, GuardVisuals
// keeps its capsules.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Guard } from '../ai/guard';
import { ASSET_FILES, BODIES, GUARD, GUARD_ANIM as A } from '../config/tunables';
import { lerpAngle } from '../core/angles';
import type { FlashlightState } from '../lighting/flashlights';
import {
  GUARD_CLIPS,
  ONE_SHOT,
  pickClip,
  resolveClip,
  type ClipChoice,
  type DeathClip,
  type GuardClip,
} from './guard-anim';
import { ktx2Loader } from './ktx2';

const DROP_PITCH = THREE.MathUtils.degToRad(BODIES.dropLensPitchDeg);
/** He counts as aiming this long after a shot (s), so the shoot clip plays through its recoil. */
const AIM_HOLD_S = 0.5;

export interface GuardModel {
  /** Bind-pose scene, scaled to GUARD.height with the feet at y = 0, facing −Z. */
  scene: THREE.Object3D;
  clips: Map<GuardClip, THREE.AnimationClip>;
}

/** Loads and normalises the guard GLB. Rejects if it is missing or broken. */
export async function loadGuardModel(renderer: THREE.WebGLRenderer): Promise<GuardModel> {
  const loader = new GLTFLoader()
    .setMeshoptDecoder(MeshoptDecoder)
    .setKTX2Loader(ktx2Loader(renderer));
  const gltf = await loader.loadAsync(ASSET_FILES.guardModel);
  const inner = gltf.scene;
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner);
  const height = box.max.y - box.min.y;
  if (!(height > 0)) throw new Error('guard model has no extent');
  const k = GUARD.height / height;
  inner.scale.multiplyScalar(k);
  inner.position.y -= box.min.y * k;
  inner.updateMatrixWorld(true);
  const center = new THREE.Vector3(0, GUARD.height / 2, 0);
  inner.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isMesh) return;
    m.castShadow = m.receiveShadow = true;
    // Animated bounds wander from the bind pose, so every guard mesh gets the fixed sphere GuardRigs
    // culls whole guards with (in mesh space). It also lets each shadow-casting light skip the
    // guards outside its own frustum, instead of drawing every on-screen guard in every shadow pass.
    if (m.isSkinnedMesh) {
      const local = center.clone().applyMatrix4(m.matrixWorld.clone().invert());
      m.boundingSphere = new THREE.Sphere(local, A.cullRadiusM / m.matrixWorld.getMaxScaleOnAxis());
    } else {
      m.frustumCulled = false;
    }
  });
  const scene = new THREE.Group();
  scene.add(inner);
  const clips = new Map<GuardClip, THREE.AnimationClip>();
  for (const name of GUARD_CLIPS) {
    const clip = gltf.animations.find((c) => c.name === name);
    if (clip) clips.set(name, clip);
  }
  if (clips.size === 0) throw new Error('guard model has no known clips');
  return { scene, clips };
}

interface Rig {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Map<GuardClip, THREE.AnimationAction>;
  current: GuardClip | null;
  leftHand: THREE.Object3D | null;
  rightHand: THREE.Object3D | null;
  death: DeathClip;
  /** Mixer time owed since its last update (s), and frames since then. */
  owed: number;
  skipped: number;
}

function findBone(root: THREE.Object3D, suffix: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (!found && o.name.endsWith(suffix)) found = o;
  });
  return found;
}

export class GuardRigs {
  readonly group = new THREE.Group();
  private readonly rigs: Rig[] = [];
  private readonly torches: THREE.InstancedMesh;
  private readonly pistols: THREE.InstancedMesh;
  private readonly frustum = new THREE.Frustum();
  private readonly viewProj = new THREE.Matrix4();
  private readonly sphere = new THREE.Sphere();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly p = new THREE.Vector3();
  private readonly hand = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly choice: ClipChoice = { clip: 'idle', timeScale: 1 };

  constructor(model: GuardModel, capacity: number) {
    for (let i = 0; i < capacity; i++) {
      const root = SkeletonUtils.clone(model.scene);
      const mixer = new THREE.AnimationMixer(root);
      const actions = new Map<GuardClip, THREE.AnimationAction>();
      for (const [name, clip] of model.clips) {
        const action = mixer.clipAction(clip);
        if (ONE_SHOT.has(name)) {
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
        }
        actions.set(name, action);
      }
      this.rigs.push({
        root,
        mixer,
        actions,
        current: null,
        leftHand: findBone(root, 'LeftHand'),
        rightHand: findBone(root, 'RightHand'),
        death: 'deathBack',
        owed: 0,
        skipped: 0,
      });
      // Visible until the first update culls it, so a compile pass right after loading includes it.
      this.group.add(root);
    }
    const material = new THREE.MeshStandardMaterial({
      color: A.propColor,
      roughness: 0.5,
      metalness: 0.4,
    });
    // Both props point along −Z from their origin, like the guard.
    const torch = new THREE.CylinderGeometry(
      A.torchRadiusM,
      A.torchRadiusM * 0.8,
      A.torchLengthM,
      10,
    )
      .rotateX(Math.PI / 2)
      .translate(0, 0, -A.torchLengthM / 2);
    const pistol = new THREE.BoxGeometry(0.035, A.pistolHeightM, A.pistolLengthM).translate(
      0,
      -A.pistolHeightM * 0.3,
      -A.pistolLengthM / 2,
    );
    this.torches = new THREE.InstancedMesh(torch, material, Math.max(1, capacity));
    this.pistols = new THREE.InstancedMesh(pistol, material, Math.max(1, capacity));
    for (const im of [this.torches, this.pistols]) {
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      im.castShadow = true;
      im.count = 0;
      this.group.add(im);
    }
  }

  /** A new attempt: every rig back to its first frame, no clip playing. */
  reset(): void {
    for (const r of this.rigs) {
      r.mixer.stopAllAction();
      r.current = null;
      r.death = 'deathBack';
      r.owed = 0;
      r.root.visible = false;
    }
  }

  setDeath(i: number, clip: DeathClip): void {
    const r = this.rigs[i];
    if (r) r.death = clip;
  }

  /** Poses every guard, and moves `lights[i]` (this frame's beams) to the flashlight in his hand. */
  update(
    guards: readonly Guard[],
    lights: FlashlightState[],
    alpha: number,
    frameDt: number,
    camera: THREE.Camera,
  ): void {
    this.viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.viewProj);
    const n = Math.min(guards.length, this.rigs.length);
    let torches = 0;
    let pistols = 0;
    for (let i = 0; i < this.rigs.length; i++) {
      const r = this.rigs[i] as Rig;
      const g = guards[i];
      if (i >= n || !g) {
        r.root.visible = false;
        continue;
      }
      const l = lights[i] as FlashlightState;
      const x = g.prevPos.x + (g.pos.x - g.prevPos.x) * alpha;
      const z = g.prevPos.z + (g.pos.z - g.prevPos.z) * alpha;
      const yaw = g.dead ? g.yaw : lerpAngle(g.prevYaw, g.yaw, alpha);
      r.root.position.set(x, 0, z);
      r.root.rotation.y = yaw;

      this.sphere.center.set(x, GUARD.height / 2, z);
      this.sphere.radius = A.cullRadiusM;
      const onScreen = this.frustum.intersectsSphere(this.sphere);
      r.root.visible = onScreen;

      pickClip(
        {
          dead: g.dead,
          death: r.death,
          state: g.state,
          speed: g.speed,
          aiming: !g.dead && (g.gun.phase === 'windup' || g.gun.sinceShot < AIM_HOLD_S),
        },
        this.choice,
      );
      this.play(r, this.choice.clip, this.choice.timeScale);

      // Far and off-screen guards animate at a lower rate; their time is owed, not lost.
      r.owed += frameDt;
      const far = Math.hypot(camera.position.x - x, camera.position.z - z) > A.nearM;
      const every = !onScreen ? A.offscreenEveryFrames : far ? A.farEveryFrames : 1;
      if (++r.skipped >= every) {
        r.mixer.update(r.owed);
        r.owed = 0;
        r.skipped = 0;
      }
      if (!onScreen) continue;
      r.root.updateMatrixWorld(true);

      // Flashlight: in the left hand, pointing along the beam; dropped on the floor once dead.
      if (g.dead) {
        this.e.set(-DROP_PITCH, g.dropLens.yaw, 0);
        this.p.set(g.dropLens.x, g.dropLens.height, g.dropLens.z);
        this.p.x += Math.sin(g.dropLens.yaw) * A.torchLengthM; // lens at the front
        this.p.z += Math.cos(g.dropLens.yaw) * A.torchLengthM;
      } else {
        this.e.set(-l.pitch, l.yaw, 0);
        if (r.leftHand) r.leftHand.getWorldPosition(this.p);
        else this.p.set(l.x, l.y, l.z);
        this.moveLens(l, this.p);
      }
      this.q.setFromEuler(this.e);
      this.torches.setMatrixAt(torches++, this.m.compose(this.p, this.q, this.one));

      if (r.rightHand && !g.dead) {
        r.rightHand.getWorldPosition(this.hand);
        this.e.set(0, yaw, 0);
        this.q.setFromEuler(this.e);
        this.pistols.setMatrixAt(pistols++, this.m.compose(this.hand, this.q, this.one));
      }
    }
    this.torches.count = torches;
    this.pistols.count = pistols;
    this.torches.instanceMatrix.needsUpdate = true;
    this.pistols.instanceMatrix.needsUpdate = true;
  }

  /** Puts the beam's start at the lens of a torch held at `grip`, within reach of the sim's lens. */
  private moveLens(l: FlashlightState, grip: THREE.Vector3): void {
    const cp = Math.cos(l.pitch);
    const lx = grip.x - Math.sin(l.yaw) * cp * A.torchLengthM;
    const ly = grip.y - Math.sin(l.pitch) * A.torchLengthM;
    const lz = grip.z - Math.cos(l.yaw) * cp * A.torchLengthM;
    const dx = lx - l.x;
    const dy = ly - l.y;
    const dz = lz - l.z;
    const d = Math.hypot(dx, dy, dz);
    const k = d > A.lensMaxOffsetM ? A.lensMaxOffsetM / d : 1;
    l.x += dx * k;
    l.y += dy * k;
    l.z += dz * k;
  }

  private play(r: Rig, clip: GuardClip, timeScale: number): void {
    // Compare and store the clip that actually plays, so a missing clip doesn't restart its stand-in.
    const name = resolveClip(clip, (c) => r.actions.has(c));
    const next = name ? r.actions.get(name) : undefined;
    if (!name || !next) return;
    next.setEffectiveTimeScale(timeScale);
    if (r.current === name) return;
    const prev = r.current ? r.actions.get(r.current) : undefined;
    next.reset().setEffectiveWeight(1).play();
    if (prev) {
      next.fadeIn(A.fadeS);
      prev.fadeOut(A.fadeS);
    }
    r.current = name;
  }

  dispose(): void {
    for (const r of this.rigs) r.mixer.stopAllAction();
    this.torches.geometry.dispose();
    this.pistols.geometry.dispose();
    (this.torches.material as THREE.Material).dispose();
    this.torches.dispose();
    this.pistols.dispose();
  }
}
