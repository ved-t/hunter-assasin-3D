// Phase 0 performance test scene: 100 instanced boxes, fog, moonlight ambient, one sweeping amber SpotLight.
// Replaced by real levels in Phase 1. Lights are created once here and never added or removed.

import * as THREE from 'three';
import { TIER_SETTINGS, type QualityTier } from '../config/quality';
import { DISPLAY, TEST_SCENE as T } from '../config/tunables';
import type { Rng } from '../core/rng';

/** Keep boxes out of this radius so the spotlight sits in open space. */
const CLEAR_RADIUS = 2.5;

export interface TestScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Fixed-step sim update. */
  update(dt: number): void;
  /** Interpolate visuals between the last two sim states. */
  render(alpha: number): void;
  applyTier(tier: QualityTier): void;
}

export function createTestScene(rng: Rng, tier: QualityTier): TestScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(T.fogColor);
  scene.fog = new THREE.FogExp2(T.fogColor, T.fogDensity);

  const camera = new THREE.PerspectiveCamera(DISPLAY.fovDeg, 1, DISPLAY.near, DISPLAY.far);

  // Floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(T.areaSize * 1.5, T.areaSize * 1.5),
    new THREE.MeshStandardMaterial({ color: T.floorColor, roughness: 0.95 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Boxes: one InstancedMesh = one draw call (plus one per shadow pass).
  const boxes = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: T.boxColor, roughness: 0.8 }),
    T.boxCount,
  );
  boxes.castShadow = true;
  boxes.receiveShadow = true;
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const half = T.areaSize / 2;
  for (let i = 0; i < T.boxCount; i++) {
    let x: number;
    let z: number;
    do {
      x = rng.range(-half, half);
      z = rng.range(-half, half);
    } while (Math.hypot(x, z) < CLEAR_RADIUS);
    const w = rng.range(T.boxMinSize, T.boxMaxSize);
    const h = rng.range(T.boxMinSize, T.boxMaxSize);
    const d = rng.range(T.boxMinSize, T.boxMaxSize);
    scale.set(w, h, d);
    pos.set(x, h / 2, z);
    quat.setFromAxisAngle(up, rng.range(0, Math.PI));
    boxes.setMatrixAt(i, m.compose(pos, quat, scale));
  }
  boxes.instanceMatrix.needsUpdate = true;
  scene.add(boxes);

  // Cool desaturated moonlight ambient.
  scene.add(new THREE.HemisphereLight(T.ambientSkyColor, T.ambientGroundColor, T.ambientIntensity));

  // The single real SpotLight (warm amber guard flashlight stand-in).
  const spot = new THREE.SpotLight(
    T.spotColor,
    T.spotIntensity,
    T.spotRange,
    THREE.MathUtils.degToRad(T.spotAngleDeg),
    T.spotPenumbra,
    T.spotDecay,
  );
  spot.position.set(0, T.spotHeight, 0);
  spot.castShadow = true;
  spot.shadow.camera.near = 0.3;
  spot.shadow.camera.far = T.spotRange;
  scene.add(spot, spot.target);

  // Sim state (current + previous for render interpolation).
  let sweep = 0;
  let prevSweep = 0;
  let orbit = 0;
  let prevOrbit = 0;

  function applyTier(next: QualityTier): void {
    const size = TIER_SETTINGS[next].shadowMapSize;
    if (size > 0 && spot.shadow.mapSize.x !== size) {
      spot.shadow.mapSize.set(size, size);
      spot.shadow.map?.dispose();
      spot.shadow.map = null; // reallocated at the new size on the next shadow render
    }
  }
  applyTier(tier);

  return {
    scene,
    camera,
    applyTier,
    update(dt) {
      prevSweep = sweep;
      prevOrbit = orbit;
      sweep += T.spotSweepRadPerSec * dt;
      orbit += T.cameraOrbitRadPerSec * dt;
    },
    render(alpha) {
      const s = prevSweep + (sweep - prevSweep) * alpha;
      const o = prevOrbit + (orbit - prevOrbit) * alpha;
      spot.target.position.set(Math.cos(s) * T.spotAimDistance, 0, Math.sin(s) * T.spotAimDistance);
      spot.target.updateMatrixWorld();
      camera.position.set(
        Math.cos(o) * T.cameraOrbitRadius,
        T.cameraHeight,
        Math.sin(o) * T.cameraOrbitRadius,
      );
      camera.lookAt(0, 0.5, 0);
    },
  };
}
