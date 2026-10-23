// Scene for a loaded level: fog, moonlight ambient, camera and the greybox meshes.
// Guards and flashlights (including the fixed real-SpotLight pool) are added by the world.

import * as THREE from 'three';
import { DISPLAY, LEVEL } from '../config/tunables';
import type { LoadedLevel } from '../level/loader';
import { buildLevelMesh } from '../level/mesh-builder';

export interface LevelScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  setExitOpen(open: boolean): void;
  dispose(): void;
}

export function createLevelScene(level: LoadedLevel, debug: boolean): LevelScene {
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

  const camera = new THREE.PerspectiveCamera(DISPLAY.fovDeg, 1, DISPLAY.near, DISPLAY.far);
  camera.rotation.order = 'YXZ';

  const mesh = buildLevelMesh(level.data, level.grid, debug);
  scene.add(mesh.group);

  return { scene, camera, setExitOpen: mesh.setExitOpen, dispose: () => mesh.dispose() };
}
