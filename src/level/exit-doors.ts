// Exit doors: a double door set in the outer wall at each exit cell, with an exit sign over it. While the
// exit is locked both leaves stay shut and the sign is dim; once it counts they swing outward onto a lit
// space beyond the wall (cyan-white, the player-relevant colour) whose light spills across the floor.
// The frame and lintel come from the ordinary doorway geometry. No THREE.Light objects: the glow is
// unlit. Three draw calls however many exits a level has (leaves, glow, spill).

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LEVEL } from '../config/tunables';
import type { Grid } from './grid';
import { buildPiece, LINING, type KitDims, type ThemeKit } from './kit/kit-common';
import { radialTexture } from './mesh-builder';
import { Tile } from './types';
import { exitOutward } from './wall-faces';

export interface ExitDoors {
  group: THREE.Group;
  /** Swing the doors open or shut; `instant` skips the animation (a fresh attempt). */
  setOpen(open: boolean, instant: boolean): void;
  update(dt: number): void;
  dispose(): void;
}

interface Exit {
  /** Cell centre (m) and the rotation that turns local +z toward the outside. */
  x: number;
  z: number;
  rotY: number;
  bake: readonly [number, number, number];
}

/** Glow brightness per surface, so the lit space outside reads as a room rather than a flat slab. */
const SHADE = { back: 1, side: 0.78, ceiling: 0.7, floor: 0.6, sign: 1 } as const;

/** Leaves sit this far in from the outer face of the wall (m), clear of the outer casing. */
const LEAF_SETBACK = 0.06;

const smoothstep = (x: number) => x * x * (3 - 2 * x);

function shaded(geo: THREE.BufferGeometry, shade: number): THREE.BufferGeometry {
  const n = geo.getAttribute('position').count;
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(shade), 3));
  return geo;
}

/** The glowing parts of one exit in its local frame (doorway along z, outside toward +z). */
function glowParts(d: KitDims): THREE.BufferGeometry {
  const half = d.t / 2;
  const depth = LEVEL.exitOutsideDepthM;
  // A little wider than the doorway so an open leaf never pokes through the side walls.
  const w = d.t + 0.2;
  const h = d.doorHeight;
  const zMid = half + depth / 2;
  const [sw, sh, sd] = LEVEL.exitSignSize;
  const parts = [
    shaded(
      new THREE.PlaneGeometry(w, h).rotateY(Math.PI).translate(0, h / 2, half + depth),
      SHADE.back,
    ),
    shaded(
      new THREE.PlaneGeometry(depth, h).rotateY(Math.PI / 2).translate(-w / 2, h / 2, zMid),
      SHADE.side,
    ),
    shaded(
      new THREE.PlaneGeometry(depth, h).rotateY(-Math.PI / 2).translate(w / 2, h / 2, zMid),
      SHADE.side,
    ),
    shaded(
      new THREE.PlaneGeometry(w, depth).rotateX(-Math.PI / 2).translate(0, 0, zMid),
      SHADE.floor,
    ),
    shaded(
      new THREE.PlaneGeometry(w, depth).rotateX(Math.PI / 2).translate(0, h, zMid),
      SHADE.ceiling,
    ),
    shaded(
      new THREE.BoxGeometry(sw, sh, sd).translate(
        0,
        h + LEVEL.exitSignGapM + sh / 2,
        -half - sd / 2,
      ),
      SHADE.sign,
    ),
  ];
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('exit-doors: glow parts have mismatched attributes');
  return merged;
}

/** Floor spill in the local frame: brightest at the threshold, fading into the room. */
function spillGeometry(d: KitDims): THREE.BufferGeometry {
  const len = LEVEL.exitSpillLengthM;
  return new THREE.PlaneGeometry(d.t * 1.3, len * 2)
    .rotateX(-Math.PI / 2)
    .translate(0, LEVEL.decalLift, d.t / 2 - LEAF_SETBACK);
}

export function buildExitDoors(
  grid: Grid,
  kit: ThemeKit,
  d: KitDims,
  material: THREE.Material,
  bakeAt: (x: number, y: number, z: number) => readonly [number, number, number],
): ExitDoors | null {
  const exits: Exit[] = [];
  for (let cy = 0; cy < grid.height; cy++) {
    for (let cx = 0; cx < grid.width; cx++) {
      if (grid.get(cx, cy) !== Tile.Exit) continue;
      const out = exitOutward(grid, cx, cy);
      if (!out) continue; // the validator rejects exits away from the outer wall
      const c = grid.cellCenter(cx, cy);
      exits.push({
        x: c.x,
        z: c.z,
        rotY: Math.atan2(out.ox, out.oz),
        bake: bakeAt(c.x, d.doorHeight / 2, c.z),
      });
    }
  }
  if (exits.length === 0) return null;

  const group = new THREE.Group();
  group.name = 'exit-doors';
  const disposables: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  // Leaves: two per exit, posed every frame the doors move.
  const leafGeo = buildPiece(kit.exitDoor, d);
  if (!leafGeo) return null;
  const leaves = new THREE.InstancedMesh(own(leafGeo), material, exits.length * 2);
  leaves.name = 'exit-leaves';
  leaves.castShadow = leaves.receiveShadow = true;
  const color = new THREE.Color();
  exits.forEach((e, i) => {
    color.setRGB(e.bake[0], e.bake[1], e.bake[2]);
    leaves.setColorAt(i * 2, color);
    leaves.setColorAt(i * 2 + 1, color);
  });
  group.add(leaves);

  // Glow (sign + lit space outside) and floor spill, merged across exits.
  const openColor = new THREE.Color(LEVEL.exitColor).multiplyScalar(LEVEL.exitEmissiveIntensity);
  const lockedColor = new THREE.Color(LEVEL.exitLockedColor);
  const glowMaterial = own(new THREE.MeshBasicMaterial({ color: openColor, vertexColors: true }));
  const spillMaterial = own(
    new THREE.MeshBasicMaterial({
      color: openColor,
      map: own(radialTexture()),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  const m = new THREE.Matrix4();
  const place = (local: THREE.BufferGeometry) => {
    const copies = exits.map((e) =>
      local.clone().applyMatrix4(m.makeRotationY(e.rotY).setPosition(e.x, 0, e.z)),
    );
    local.dispose();
    const merged = mergeGeometries(copies, false);
    for (const c of copies) c.dispose();
    if (!merged) throw new Error('exit-doors: could not merge exits');
    merged.computeBoundingSphere();
    return own(merged);
  };
  const glow = new THREE.Mesh(place(glowParts(d)), glowMaterial);
  glow.name = 'exit-glow';
  const spill = new THREE.Mesh(place(spillGeometry(d)), spillMaterial);
  spill.name = 'exit-spill';
  spill.renderOrder = 1;
  group.add(glow, spill);

  // Hinges in the local frame: just inside the jamb linings, set back from the outer face.
  const half = d.t / 2;
  const hingeX = half - LINING;
  const hingeZ = half - LEAF_SETBACK;
  const maxAngle = THREE.MathUtils.degToRad(LEVEL.exitDoorOpenDeg);
  const base = new THREE.Matrix4();
  const hinge = new THREE.Matrix4();
  const swing = new THREE.Matrix4();

  let target = 0;
  let openness = -1; // forces the first pose
  const pose = (k: number) => {
    if (k === openness) return;
    openness = k;
    const a = smoothstep(k) * maxAngle;
    exits.forEach((e, i) => {
      base.makeRotationY(e.rotY).setPosition(e.x, 0, e.z);
      // Left leaf spans +x from its hinge; turning by −a swings its free edge toward +z (outside).
      hinge.makeTranslation(-hingeX, 0, hingeZ);
      leaves.setMatrixAt(i * 2, m.multiplyMatrices(base, hinge).multiply(swing.makeRotationY(-a)));
      // Right leaf: the same piece turned half round, spanning −x, swinging the other way.
      hinge.makeTranslation(hingeX, 0, hingeZ);
      leaves.setMatrixAt(
        i * 2 + 1,
        m.multiplyMatrices(base, hinge).multiply(swing.makeRotationY(Math.PI + a)),
      );
    });
    leaves.instanceMatrix.needsUpdate = true;
    leaves.computeBoundingSphere();
    spillMaterial.opacity = smoothstep(k) * LEVEL.exitSpillOpacity;
    spill.visible = k > 0;
  };
  pose(0);

  return {
    group,
    setOpen(open, instant) {
      target = open ? 1 : 0;
      glowMaterial.color.copy(open ? openColor : lockedColor);
      if (instant) pose(target);
    },
    update(dt) {
      if (openness === target) return;
      const step = dt / LEVEL.exitDoorOpenS;
      pose(
        target > openness ? Math.min(target, openness + step) : Math.max(target, openness - step),
      );
    },
    dispose() {
      for (const x of disposables) x.dispose();
      leaves.dispose();
    },
  };
}
