// Knife takedown rules: close, from any angle, never on an Alert guard, nothing solid between.
// Pure; Mission applies the kill and the animation lock.

import type { GuardState } from '../ai/guard-fsm';
import { KNIFE } from '../config/tunables';
import type { Vec2 } from '../level/collision';
import type { Grid } from '../level/grid';
import { isSegmentWalkable } from '../nav/los';

/** What the knife reads from a guard (Guard satisfies this). */
export interface KnifeTarget {
  readonly pos: Vec2;
  readonly state: GuardState;
  readonly dead: boolean;
}

/** Can a player standing at (x, z) knife this guard right now? */
export function canKnife(grid: Grid, x: number, z: number, g: KnifeTarget): boolean {
  if (g.dead || g.state === 'alert') return false;
  if (Math.hypot(x - g.pos.x, z - g.pos.z) > KNIFE.rangeM) return false;
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
