// Win and fail rules: collect the level's item, then step onto an exit tile. 0 HP fails. Pure.

import type { Vec2 } from '../level/collision';
import type { Grid } from '../level/grid';
import { Tile } from '../level/types';

export type Outcome = 'won' | 'failed';

export interface ObjectiveInput {
  itemTaken: boolean;
  /** The player stands on an exit tile. */
  onExit: boolean;
  playerDead: boolean;
}

export function checkOutcome(i: ObjectiveInput): Outcome | null {
  if (i.playerDead) return 'failed';
  return i.onExit && i.itemTaken ? 'won' : null;
}

export function onExitTile(grid: Grid, p: Vec2): boolean {
  const { cx, cy } = grid.worldToCell(p.x, p.z);
  return grid.get(cx, cy) === Tile.Exit;
}

/** One line for the HUD: what to do next. */
export function objectiveLabel(itemTaken: boolean): string {
  return itemTaken ? 'Reach the exit' : 'Find the intel';
}
