// Circle-vs-grid collision on the XZ plane. Pushing the circle out along the penetration normal
// (closest point on each solid cell's box) slides along walls and rounds convex corners, so the
// player never snags. Movement is sub-stepped so fast moves can't tunnel through a cell.

import { PLAYER } from '../config/tunables';
import type { Grid } from './grid';

export interface Vec2 {
  x: number;
  z: number;
}

/** Below this distance the circle centre counts as inside the box (avoids dividing by ~0). */
const EPSILON = 1e-6;

/** Push `pos` out of every solid cell it overlaps. Mutates pos. */
export function resolveCircle(
  grid: Grid,
  pos: Vec2,
  radius: number,
  iterations: number = PLAYER.collisionIterations,
): void {
  const t = grid.tileSize;
  for (let iter = 0; iter < iterations; iter++) {
    grid.forEachSolidNear(pos.x, pos.z, radius, (cx, cy) => {
      const minX = cx * t;
      const minZ = cy * t;
      const maxX = minX + t;
      const maxZ = minZ + t;
      const nearX = Math.min(Math.max(pos.x, minX), maxX);
      const nearZ = Math.min(Math.max(pos.z, minZ), maxZ);
      const dx = pos.x - nearX;
      const dz = pos.z - nearZ;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) return;
      if (d2 > EPSILON * EPSILON) {
        const d = Math.sqrt(d2);
        const push = (radius - d) / d;
        pos.x += dx * push;
        pos.z += dz * push;
        return;
      }
      // Centre inside the box: leave by the nearest face.
      const left = pos.x - minX;
      const right = maxX - pos.x;
      const top = pos.z - minZ;
      const bottom = maxZ - pos.z;
      const m = Math.min(left, right, top, bottom);
      if (m === left) pos.x = minX - radius;
      else if (m === right) pos.x = maxX + radius;
      else if (m === top) pos.z = minZ - radius;
      else pos.z = maxZ + radius;
    });
  }
}

/** Move a circle by delta with wall sliding. Mutates and returns pos. */
export function moveCircle(
  grid: Grid,
  pos: Vec2,
  dx: number,
  dz: number,
  radius: number,
  maxSubstep: number = PLAYER.collisionSubstep,
): Vec2 {
  const len = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(len / maxSubstep));
  const sx = dx / steps;
  const sz = dz / steps;
  for (let i = 0; i < steps; i++) {
    pos.x += sx;
    pos.z += sz;
    resolveCircle(grid, pos, radius);
  }
  return pos;
}
