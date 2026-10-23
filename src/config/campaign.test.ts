import { describe, expect, it } from 'vitest';
import { Rng } from '../core/rng';
import { InputState } from '../input/input-state';
import type { Vec2 } from '../level/collision';
import { levelFromJson, type LoadedLevel } from '../level/loader';
import { Tile, THEMES, type LevelData } from '../level/types';
import { validateLevel } from '../level/validate';
import { Mission } from '../mission/mission';
import { Pathfinder } from '../nav/astar';
import { CAMPAIGN, campaignIndex, nextLevelId } from './campaign';
import { AWARENESS, GUARD, LEVEL_LIMITS, PLAYER } from './tunables';

const FILES = import.meta.glob<unknown>('../../public/levels/*.json', {
  eager: true,
  import: 'default',
});

const LEVELS_PER_THEME = 4;
/** Standing still at the spawn must stay unnoticed this long (s): no level opens on a detection. */
const SAFE_SPAWN_S = 20;
const DT = 1 / 60;
const LENS = { vFov: (70 * Math.PI) / 180, aspect: 16 / 9 };

function load(id: string): LoadedLevel {
  return levelFromJson(FILES[`../../public/levels/${id}.json`], id);
}

/** A* path length (m) from a to b for a walker of `radius`, or null if there is no path. */
function pathLength(paths: Pathfinder, a: Vec2, b: Vec2): number | null {
  const out: Vec2[] = [];
  if (!paths.findPath(a.x, a.z, b.x, b.z, out)) return null;
  let len = 0;
  let prev = a;
  for (const p of out) {
    len += Math.hypot(p.x - prev.x, p.z - prev.z);
    prev = p;
  }
  return len;
}

/** Centres of the level's exit tiles (m). */
function exits(level: LoadedLevel): Vec2[] {
  const { grid } = level;
  const out: Vec2[] = [];
  for (let y = 0; y < grid.height; y++)
    for (let x = 0; x < grid.width; x++)
      if (grid.get(x, y) === Tile.Exit) out.push(grid.cellCenter(x, y));
  return out;
}

/**
 * The shortest walk that could finish the level (m): spawn → item → nearest exit, or for eliminateAll
 * a nearest-first tour of the guard spawns. Throws if any leg has no path for the player.
 */
function routeLength(level: LoadedLevel): number {
  const { grid, data } = level;
  const paths = new Pathfinder(grid, PLAYER.radius);
  const leg = (a: Vec2, b: Vec2): number => {
    const d = pathLength(paths, a, b);
    if (d === null) throw new Error(`no path (${a.x}, ${a.z}) → (${b.x}, ${b.z})`);
    return d;
  };
  let at = grid.gridToWorld(data.playerSpawn.x, data.playerSpawn.y);
  let total = 0;
  if (data.objective.type === 'reachExit') {
    if (data.objective.item) {
      const item = grid.gridToWorld(data.objective.item.x, data.objective.item.y);
      total += leg(at, item);
      at = item;
    }
    return total + Math.min(...exits(level).map((e) => leg(at, e)));
  }
  const left = data.guards.map((g) => grid.gridToWorld(g.spawn.x, g.spawn.y));
  while (left.length > 0) {
    const d = left.map((g) => leg(at, g));
    const i = d.indexOf(Math.min(...d));
    total += d[i]!;
    at = left.splice(i, 1)[0]!;
  }
  return total;
}

describe('campaign', () => {
  it('lists each level once', () => {
    expect(new Set(CAMPAIGN.map((l) => l.id)).size).toBe(CAMPAIGN.length);
  });

  it(`runs ${LEVELS_PER_THEME} levels per theme, in theme order`, () => {
    expect(CAMPAIGN.map((l) => l.theme)).toEqual(
      THEMES.flatMap((t) => Array<string>(LEVELS_PER_THEME).fill(t)),
    );
  });

  for (const entry of CAMPAIGN) {
    it(`${entry.id}: has a valid level file that matches its campaign entry`, () => {
      const json = FILES[`../../public/levels/${entry.id}.json`];
      expect(json, 'missing file').toBeDefined();
      const r = validateLevel(json);
      expect(r.ok, r.ok ? '' : r.errors.join('\n')).toBe(true);
      if (!r.ok) return;
      expect(r.level.id).toBe(entry.id);
      expect(r.level.name).toBe(entry.name);
      expect(r.level.theme).toBe(entry.theme);
      expect(r.level.tip, 'intro tip').toBeTruthy();
      expect(r.level.parTimeS, 'par time').toBeGreaterThan(0);
      expect(r.level.guards.length).toBeLessThanOrEqual(LEVEL_LIMITS.maxGuards);
    });
  }

  it('never gets easier: guard counts rise or hold through the campaign', () => {
    const counts = CAMPAIGN.map((l) => (load(l.id).data as LevelData).guards.length);
    for (let i = 1; i < counts.length; i++)
      expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]!);
  });

  it('walks the order and stops at the end', () => {
    const first = CAMPAIGN[0]!.id;
    const last = CAMPAIGN[CAMPAIGN.length - 1]!.id;
    expect(campaignIndex(first)).toBe(0);
    expect(nextLevelId(first)).toBe(CAMPAIGN[1]?.id ?? null);
    expect(nextLevelId(last)).toBeNull();
    expect(campaignIndex('perf')).toBe(-1);
    expect(nextLevelId('perf')).toBeNull();
  });
});

describe('campaign levels are playable', () => {
  for (const { id } of CAMPAIGN) {
    it(`${id}: every guard can walk its patrol loop`, () => {
      const { grid, data } = load(id);
      const paths = new Pathfinder(grid, GUARD.radius);
      for (const [gi, g] of data.guards.entries()) {
        const loop = [g.spawn, ...g.waypoints, g.waypoints[0] ?? g.spawn];
        for (let i = 0; i < loop.length - 1; i++) {
          const a = grid.gridToWorld(loop[i]!.x, loop[i]!.y);
          const b = grid.gridToWorld(loop[i + 1]!.x, loop[i + 1]!.y);
          expect(pathLength(paths, a, b), `guard ${gi} leg ${i}`).not.toBeNull();
        }
      }
    });

    it(`${id}: the player can walk the whole route, and sneaking it beats par`, () => {
      const level = load(id);
      const route = routeLength(level);
      expect(level.data.parTimeS!).toBeGreaterThan(route / PLAYER.sneakSpeed);
    });

    it(`${id}: standing still at the spawn goes unnoticed for ${SAFE_SPAWN_S} s`, () => {
      const m = new Mission(load(id), new Rng(1));
      const input = new InputState();
      let worst = 0;
      for (let t = 0; t < SAFE_SPAWN_S; t += DT) {
        m.step(DT, input, LENS);
        for (const g of m.guards.guards) worst = Math.max(worst, g.awareness.value);
      }
      expect(worst).toBeLessThan(AWARENESS.suspicious);
    });
  }
});
