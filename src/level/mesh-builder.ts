// Builds the greybox level visuals: a merged floor plus one InstancedMesh per tile type (~7 draw calls).
// No THREE.Light objects are created here; lamps are faked with additive meshes (CLAUDE.md lighting rule).

import * as THREE from 'three';
import { LEVEL } from '../config/tunables';
import type { Grid } from './grid';
import { Tile, type LevelData } from './types';

export interface LevelMesh {
  group: THREE.Group;
  /** Exit markers glow when the exit counts, and sit dim and grey while it is still locked. */
  setExitOpen(open: boolean): void;
  dispose(): void;
}

/** Radial gradient for lamp pools and glows: white centre fading to transparent. */
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

/** One quad per non-wall cell, with vertex-colour AO darkening corners that touch walls or cover. */
function buildFloorGeometry(grid: Grid): THREE.BufferGeometry {
  const t = grid.tileSize;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const solidAt = (cx: number, cy: number) => (grid.isSolid(cx, cy) ? 1 : 0);
  // Corner (vx, vy) in vertex space touches cells (vx-1..vx, vy-1..vy).
  const cornerShade = (vx: number, vy: number) => {
    const solid =
      solidAt(vx - 1, vy - 1) + solidAt(vx, vy - 1) + solidAt(vx - 1, vy) + solidAt(vx, vy);
    return 1 - LEVEL.floorAo * Math.min(1, solid / 2);
  };
  for (let cy = 0; cy < grid.height; cy++) {
    for (let cx = 0; cx < grid.width; cx++) {
      if (grid.get(cx, cy) === Tile.Wall) continue;
      const base = positions.length / 3;
      for (const [ox, oy] of [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ] as const) {
        positions.push((cx + ox) * t, 0, (cy + oy) * t);
        const s = cornerShade(cx + ox, cy + oy);
        colors.push(s, s, s);
      }
      // Counter-clockwise seen from above (+Y) so the face points up.
      indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** InstancedMesh with one instance per cell matching `want`, placed by `place`. */
function instancedForCells(
  grid: Grid,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  want: (cx: number, cy: number) => boolean,
): THREE.InstancedMesh {
  const cells: [number, number][] = [];
  for (let cy = 0; cy < grid.height; cy++) {
    for (let cx = 0; cx < grid.width; cx++) if (want(cx, cy)) cells.push([cx, cy]);
  }
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, cells.length));
  mesh.count = cells.length;
  const m = new THREE.Matrix4();
  cells.forEach(([cx, cy], i) => {
    const c = grid.cellCenter(cx, cy);
    mesh.setMatrixAt(i, m.makeTranslation(c.x, 0, c.z));
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

/** Box geometry with its base at y = bottom. */
function boxFrom(w: number, h: number, d: number, bottom = 0): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(0, bottom + h / 2, 0);
}

export function buildLevelMesh(level: LevelData, grid: Grid, debug: boolean): LevelMesh {
  const t = grid.tileSize;
  const group = new THREE.Group();
  group.name = `level:${level.id}`;
  const disposables: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  // Floor (merged, one draw call).
  const floor = new THREE.Mesh(
    own(buildFloorGeometry(grid)),
    own(
      new THREE.MeshStandardMaterial({
        color: LEVEL.floorColor,
        roughness: 0.95,
        vertexColors: true,
      }),
    ),
  );
  floor.receiveShadow = true;
  group.add(floor);

  // Walls: skip fully enclosed wall cells, the player can never see them.
  const isWall = (cx: number, cy: number) => grid.get(cx, cy) === Tile.Wall;
  const visibleWall = (cx: number, cy: number) =>
    isWall(cx, cy) &&
    !(isWall(cx - 1, cy) && isWall(cx + 1, cy) && isWall(cx, cy - 1) && isWall(cx, cy + 1));
  const walls = instancedForCells(
    grid,
    own(boxFrom(t, LEVEL.wallHeight, t)),
    own(new THREE.MeshStandardMaterial({ color: LEVEL.wallColor, roughness: 0.85 })),
    visibleWall,
  );
  walls.castShadow = walls.receiveShadow = true;
  group.add(walls);

  const coverSize = t - 2 * LEVEL.coverInset;
  const cover = instancedForCells(
    grid,
    own(boxFrom(coverSize, LEVEL.coverHeight, coverSize)),
    own(new THREE.MeshStandardMaterial({ color: LEVEL.coverColor, roughness: 0.8 })),
    (cx, cy) => grid.get(cx, cy) === Tile.Cover,
  );
  cover.castShadow = cover.receiveShadow = true;
  group.add(cover);

  const lintels = instancedForCells(
    grid,
    own(boxFrom(t, LEVEL.wallHeight - LEVEL.doorHeight, t, LEVEL.doorHeight)),
    own(new THREE.MeshStandardMaterial({ color: LEVEL.lintelColor, roughness: 0.85 })),
    (cx, cy) => grid.get(cx, cy) === Tile.Door,
  );
  lintels.castShadow = true;
  group.add(lintels);

  // Exit: cyan-white floor marker (player-relevant colour), unlit so it reads in the dark.
  const exitGeo = own(new THREE.PlaneGeometry(t * 0.8, t * 0.8))
    .rotateX(-Math.PI / 2)
    .translate(0, LEVEL.decalLift, 0);
  const openColor = new THREE.Color(LEVEL.exitColor).multiplyScalar(LEVEL.exitEmissiveIntensity);
  const lockedColor = new THREE.Color(LEVEL.exitLockedColor);
  const exitMaterial = own(new THREE.MeshBasicMaterial({ color: openColor }));
  const exits = instancedForCells(
    grid,
    exitGeo,
    exitMaterial,
    (cx, cy) => grid.get(cx, cy) === Tile.Exit,
  );
  group.add(exits);

  // Lamps: a bulb glow and a floor pool, both additive, per-instance colour × intensity.
  if (level.lamps.length > 0) {
    const tex = own(radialTexture());
    const additive = (map: THREE.Texture | null) =>
      own(
        new THREE.MeshBasicMaterial({
          map,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          fog: true,
        }),
      );
    const glowGeo = own(new THREE.IcosahedronGeometry(LEVEL.lampGlowSize / 4, 1));
    const poolGeo = own(new THREE.PlaneGeometry(1, 1)).rotateX(-Math.PI / 2);
    const glows = new THREE.InstancedMesh(glowGeo, additive(null), level.lamps.length);
    const pools = new THREE.InstancedMesh(poolGeo, additive(tex), level.lamps.length);
    const m = new THREE.Matrix4();
    const color = new THREE.Color();
    level.lamps.forEach((lamp, i) => {
      const p = grid.gridToWorld(lamp.x, lamp.y);
      color.set(lamp.color ?? LEVEL.lampDefaultColor);
      color.multiplyScalar(lamp.intensity ?? LEVEL.lampDefaultIntensity);
      glows.setMatrixAt(i, m.makeTranslation(p.x, LEVEL.lampHeight, p.z));
      glows.setColorAt(i, color);
      const d = LEVEL.lampPoolRadius * 2;
      pools.setMatrixAt(i, m.makeScale(d, 1, d).setPosition(p.x, LEVEL.decalLift * 2, p.z));
      pools.setColorAt(i, color);
    });
    for (const mesh of [glows, pools]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
  }

  if (debug) group.add(buildDebugMarkers(level, grid, own));

  return {
    group,
    setExitOpen(open) {
      exitMaterial.color.copy(open ? openColor : lockedColor);
    },
    dispose() {
      for (const d of disposables) d.dispose();
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
