// Tile grid: the simulation's view of a level. Pure data, no three.js.
// Grid column x → world +X, row y → world +Z. Cell (cx, cy) spans [cx·T, (cx+1)·T) on each axis.

import { Tile, TILE_FROM_CHAR, type TileChar } from './types';

export interface CellCoord {
  cx: number;
  cy: number;
}

export class Grid {
  readonly cells: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
    readonly tileSize: number,
    cells?: Uint8Array,
  ) {
    this.cells = cells ?? new Uint8Array(width * height);
  }

  /** Build from validated tile rows. */
  static fromRows(rows: readonly string[], tileSize: number): Grid {
    const height = rows.length;
    const width = rows[0]?.length ?? 0;
    const grid = new Grid(width, height, tileSize);
    for (let cy = 0; cy < height; cy++) {
      const row = rows[cy] ?? '';
      for (let cx = 0; cx < width; cx++) {
        grid.cells[cy * width + cx] = TILE_FROM_CHAR[row[cx] as TileChar] ?? Tile.Wall;
      }
    }
    return grid;
  }

  inBounds(cx: number, cy: number): boolean {
    return cx >= 0 && cy >= 0 && cx < this.width && cy < this.height;
  }

  /** Tile at a cell; out-of-bounds reads as wall so nothing can leave the level. */
  get(cx: number, cy: number): Tile {
    if (!this.inBounds(cx, cy)) return Tile.Wall;
    return this.cells[cy * this.width + cx] as Tile;
  }

  /** Blocks movement: walls and low cover. Doors (open doorways) and exits are walkable. */
  isSolid(cx: number, cy: number): boolean {
    const t = this.get(cx, cy);
    return t === Tile.Wall || t === Tile.Cover;
  }

  worldToCell(x: number, z: number): CellCoord {
    return { cx: Math.floor(x / this.tileSize), cy: Math.floor(z / this.tileSize) };
  }

  /** World-space centre of a cell (x, z). */
  cellCenter(cx: number, cy: number): { x: number; z: number } {
    return { x: (cx + 0.5) * this.tileSize, z: (cy + 0.5) * this.tileSize };
  }

  /** Grid-unit point (as authored in level JSON) to world metres. */
  gridToWorld(gx: number, gy: number): { x: number; z: number } {
    return { x: gx * this.tileSize, z: gy * this.tileSize };
  }

  /** Calls fn for every solid cell overlapping the square [x±r, z±r]. */
  forEachSolidNear(x: number, z: number, r: number, fn: (cx: number, cy: number) => void): void {
    const t = this.tileSize;
    const minX = Math.floor((x - r) / t);
    const maxX = Math.floor((x + r) / t);
    const minY = Math.floor((z - r) / t);
    const maxY = Math.floor((z + r) / t);
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        if (this.isSolid(cx, cy)) fn(cx, cy);
      }
    }
  }
}
