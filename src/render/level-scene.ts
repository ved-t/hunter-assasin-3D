// The long-lived scene: fog, moonlight (ambient plus a fixed directional moon) and the camera. It outlives levels: each level's meshes
// (buildLevelMesh) are added and disposed inside it, and guards and flashlights (including the fixed
// real-SpotLight pool) are added once by the world, so switching levels never changes the light count.

import * as THREE from 'three';
import { DISPLAY, LEVEL } from '../config/tunables';

export interface SessionScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
}

export function createSessionScene(): SessionScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(LEVEL.fogColor);
  scene.fog = new THREE.FogExp2(LEVEL.fogColor, LEVEL.fogDensity);
  scene.add(
    new THREE.HemisphereLight(
      LEVEL.ambientSkyColor,
      LEVEL.ambientGroundColor,
      LEVEL.ambientIntensity,
    ),
  );
  // No shadows; its target stays at the origin, so position alone sets the direction.
  const moon = new THREE.DirectionalLight(LEVEL.moonColor, LEVEL.moonIntensity);
  moon.position.set(...LEVEL.moonFrom).normalize();
  scene.add(moon);

  const camera = new THREE.PerspectiveCamera(DISPLAY.fovDeg, 1, DISPLAY.near, DISPLAY.far);
  camera.rotation.order = 'YXZ';
  return { scene, camera };
}
