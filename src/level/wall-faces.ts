// Which wall surfaces a level shows, and what kind of corner each one ends in. Pure grid logic: the
// environment kit turns these into wall quads, trim strips and corner pieces.
//
// A face is the boundary between a wall cell and an open neighbour, seen from the open side. Walking
// along the face's tangent t = (−nz, nx), each end meets either more of the same wall (straight), a wall
// turning toward the viewer (inner corner) or the wall's end (outer corner). Door cells are openings
// below the lintel and solid wall above it, so corners are classified for both heights. Exit doors are
// doorways too, set in the outer wall.

import type { Grid } from './grid';
import { isDoorway, Tile } from './types';

export type CornerKind = 'straight' | 'inner' | 'outer';

export interface WallFace {
  /** The wall cell (or, for a lintel face, the door cell) the face belongs to. */
  cx: number;
  cy: number;
  /** Outward normal, one grid step: (±1, 0) or (0, ±1). */
  nx: number;
  nz: number;
  /** What the face looks onto. */
  facing: Tile;
  /** Face of a door lintel: spans only the doorway's head, from the door height up. */
  lintel: boolean;
  /** Corners below the door height, at the face's start (−t) and end (+t). */
  start: CornerKind;
  end: CornerKind;
  /** Corners at lintel height, where door cells count as wall. */
  startHigh: CornerKind;
  endHigh: CornerKind;
}

/** An outer wall corner: the cell corner it sits on and the two directions it opens toward. */
export interface OuterCorner {
  /** Grid vertex coordinates (cell-corner units). */
  vx: number;
  vy: number;
  /** Open directions: one along x, one along z (each ±1). */
  ox: number;
  oz: number;
}

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

function isWall(grid: Grid, cx: number, cy: number, high: boolean): boolean {
  const t = grid.get(cx, cy);
  return t === Tile.Wall || (high && isDoorway(t));
}

function corner(
  grid: Grid,
  cx: number,
  cy: number,
  nx: number,
  nz: number,
  tx: number,
  tz: number,
  high: boolean,
): CornerKind {
  if (!isWall(grid, cx + tx, cy + tz, high)) return 'outer';
  return isWall(grid, cx + tx + nx, cy + tz + nz, high) ? 'inner' : 'straight';
}

function face(
  grid: Grid,
  cx: number,
  cy: number,
  nx: number,
  nz: number,
  lintel: boolean,
): WallFace {
  const tx = -nz;
  const tz = nx;
  return {
    cx,
    cy,
    nx,
    nz,
    facing: grid.get(cx + nx, cy + nz),
    lintel,
    start: corner(grid, cx, cy, nx, nz, -tx, -tz, false),
    end: corner(grid, cx, cy, nx, nz, tx, tz, false),
    startHigh: corner(grid, cx, cy, nx, nz, -tx, -tz, true),
    endHigh: corner(grid, cx, cy, nx, nz, tx, tz, true),
  };
}

/** Every visible wall face, plus the two faces of each door lintel (toward the doorway's openings). */
export function wallFaces(grid: Grid): WallFace[] {
  const faces: WallFace[] = [];
  for (let cy = 0; cy < grid.height; cy++) {
    for (let cx = 0; cx < grid.width; cx++) {
      const tile = grid.get(cx, cy);
      if (tile !== Tile.Wall && !isDoorway(tile)) continue;
      for (const [nx, nz] of DIRS) {
        const next = grid.get(cx + nx, cy + nz);
        if (next === Tile.Wall || (isDoorway(tile) && isDoorway(next))) continue;
        faces.push(face(grid, cx, cy, nx, nz, isDoorway(tile)));
      }
    }
  }
  return faces;
}

/**
 * Outer corners at floor level, each listed once. Corners at a doorway's edge are left out (the door
 * frame trims those), and so are corners shared with a diagonal wall.
 */
export function outerCorners(grid: Grid): OuterCorner[] {
  const corners: OuterCorner[] = [];
  for (let cy = 0; cy < grid.height; cy++) {
    for (let cx = 0; cx < grid.width; cx++) {
      if (grid.get(cx, cy) !== Tile.Wall) continue;
      // Each corner of the cell is outer when both cells beside it are open and neither is a doorway.
      for (const ox of [-1, 1]) {
        for (const oz of [-1, 1]) {
          const side = grid.get(cx + ox, cy);
          const front = grid.get(cx, cy + oz);
          if (side === Tile.Wall || front === Tile.Wall) continue;
          if (isDoorway(side) || isDoorway(front)) continue;
          // Two walls touching only at this corner: one piece would poke into the other.
          if (grid.get(cx + ox, cy + oz) === Tile.Wall) continue;
          corners.push({ vx: cx + (ox > 0 ? 1 : 0), vy: cy + (oz > 0 ? 1 : 0), ox, oz });
        }
      }
    }
  }
  return corners;
}

/** Axis a doorway's passage runs along: 'z' when walls flank it east and west, else 'x'. */
export function doorAxis(grid: Grid, cx: number, cy: number): 'x' | 'z' {
  const solid = (x: number, y: number) => grid.get(x, y) === Tile.Wall;
  return solid(cx - 1, cy) && solid(cx + 1, cy) ? 'z' : 'x';
}

/** Which way an exit door in the outer wall leads out of the level: one grid step, or null if inside. */
export function exitOutward(grid: Grid, cx: number, cy: number): { ox: number; oz: number } | null {
  if (cx === 0) return { ox: -1, oz: 0 };
  if (cx === grid.width - 1) return { ox: 1, oz: 0 };
  if (cy === 0) return { ox: 0, oz: -1 };
  if (cy === grid.height - 1) return { ox: 0, oz: 1 };
  return null;
}
