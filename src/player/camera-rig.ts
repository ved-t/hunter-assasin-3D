// Places the first-person camera: interpolated sim position + eye height, current look angles.

import type * as THREE from 'three';
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
