// Level data as authored in public/levels/*.json. Mirrors level.schema.json.
// Positions are in grid cell units (floats): {x: 3.5, y: 2.5} is the centre of column 3, row 2.

export const TILE_CHARS = {
  '#': 'wall',
  '.': 'floor',
  c: 'cover',
  D: 'door',
  E: 'exit',
} as const;

export type TileChar = keyof typeof TILE_CHARS;
export type TileName = (typeof TILE_CHARS)[TileChar];

/** Numeric tile ids stored in the Grid. */
export const Tile = {
  Floor: 0,
  Wall: 1,
  Cover: 2,
  Door: 3,
  Exit: 4,
} as const;
export type Tile = (typeof Tile)[keyof typeof Tile];

export const TILE_FROM_CHAR: Record<TileChar, Tile> = {
  '#': Tile.Wall,
  '.': Tile.Floor,
  c: Tile.Cover,
  D: Tile.Door,
  E: Tile.Exit,
};

export function isTileChar(ch: string): ch is TileChar {
  return Object.prototype.hasOwnProperty.call(TILE_CHARS, ch);
}

export interface GridPoint {
  x: number;
  y: number;
}

/** Headings (`yawDeg`) are compass degrees: 0 = north (−Z, up the rows), 90 = east (+X). */
export interface PlayerSpawn extends GridPoint {
  yawDeg: number;
}

export interface Waypoint extends GridPoint {
  /** Seconds to idle here before moving on. */
  waitS?: number;
}

export interface GuardDef {
  spawn: GridPoint;
  yawDeg: number;
  waypoints: Waypoint[];
}

export interface LampDef extends GridPoint {
  /** CSS hex colour, e.g. "#ffc27a". */
  color?: string;
  intensity?: number;
}

/** Environment art sets; each campaign level belongs to one. */
export const THEMES = ['warehouse', 'office', 'mansion'] as const;
export type Theme = (typeof THEMES)[number];

export type ObjectiveType = 'eliminateAll' | 'reachExit';

export interface Objective {
  type: ObjectiveType;
  /** Item to collect before the exit counts (reachExit only). */
  item?: GridPoint;
}

export interface LevelData {
  $schema?: string;
  id: string;
  name: string;
  version: number;
  tileSize: number;
  width: number;
  height: number;
  /** `height` rows of `width` characters, row 0 first. */
  tiles: string[];
  playerSpawn: PlayerSpawn;
  guards: GuardDef[];
  lamps: LampDef[];
  objective: Objective;
  /** Distraction bottles the player starts with (default BOTTLE.defaultCount). */
  bottles?: number;
  /** Finishing faster than this earns the time star (s). */
  parTimeS?: number;
  /** Environment art set (default warehouse). */
  theme?: Theme;
  /** One line shown on the intro card when the level starts. */
  tip?: string;
}
