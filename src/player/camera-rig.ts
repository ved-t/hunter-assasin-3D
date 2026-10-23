// Places the first-person camera: interpolated sim position + eye height, current look angles.

import type * as THREE from 'three';
import { CAMERA_FX } from '../config/tunables';
import type { PlayerController } from './controller';

export function applyCameraRig(
  camera: THREE.PerspectiveCamera,
  player: PlayerController,
  alpha: number,
): void {
  const { pos, prevPos } = player;
  camera.position.set(
    prevPos.x + (pos.x - prevPos.x) * alpha,
    player.prevEyeHeight + (player.eyeHeight - player.prevEyeHeight) * alpha,
    prevPos.z + (pos.z - prevPos.z) * alpha,
  );
  // Rotation order YXZ (set at camera creation): yaw first, then pitch, no roll.
  camera.rotation.set(player.pitch, player.yaw, 0);
}

/**
 * Motion layered on the rig: `lunge` (0..1 through the knife lock) pushes the view forward and dips it,
 * the placeholder for a stab animation; `fall` (0..1 after the fatal hit) drops it to the floor, rolling.
 */
export function applyCameraFx(camera: THREE.PerspectiveCamera, lunge: number, fall: number): void {
  if (lunge > 0) {
    const k = Math.sin(Math.PI * lunge);
    const yaw = camera.rotation.y;
    camera.position.x -= Math.sin(yaw) * CAMERA_FX.lungeM * k;
    camera.position.z -= Math.cos(yaw) * CAMERA_FX.lungeM * k;
    camera.rotation.x -= CAMERA_FX.lungeDipRad * k;
  }
  if (fall > 0) {
    const k = 1 - (1 - fall) * (1 - fall); // ease out
    camera.position.y += (CAMERA_FX.fallEyeHeight - camera.position.y) * k;
    camera.rotation.z = CAMERA_FX.fallRollRad * k;
  }
}
