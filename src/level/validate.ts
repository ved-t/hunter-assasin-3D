// Runtime level validator. Structural checks mirror level.schema.json (tests keep the two in step via ajv);
// semantic checks cover what a schema can't express: closed borders, walkable spawns, reachability.

import { Grid } from './grid';
import { Tile, isTileChar, type GridPoint, type LevelData } from './types';

export type ValidationResult = { ok: true; level: LevelData } | { ok: false; errors: string[] };

const ID_PATTERN = /^[a-z0-9-]+$/;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const MIN_SIZE = 3;
const MAX_SIZE = 128;
const SCHEMA_TILE_SIZE = 2;

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isInt(v: unknown): v is number {
  return isNum(v) && Number.isInteger(v);
}

class Checker {
  readonly errors: string[] = [];

  fail(path: string, msg: string): void {
    this.errors.push(`${path}: ${msg}`);
  }

  /** Reports keys outside `allowed`. */
  noExtra(o: Obj, allowed: readonly string[], path: string): void {
    for (const k of Object.keys(o))
      if (!allowed.includes(k)) this.fail(path, `unknown field "${k}"`);
  }

  point(v: unknown, path: string, extra: readonly string[] = []): v is GridPoint {
    if (!isObj(v)) {
      this.fail(path, 'must be an object');
      return false;
    }
    let ok = true;
    for (const k of ['x', 'y']) {
      if (!isNum(v[k])) {
        this.fail(`${path}.${k}`, 'must be a number');
        ok = false;
      }
    }
    if (extra.length > 0) this.noExtra(v, ['x', 'y', ...extra], path);
    return ok;
  }
}

function checkStructure(c: Checker, json: unknown): json is LevelData {
  if (!isObj(json)) {
    c.fail('level', 'must be an object');
    return false;
  }
  c.noExtra(
    json,
    [
      '$schema',
      'id',
      'name',
      'version',
      'tileSize',
      'width',
      'height',
      'tiles',
      'playerSpawn',
      'guards',
      'lamps',
      'objective',
    ],
    'level',
  );
  if (typeof json.id !== 'string' || !ID_PATTERN.test(json.id))
    c.fail('id', 'must match [a-z0-9-]+');
  if (typeof json.name !== 'string' || json.name.length === 0) c.fail('name', 'must be non-empty');
  if (!isInt(json.version) || json.version < 1) c.fail('version', 'must be an integer >= 1');
  if (json.tileSize !== SCHEMA_TILE_SIZE) c.fail('tileSize', `must be ${SCHEMA_TILE_SIZE}`);
  for (const k of ['width', 'height'] as const) {
    const v = json[k];
    if (!isInt(v) || v < MIN_SIZE || v > MAX_SIZE) {
      c.fail(k, `must be an integer in [${MIN_SIZE}, ${MAX_SIZE}]`);
    }
  }

  if (!Array.isArray(json.tiles) || json.tiles.length < MIN_SIZE || json.tiles.length > MAX_SIZE) {
    c.fail('tiles', `must be an array of ${MIN_SIZE}..${MAX_SIZE} rows`);
  } else {
    json.tiles.forEach((row, i) => {
      if (typeof row !== 'string' || row.length === 0) {
        c.fail(`tiles[${i}]`, 'must be a non-empty string');
        return;
      }
      for (let x = 0; x < row.length; x++) {
        const ch = row.charAt(x);
        if (!isTileChar(ch)) c.fail(`tiles[${i}][${x}]`, `unknown tile "${ch}"`);
      }
    });
  }

  if (c.point(json.playerSpawn, 'playerSpawn', ['yawDeg'])) {
    if (!isNum((json.playerSpawn as unknown as Obj).yawDeg))
      c.fail('playerSpawn.yawDeg', 'must be a number');
  }

  if (!Array.isArray(json.guards)) {
    c.fail('guards', 'must be an array');
  } else {
    json.guards.forEach((g, i) => {
      const p = `guards[${i}]`;
      if (!isObj(g)) {
        c.fail(p, 'must be an object');
        return;
      }
      c.noExtra(g, ['spawn', 'yawDeg', 'waypoints'], p);
      c.point(g.spawn, `${p}.spawn`);
      if (!isNum(g.yawDeg)) c.fail(`${p}.yawDeg`, 'must be a number');
      if (!Array.isArray(g.waypoints)) {
        c.fail(`${p}.waypoints`, 'must be an array');
      } else {
        g.waypoints.forEach((w, j) => {
          const wp = `${p}.waypoints[${j}]`;
          if (c.point(w, wp, ['waitS']) && 'waitS' in w) {
            if (!isNum(w.waitS) || w.waitS < 0) c.fail(`${wp}.waitS`, 'must be a number >= 0');
          }
        });
      }
    });
  }

  if (!Array.isArray(json.lamps)) {
    c.fail('lamps', 'must be an array');
  } else {
    json.lamps.forEach((l, i) => {
      const p = `lamps[${i}]`;
      if (!c.point(l, p, ['color', 'intensity'])) return;
      if ('color' in l && (typeof l.color !== 'string' || !COLOR_PATTERN.test(l.color))) {
        c.fail(`${p}.color`, 'must be #rrggbb');
      }
      if ('intensity' in l && (!isNum(l.intensity) || l.intensity < 0)) {
        c.fail(`${p}.intensity`, 'must be a number >= 0');
      }
    });
  }

  if (!isObj(json.objective)) {
    c.fail('objective', 'must be an object');
  } else {
    c.noExtra(json.objective, ['type', 'item'], 'objective');
    if (json.objective.type !== 'eliminateAll' && json.objective.type !== 'reachExit') {
      c.fail('objective.type', 'must be "eliminateAll" or "reachExit"');
    }
    if ('item' in json.objective) c.point(json.objective.item, 'objective.item');
  }

  return c.errors.length === 0;
}

/** Cells reachable from a start cell through non-solid tiles (4-neighbour). */
function floodReachable(grid: Grid, startX: number, startY: number): Uint8Array {
  const seen = new Uint8Array(grid.width * grid.height);
  if (grid.isSolid(startX, startY)) return seen;
  const queue = [startY * grid.width + startX];
  seen[queue[0] as number] = 1;
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head] as number;
    const x = i % grid.width;
    const y = (i - x) / grid.width;
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (!grid.inBounds(nx, ny) || grid.isSolid(nx, ny)) continue;
      const ni = ny * grid.width + nx;
      if (seen[ni]) continue;
      seen[ni] = 1;
      queue.push(ni);
    }
  }
  return seen;
}

function checkSemantics(c: Checker, level: LevelData): void {
  const { width, height, tiles } = level;
  if (tiles.length !== height)
    c.fail('tiles', `has ${tiles.length} rows, expected height ${height}`);
  tiles.forEach((row, i) => {
    if (row.length !== width) c.fail(`tiles[${i}]`, `has ${row.length} columns, expected ${width}`);
  });
  if (c.errors.length > 0) return; // geometry checks below assume a well-formed grid

  const grid = Grid.fromRows(tiles, level.tileSize);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = grid.get(x, y);
      const onBorder = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      if (onBorder && t !== Tile.Wall) c.fail(`tiles[${y}][${x}]`, 'border must be wall');
      if (t === Tile.Door) {
        // Walls on one axis, walkable cells on the other, so the doorway leads somewhere.
        const wallsX = grid.get(x - 1, y) === Tile.Wall && grid.get(x + 1, y) === Tile.Wall;
        const wallsY = grid.get(x, y - 1) === Tile.Wall && grid.get(x, y + 1) === Tile.Wall;
        const openX = !grid.isSolid(x - 1, y) && !grid.isSolid(x + 1, y);
        const openY = !grid.isSolid(x, y - 1) && !grid.isSolid(x, y + 1);
        if (!(wallsX && openY) && !(wallsY && openX)) {
          c.fail(
            `tiles[${y}][${x}]`,
            'door must sit between two walls with open cells either side',
          );
        }
      }
    }
  }

  const sp = level.playerSpawn;
  const spawnCell = { x: Math.floor(sp.x), y: Math.floor(sp.y) };
  const walkable = (p: GridPoint, path: string): boolean => {
    const cx = Math.floor(p.x);
    const cy = Math.floor(p.y);
    if (!grid.inBounds(cx, cy)) {
      c.fail(path, `(${p.x}, ${p.y}) is outside the grid`);
      return false;
    }
    if (grid.isSolid(cx, cy)) {
      c.fail(path, `(${p.x}, ${p.y}) is inside a solid tile`);
      return false;
    }
    return true;
  };
  if (!walkable(sp, 'playerSpawn')) return;

  const reach = floodReachable(grid, spawnCell.x, spawnCell.y);
  const reachable = (p: GridPoint, path: string): void => {
    if (!walkable(p, path)) return;
    if (!reach[Math.floor(p.y) * width + Math.floor(p.x)]) {
      c.fail(path, `(${p.x}, ${p.y}) is not reachable from the player spawn`);
    }
  };

  level.guards.forEach((g, i) => {
    reachable(g.spawn, `guards[${i}].spawn`);
    g.waypoints.forEach((w, j) => reachable(w, `guards[${i}].waypoints[${j}]`));
  });
  level.lamps.forEach((l, i) => {
    if (!grid.inBounds(Math.floor(l.x), Math.floor(l.y)))
      c.fail(`lamps[${i}]`, 'is outside the grid');
  });
  if (level.objective.item) reachable(level.objective.item, 'objective.item');

  let exits = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid.get(x, y) !== Tile.Exit) continue;
      exits++;
      if (!reach[y * width + x])
        c.fail(`tiles[${y}][${x}]`, 'exit is not reachable from the player spawn');
    }
  }
  if (level.objective.type === 'reachExit' && exits === 0) {
    c.fail('objective', 'reachExit needs at least one E tile');
  }
}

export function validateLevel(json: unknown): ValidationResult {
  const c = new Checker();
  if (!checkStructure(c, json)) return { ok: false, errors: c.errors };
  checkSemantics(c, json);
  return c.errors.length === 0 ? { ok: true, level: json } : { ok: false, errors: c.errors };
}
