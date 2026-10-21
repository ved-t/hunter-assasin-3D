import { Ajv } from 'ajv';
import { describe, expect, it } from 'vitest';
import medium from '../../public/levels/medium.json';
import small from '../../public/levels/small.json';
import { GUARD } from '../config/tunables';
import { Pathfinder } from '../nav/astar';
import type { Vec2 } from './collision';
import { Grid } from './grid';
import schema from './level.schema.json';
import { validateLevel } from './validate';
import type { LevelData } from './types';

const ajv = new Ajv({ allErrors: true });
const schemaValidate = ajv.compile(schema);

function base(): LevelData {
  return {
    id: 'test',
    name: 'Test',
    version: 1,
    tileSize: 2,
    width: 7,
    height: 5,
    tiles: ['#######', '#..#..#', '#..D.E#', '#..#..#', '#######'],
    playerSpawn: { x: 1.5, y: 1.5, yawDeg: 0 },
    guards: [{ spawn: { x: 5.5, y: 1.5 }, yawDeg: 0, waypoints: [{ x: 5.5, y: 3.5, waitS: 1 }] }],
    lamps: [{ x: 2, y: 2, color: '#ffaa00' }],
    objective: { type: 'reachExit' },
  };
}

function expectBoth(level: unknown, schemaOk: boolean, runtimeOk: boolean): string[] {
  expect(schemaValidate(level), JSON.stringify(schemaValidate.errors)).toBe(schemaOk);
  const r = validateLevel(level);
  expect(r.ok, r.ok ? '' : r.errors.join('\n')).toBe(runtimeOk);
  return r.ok ? [] : r.errors;
}

describe('shipped levels', () => {
  for (const [id, level] of Object.entries({ small, medium })) {
    it(`${id}.json passes the schema and the runtime validator`, () => {
      expectBoth(level, true, true);
    });
  }
});

describe('shipped level patrols', () => {
  for (const [id, level] of Object.entries({ small, medium }) as [string, LevelData][]) {
    it(`${id}.json: every guard can walk its patrol loop with A*`, () => {
      const grid = Grid.fromRows(level.tiles, level.tileSize);
      const paths = new Pathfinder(grid, GUARD.radius);
      const out: Vec2[] = [];
      for (const g of level.guards) {
        const loop = [g.spawn, ...g.waypoints, g.waypoints[0] ?? g.spawn];
        for (let i = 0; i < loop.length - 1; i++) {
          const a = grid.gridToWorld(loop[i]!.x, loop[i]!.y);
          const b = grid.gridToWorld(loop[i + 1]!.x, loop[i + 1]!.y);
          expect(paths.findPath(a.x, a.z, b.x, b.z, out)).toBe(true);
        }
      }
    });
  }

  it('medium has the eight guards the Phase 2 perf check needs', () => {
    expect(medium.guards).toHaveLength(8);
  });
});

describe('validateLevel', () => {
  it('accepts the base fixture', () => {
    expectBoth(base(), true, true);
  });

  // Structural failures: the schema and the runtime validator must both reject.
  const structural: [string, (l: Record<string, unknown>) => void][] = [
    ['unknown tile char', (l) => ((l.tiles as string[])[1] = '#..#x.#')],
    ['missing field', (l) => delete l.objective],
    ['extra field', (l) => (l.extra = 1)],
    ['bad tile size', (l) => (l.tileSize = 3)],
    ['bad id', (l) => (l.id = 'Bad Id')],
    ['non-numeric spawn', (l) => ((l.playerSpawn as Record<string, unknown>).x = 'a')],
    ['bad lamp colour', (l) => ((l.lamps as Record<string, unknown>[])[0]!.color = 'orange')],
    [
      'negative wait',
      (l) =>
        (l.guards = [
          { spawn: { x: 5.5, y: 1.5 }, yawDeg: 0, waypoints: [{ x: 5.5, y: 1.5, waitS: -1 }] },
        ]),
    ],
    ['bad objective type', (l) => (l.objective = { type: 'win' })],
  ];
  for (const [name, mutate] of structural) {
    it(`rejects ${name} (schema and runtime agree)`, () => {
      const l = base() as unknown as Record<string, unknown>;
      mutate(l);
      expectBoth(l, false, false);
    });
  }

  // Semantic failures: schema-valid, but the runtime validator must reject.
  const semantic: [string, (l: LevelData) => void, RegExp][] = [
    ['open border', (l) => (l.tiles[2] = '...D.E#'), /border/],
    ['row length mismatch', (l) => (l.tiles[1] = '#..#.#'), /columns/],
    ['row count mismatch', (l) => (l.height = 6), /rows/],
    ['spawn off grid', (l) => (l.playerSpawn = { x: 40, y: 1, yawDeg: 0 }), /outside/],
    ['spawn in wall', (l) => (l.playerSpawn = { x: 0.5, y: 0.5, yawDeg: 0 }), /solid/],
    ['unreachable waypoint', (l) => (l.tiles[2] = '#..#.E#'), /not reachable/],
    ['reachExit without exit', (l) => (l.tiles[2] = '#..D..#'), /E tile/],
    ['door not between walls', (l) => (l.tiles[1] = '#..D..#'), /door/],
    [
      'item in cover',
      (l) => ((l.tiles[3] = '#.c#..#'), (l.objective.item = { x: 2.5, y: 3.5 })),
      /solid/,
    ],
  ];
  for (const [name, mutate, message] of semantic) {
    it(`rejects ${name}`, () => {
      const l = base();
      mutate(l);
      const errors = expectBoth(l, true, false);
      expect(errors.join('\n')).toMatch(message);
    });
  }
});
