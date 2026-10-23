// Win and fail rules. eliminateAll: every guard dead. reachExit: collect the item if the level has one,
// then step onto an exit tile. Either way, 0 HP fails. Pure.

import type { Vec2 } from '../level/collision';
import type { Grid } from '../level/grid';
import { Tile, type ObjectiveType } from '../level/types';

export type Outcome = 'won' | 'failed';

export interface ObjectiveInput {
  type: ObjectiveType;
  /** The level has an item to collect first, and whether it has been. */
  hasItem: boolean;
  itemTaken: boolean;
  /** The player stands on an exit tile. */
  onExit: boolean;
  aliveGuards: number;
  playerDead: boolean;
}

export function checkOutcome(i: ObjectiveInput): Outcome | null {
  if (i.playerDead) return 'failed';
  if (i.type === 'eliminateAll') return i.aliveGuards === 0 ? 'won' : null;
  return i.onExit && (!i.hasItem || i.itemTaken) ? 'won' : null;
}

export function onExitTile(grid: Grid, p: Vec2): boolean {
  const { cx, cy } = grid.worldToCell(p.x, p.z);
  return grid.get(cx, cy) === Tile.Exit;
}

/** One line for the HUD: what to do next. */
export function objectiveLabel(
  type: ObjectiveType,
  hasItem: boolean,
  itemTaken: boolean,
  aliveGuards: number,
  totalGuards: number,
): string {
  if (type === 'eliminateAll') {
    return `Eliminate all guards  ${totalGuards - aliveGuards}/${totalGuards}`;
  }
  return hasItem && !itemTaken ? 'Find the intel' : 'Reach the exit';
}
