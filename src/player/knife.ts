// Knife takedown rules: close, from behind or the side, never on an Alert guard, nothing solid between.
// Pure; Mission applies the kill and the animation lock.

import type { GuardState } from '../ai/guard-fsm';
import { KNIFE } from '../config/tunables';
import type { Vec2 } from '../level/collision';
import type { Grid } from '../level/grid';
import { isSegmentWalkable } from '../nav/los';

/** Facing must be at least this far from the direction to the player (the front arc is safe). */
const MIN_OFF_FACING = ((360 - KNIFE.rearArcDeg) / 2) * (Math.PI / 180);

/** What the knife reads from a guard (Guard satisfies this). */
export interface KnifeTarget {
  readonly pos: Vec2;
  /** three.js yaw: forward is (−sin, −cos). */
  readonly yaw: number;
  readonly state: GuardState;
  readonly dead: boolean;
}

/** Can a player standing at (x, z) knife this guard right now? */
export function canKnife(grid: Grid, x: number, z: number, g: KnifeTarget): boolean {
  if (g.dead || g.state === 'alert') return false;
  const dx = x - g.pos.x;
  const dz = z - g.pos.z;
  const d = Math.hypot(dx, dz);
  if (d > KNIFE.rangeM) return false;
  if (d > 1e-6) {
    const cos = (-Math.sin(g.yaw) * dx - Math.cos(g.yaw) * dz) / d;
    if (Math.acos(Math.min(1, Math.max(-1, cos))) < MIN_OFF_FACING) return false;
  }
  return isSegmentWalkable(grid, x, z, g.pos.x, g.pos.z);
}

/** Index of the nearest guard the player at (x, z) can knife, or -1. */
export function findKillTarget(
  grid: Grid,
  x: number,
  z: number,
  guards: readonly KnifeTarget[],
): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < guards.length; i++) {
    const g = guards[i] as KnifeTarget;
    if (!canKnife(grid, x, z, g)) continue;
    const d = Math.hypot(x - g.pos.x, z - g.pos.z);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
