// The player's camera as plain data, and an "is this point on screen" test that needs no three.js.
// Mirrors the camera rig: rotation order YXZ, yaw 0 looks −Z, positive pitch looks up.

import { DISPLAY, PLAYER_SIGHT } from '../config/tunables';

export interface PlayerView {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  /** Vertical field of view (rad), as three.js PerspectiveCamera.fov. */
  vFov: number;
  /** Width / height. */
  aspect: number;
}

export function createPlayerView(): PlayerView {
  return { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, vFov: (DISPLAY.fovDeg * Math.PI) / 180, aspect: 1 };
}

/** Is world point (px, py, pz) inside the view frustum (ignoring walls)? */
export function inView(v: PlayerView, px: number, py: number, pz: number): boolean {
  const dx = px - v.x;
  const dy = py - v.y;
  const dz = pz - v.z;
  const sy = Math.sin(v.yaw);
  const cy = Math.cos(v.yaw);
  // Yaw: right = (cos, 0, −sin), level forward = (−sin, 0, −cos).
  const right = dx * cy - dz * sy;
  const level = -dx * sy - dz * cy;
  // Pitch tilts forward and up about the right axis.
  const sp = Math.sin(v.pitch);
  const cp = Math.cos(v.pitch);
  const fwd = level * cp + dy * sp;
  const up = -level * sp + dy * cp;
  if (fwd < DISPLAY.near || fwd > DISPLAY.far) return false;
  const tanV = Math.tan(v.vFov / 2) * PLAYER_SIGHT.frustumScale;
  return Math.abs(up) <= fwd * tanV && Math.abs(right) <= fwd * tanV * v.aspect;
}
