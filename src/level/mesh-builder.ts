// Builds a level's visuals from its grid and its theme's kit. Static surfaces are merged into three
// meshes (floor, walls with their trim, ceiling) and lit at load by a vertex bake: AO from the grid and
// each lamp's light masked by grid LOS. Repeated pieces (cover props, door frames, ceiling detail, lamp
// fixtures) are one InstancedMesh per variant, each instance carrying its baked lamp light. Exit doors
// are built in exit-doors.ts. About 12–16 draw calls. No THREE.Light objects are created here (CLAUDE.md lighting rule): lamps are
// the bake plus additive glow meshes.

import * as THREE from 'three';
import { KIT, LEVEL } from '../config/tunables';
import { bakeLamps, lampLight, staticAo, type BakeLamp } from './bake';
import { buildExitDoors } from './exit-doors';
import type { Grid } from './grid';
import { DEFAULT_THEME, THEME_KITS } from './kit';
import {
  buildPiece,
  kitDims,
  PartList,
  type KitDims,
  type PieceBuilder,
  type ThemeKit,
} from './kit/kit-common';
import { levelSeed, placeProps } from './props';
import { isDoorway, Tile, type LevelData } from './types';
import { doorAxis, outerCorners, wallFaces, type CornerKind } from './wall-faces';

export interface LevelMesh {
  group: THREE.Group;
  /**
   * Exit doors swing open when the exit counts and stay shut, under a dim sign, while it is locked.
   * `instant` poses them without the swing (a fresh attempt).
   */
  setExitOpen(open: boolean, instant?: boolean): void;
  /** Animates the exit doors. */
  update(dt: number): void;
  dispose(): void;
}

/** Radial gradient for glows and light pools: white centre fading to transparent. */
export function radialTexture(size = 64): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const isOpen = (grid: Grid, cx: number, cy: number) => {
  const t = grid.get(cx, cy);
  return t !== Tile.Wall && !isDoorway(t);
};

function forCells(grid: Grid, fn: (cx: number, cy: number, tile: Tile) => void): void {
  for (let cy = 0; cy < grid.height; cy++) {
    for (let cx = 0; cx < grid.width; cx++) fn(cx, cy, grid.get(cx, cy));
  }
}

/** One subdivided quad per walkable cell (everything but walls). */
function floorParts(grid: Grid, kit: ThemeKit, d: KitDims): PartList {
  const p = new PartList();
  const n = KIT.floorSubdiv;
  forCells(grid, (cx, cy, tile) => {
    if (tile === Tile.Wall) return;
    const c = grid.cellCenter(cx, cy);
    const quad = new THREE.PlaneGeometry(d.t, d.t, n, n)
      .rotateX(-Math.PI / 2)
      .translate(c.x, 0, c.z);
    p.add(quad, 'floor', { tint: kit.floorTint, uv: 'xz' });
  });
  return p;
}

/** Over every open cell; door cells are covered by their lintel. */
function ceilingParts(grid: Grid, kit: ThemeKit, d: KitDims): PartList {
  const p = new PartList();
  const n = KIT.ceilingSubdiv;
  forCells(grid, (cx, cy) => {
    if (!isOpen(grid, cx, cy)) return;
    const c = grid.cellCenter(cx, cy);
    const quad = new THREE.PlaneGeometry(d.t, d.t, n, n)
      .rotateX(Math.PI / 2)
      .translate(c.x, d.wallHeight, c.z);
    p.add(quad, 'ceiling', { tint: kit.ceilingTint, uv: 'xz' });
  });
  return p;
}

/** Horizontal bands from y0 to y1, cut at `cuts` and no taller than KIT.wallRowM. */
function bands(y0: number, y1: number, cuts: readonly number[]): [number, number][] {
  const edges = [y0, y1, ...cuts.filter((y) => y > y0 && y < y1)].sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < edges.length; i++) {
    const a = edges[i] as number;
    const b = edges[i + 1] as number;
    const rows = Math.max(1, Math.ceil((b - a) / KIT.wallRowM - 1e-6));
    for (let r = 0; r < rows; r++)
      out.push([a + ((b - a) * r) / rows, a + ((b - a) * (r + 1)) / rows]);
  }
  return out;
}

/** How far a strip reaches past the face end: round outer corners, short of inner ones. */
function stripEnd(kind: CornerKind, depth: number): number {
  return kind === 'outer' ? depth : kind === 'inner' ? -depth : 0;
}

/** Rotation about +Y that turns a corner piece's open quadrant (+x, +z) toward (ox, oz). */
const cornerAngle = (ox: number, oz: number) => Math.atan2(ox - oz, ox + oz);

/**
 * Wall faces with their strips, lintel faces and undersides, and corner pieces. A face's local frame
 * has +Z along its outward normal and +X along −tangent (see wall-faces.ts). At a corner only the
 * faces whose normal is ±Z change length, so two strips meeting there never overlap.
 */
function wallParts(grid: Grid, kit: ThemeKit, d: KitDims): PartList {
  const p = new PartList();
  const half = d.t / 2;
  const lower = kit.wall.lower;
  for (const f of wallFaces(grid)) {
    const toDoor = isDoorway(f.facing);
    const y0 = f.lintel ? d.doorHeight : 0;
    const y1 = toDoor ? d.doorHeight : d.wallHeight;
    const angle = Math.atan2(f.nx, f.nz);
    const c = grid.cellCenter(f.cx, f.cy);
    const ex = c.x + f.nx * half;
    const ez = c.z + f.nz * half;
    const uv = f.nz !== 0 ? 'xy' : 'zy';
    const cuts = [KIT.wallEdgeRowM, d.wallHeight - KIT.wallEdgeRowM];
    if (lower) cuts.push(lower.height);
    for (const [a, b] of bands(y0, y1, cuts)) {
      const panel = lower && (a + b) / 2 < lower.height;
      const quad = new THREE.PlaneGeometry(d.t, b - a, KIT.wallColumns, 1)
        .rotateY(angle)
        .translate(ex, (a + b) / 2, ez);
      p.add(quad, panel ? lower.slot : 'wall', { tint: panel ? lower.tint : kit.wall.tint, uv });
    }
    if (toDoor) continue;
    for (const s of kit.strips) {
      if (s.y < y0 - 1e-6 || s.y + s.height > y1 + 1e-6) continue;
      const high = s.y >= d.doorHeight;
      let a = -half;
      let b = half;
      if (f.nz !== 0) {
        a -= stripEnd(high ? f.startHigh : f.start, s.depth);
        b += stripEnd(high ? f.endHigh : f.end, s.depth);
      }
      const strip = new THREE.BoxGeometry(b - a, s.height, s.depth)
        .translate(-(a + b) / 2, s.y + s.height / 2, s.depth / 2)
        .rotateY(angle)
        .translate(ex, 0, ez);
      p.add(strip, s.slot, { tint: s.tint });
    }
  }
  forCells(grid, (cx, cy, tile) => {
    if (!isDoorway(tile)) return;
    const c = grid.cellCenter(cx, cy);
    const under = new THREE.PlaneGeometry(d.t, d.t)
      .rotateX(Math.PI / 2)
      .translate(c.x, d.doorHeight, c.z);
    p.add(under, kit.lintelSlot, { uv: 'xz' });
  });
  const corner = kit.corner && buildPiece(kit.corner, d);
  if (corner) {
    for (const k of outerCorners(grid)) {
      p.addBuilt(
        corner
          .clone()
          .rotateY(cornerAngle(k.ox, k.oz))
          .translate(k.vx * d.t, 0, k.vy * d.t),
      );
    }
    corner.dispose();
  }
  return p;
}

/** Multiplies AO into vertex colour and writes the lamp bake, from each vertex's world position. */
function bakeStatic(geo: THREE.BufferGeometry, grid: Grid, lamps: readonly BakeLamp[]): void {
  const pos = geo.getAttribute('position');
  const nrm = geo.getAttribute('normal');
  const col = geo.getAttribute('color') as THREE.BufferAttribute;
  const bake = geo.getAttribute('kitBake') as THREE.BufferAttribute;
  const light: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = nrm.getX(i);
    const ny = nrm.getY(i);
    const nz = nrm.getZ(i);
    const ao = staticAo(grid, x, y, z, nx, ny, nz);
    col.setXYZ(i, col.getX(i) * ao, col.getY(i) * ao, col.getZ(i) * ao);
    light[0] = light[1] = light[2] = 0;
    lampLight(grid, lamps, x, y, z, nx, ny, nz, light);
    bake.setXYZ(i, light[0], light[1], light[2]);
  }
}

interface Placement {
  x: number;
  y: number;
  z: number;
  rotY: number;
  /** Baked lamp light for the whole instance (linear RGB). */
  bake: readonly [number, number, number];
}

export function buildLevelMesh(
  level: LevelData,
  grid: Grid,
  material: THREE.Material,
  debug: boolean,
): LevelMesh {
  const kit = THEME_KITS[level.theme ?? DEFAULT_THEME];
  const d = kitDims(grid.tileSize);
  const lamps = bakeLamps(level, grid);
  const group = new THREE.Group();
  group.name = `level:${level.id}`;
  const disposables: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  const addStatic = (parts: PartList, name: string, cast: boolean, receive: boolean) => {
    const geo = parts.merge();
    if (!geo) return;
    bakeStatic(geo, grid, lamps);
    const mesh = new THREE.Mesh(own(geo), material);
    mesh.name = name;
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    group.add(mesh);
  };
  addStatic(floorParts(grid, kit, d), 'floor', false, true);
  addStatic(wallParts(grid, kit, d), 'walls', true, true);
  addStatic(ceilingParts(grid, kit, d), 'ceiling', false, false);

  const pointLight = (x: number, y: number, z: number, ny: number) => {
    const out: [number, number, number] = [0, 0, 0];
    lampLight(grid, lamps, x, y, z, 0, ny, 0, out);
    return out;
  };
  const color = new THREE.Color();
  const m = new THREE.Matrix4();
  const addInstanced = (
    builder: PieceBuilder,
    placements: readonly Placement[],
    name: string,
    shadows: boolean,
  ) => {
    if (placements.length === 0) return;
    const geo = buildPiece(builder, d);
    if (!geo) return;
    const mesh = new THREE.InstancedMesh(own(geo), material, placements.length);
    mesh.name = name;
    placements.forEach((pl, i) => {
      mesh.setMatrixAt(i, m.makeRotationY(pl.rotY).setPosition(pl.x, pl.y, pl.z));
      mesh.setColorAt(i, color.setRGB(pl.bake[0], pl.bake[1], pl.bake[2]));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = mesh.receiveShadow = shadows;
    group.add(mesh);
  };

  // Cover props, one mesh per variant.
  const props = placeProps(grid, levelSeed(level.id), kit.props.length);
  kit.props.forEach((builder, v) => {
    const placements = props
      .filter((pr) => pr.variant === v)
      .map((pr) => {
        const c = grid.cellCenter(pr.cx, pr.cy);
        return {
          x: c.x,
          y: 0,
          z: c.z,
          rotY: (pr.quarterTurns * Math.PI) / 2,
          bake: pointLight(c.x, d.coverHeight, c.z, 1),
        };
      });
    addInstanced(builder, placements, `props:${v}`, true);
  });

  const doors: Placement[] = [];
  const detail: Placement[] = [];
  forCells(grid, (cx, cy, tile) => {
    const c = grid.cellCenter(cx, cy);
    if (isDoorway(tile)) {
      const rotY = doorAxis(grid, cx, cy) === 'z' ? 0 : Math.PI / 2;
      doors.push({ x: c.x, y: 0, z: c.z, rotY, bake: pointLight(c.x, d.doorHeight / 2, c.z, 1) });
    } else if (tile !== Tile.Wall && kit.ceilingDetail?.at(cx, cy)) {
      detail.push({
        x: c.x,
        y: 0,
        z: c.z,
        rotY: 0,
        bake: pointLight(c.x, d.wallHeight - 0.25, c.z, -1),
      });
    }
  });
  addInstanced(kit.doorFrame, doors, 'door-frames', true);
  if (kit.ceilingDetail) addInstanced(kit.ceilingDetail.build, detail, 'ceiling-detail', false);
  addInstanced(
    kit.lampFixture,
    lamps.map((l) => ({
      x: l.x,
      y: l.y,
      z: l.z,
      rotY: 0,
      bake: [l.r * KIT.fixtureGlow, l.g * KIT.fixtureGlow, l.b * KIT.fixtureGlow] as const,
    })),
    'lamp-fixtures',
    false,
  );

  // Exit doors in the outer wall (their frames and lintels are among the doorways above).
  const exitDoors = buildExitDoors(grid, kit, d, material, (x, y, z) => pointLight(x, y, z, 1));
  if (exitDoors) {
    disposables.push(exitDoors);
    group.add(exitDoors.group);
  }

  // Lamp bulbs: an additive glow per lamp (the bake lights the room around it).
  if (level.lamps.length > 0) {
    const glows = new THREE.InstancedMesh(
      own(new THREE.IcosahedronGeometry(LEVEL.lampGlowSize / 4, 1)),
      own(
        new THREE.MeshBasicMaterial({
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          fog: true,
        }),
      ),
      level.lamps.length,
    );
    level.lamps.forEach((lamp, i) => {
      const p = grid.gridToWorld(lamp.x, lamp.y);
      color.set(lamp.color ?? LEVEL.lampDefaultColor);
      color.multiplyScalar(lamp.intensity ?? LEVEL.lampDefaultIntensity);
      glows.setMatrixAt(i, m.makeTranslation(p.x, LEVEL.lampHeight, p.z));
      glows.setColorAt(i, color);
    });
    glows.instanceMatrix.needsUpdate = true;
    glows.computeBoundingSphere();
    group.add(glows);
  }

  if (debug) group.add(buildDebugMarkers(level, grid, own));

  return {
    group,
    setExitOpen(open, instant = false) {
      exitDoors?.setOpen(open, instant);
    },
    update(dt) {
      exitDoors?.update(dt);
    },
    dispose() {
      for (const x of disposables) x.dispose();
      group.traverse((o) => {
        if (o instanceof THREE.InstancedMesh) o.dispose();
      });
    },
  };
}

/** ?debug=1: guard spawns (red), waypoints (amber), objective item (cyan). */
function buildDebugMarkers(
  level: LevelData,
  grid: Grid,
  own: <T extends { dispose(): void }>(x: T) => T,
): THREE.InstancedMesh {
  const points: [number, number, number][] = [];
  for (const g of level.guards) {
    points.push([g.spawn.x, g.spawn.y, 0xff3030]);
    for (const w of g.waypoints) points.push([w.x, w.y, 0xffb347]);
  }
  if (level.objective.item) points.push([level.objective.item.x, level.objective.item.y, 0xbff4ff]);
  const mesh = new THREE.InstancedMesh(
    own(new THREE.OctahedronGeometry(LEVEL.debugMarkerSize)),
    own(new THREE.MeshBasicMaterial({ fog: false })),
    Math.max(1, points.length),
  );
  mesh.count = points.length;
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  points.forEach(([x, y, hex], i) => {
    const p = grid.gridToWorld(x, y);
    mesh.setMatrixAt(i, m.makeTranslation(p.x, LEVEL.debugMarkerSize * 2, p.z));
    mesh.setColorAt(i, c.set(hex));
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}
