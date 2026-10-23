// Shared pieces of the environment kit: the trim-sheet slots, the per-theme kit description, and
// PartList, which stamps every part with the attributes the kit material reads and merges them into one
// geometry (one draw call per mesh or per instanced variant).
//
// Kit attributes: `uv` in metres (the material tiles it by each slot's texture size), `color` = tint ×
// AO, `kitSlot` = trim-sheet slot index, `kitBake` = baked lamp light (linear RGB, added as emissive).

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { KIT, LEVEL } from '../../config/tunables';

/** Trim-sheet slots, in sheet order (must match SLOTS in scripts/assets/themes.mjs). */
export const KIT_SLOTS = [
  'floor',
  'wall',
  'ceiling',
  'trim',
  'propA',
  'propB',
  'propC',
  'metal',
] as const;
export type SlotName = (typeof KIT_SLOTS)[number];

export const slotIndex = (slot: SlotName): number => KIT_SLOTS.indexOf(slot);

/** Level dimensions the kit pieces are built for (m). */
export interface KitDims {
  t: number;
  wallHeight: number;
  doorHeight: number;
  coverHeight: number;
  lampHeight: number;
}

export function kitDims(tileSize: number): KitDims {
  return {
    t: tileSize,
    wallHeight: LEVEL.wallHeight,
    doorHeight: LEVEL.doorHeight,
    coverHeight: LEVEL.coverHeight,
    lampHeight: LEVEL.lampHeight,
  };
}

/** A horizontal moulding run along every wall face: skirting, rails, crown. */
export interface StripDef {
  /** Bottom edge and height (m above the floor). */
  y: number;
  height: number;
  /** How far it stands off the wall (m). */
  depth: number;
  slot: SlotName;
  tint?: number;
}

export type PieceBuilder = (parts: PartList, d: KitDims) => void;

/** Everything that makes one theme look like itself. Builders add parts in their own local frame. */
export interface ThemeKit {
  /** Flat colour per slot (sRGB), shown until the theme's trim sheet has loaded, or if it fails. */
  fallback: Record<SlotName, number>;
  floorTint?: number;
  ceilingTint?: number;
  /** Wall surface; `lower` panels the bottom of every wall in another slot (wainscot). */
  wall: { tint?: number; lower?: { height: number; slot: SlotName; tint?: number } };
  /** Underside of door lintels. */
  lintelSlot: SlotName;
  strips: readonly StripDef[];
  /** Outer wall corner: the wall fills x < 0, z < 0 and the corner opens toward +x and +z. */
  corner?: PieceBuilder;
  /** Doorway trim, for a door cell centred at the origin whose passage runs along z. */
  doorFrame: PieceBuilder;
  /** Ceiling detail for one open cell centred at the origin (heights from the floor). */
  ceilingDetail?: { build: PieceBuilder; at: (cx: number, cy: number) => boolean };
  /** Lamp fixture with its origin at the bulb. */
  lampFixture: PieceBuilder;
  /**
   * Cover-tile props, each standing on the floor at the origin with its front toward +z, inside a
   * footprint of (t − 2·coverInset)² and roughly coverHeight tall (the sim treats cover as a 1 m box).
   */
  props: readonly PieceBuilder[];
}

export interface PartOptions {
  /** sRGB tint multiplied into the texture (default white). */
  tint?: number;
  /** Darken toward y = 0 (props, pieces on the floor). Static level geometry gets AO from the grid. */
  baseAo?: boolean;
  /**
   * UVs in metres: 'box' projects each triangle along its dominant axis; 'xz' / 'xy' / 'zy' project
   * every vertex onto one plane (for flat pieces, keeping shared vertices); a pair scales the geometry's
   * own UVs to metres.
   */
  uv?: 'box' | 'xz' | 'xy' | 'zy' | readonly [number, number];
}

const tmpColor = new THREE.Color();

/** Collects parts with kit attributes and merges them into one indexed geometry. */
export class PartList {
  private readonly parts: THREE.BufferGeometry[] = [];

  get isEmpty(): boolean {
    return this.parts.length === 0;
  }

  /** Adds a part (taking ownership of the geometry). */
  add(geometry: THREE.BufferGeometry, slot: SlotName, opts: PartOptions = {}): this {
    const uvMode = opts.uv ?? 'box';
    let geo = geometry;
    if (uvMode === 'box' && geo.index) {
      geo = geometry.toNonIndexed();
      geometry.dispose();
    }
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();
    const pos = geo.getAttribute('position');
    const n = pos.count;
    const uv = new Float32Array(n * 2);
    if (uvMode === 'box') boxUv(pos, uv);
    else if (typeof uvMode === 'string') planarUv(pos, uv, uvMode);
    else {
      const own = geo.getAttribute('uv');
      for (let i = 0; i < n; i++) {
        uv[i * 2] = (own?.getX(i) ?? 0) * uvMode[0];
        uv[i * 2 + 1] = (own?.getY(i) ?? 0) * uvMode[1];
      }
    }
    tmpColor.setHex(opts.tint ?? 0xffffff);
    const color = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const ao = opts.baseAo
        ? 1 - KIT.propBaseAo * Math.pow(1 - Math.min(1, pos.getY(i) / KIT.propBaseAoM), 2)
        : 1;
      color[i * 3] = tmpColor.r * ao;
      color[i * 3 + 1] = tmpColor.g * ao;
      color[i * 3 + 2] = tmpColor.b * ao;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', pos);
    out.setAttribute('normal', geo.getAttribute('normal'));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.setAttribute('color', new THREE.BufferAttribute(color, 3));
    out.setAttribute(
      'kitSlot',
      new THREE.BufferAttribute(new Float32Array(n).fill(slotIndex(slot)), 1),
    );
    out.setAttribute('kitBake', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    out.setIndex(geo.index ?? [...Array(n).keys()]);
    this.parts.push(out);
    return this;
  }

  /** Adds a geometry that already carries kit attributes (e.g. a transformed copy of a merged piece). */
  addBuilt(geometry: THREE.BufferGeometry): this {
    this.parts.push(geometry);
    return this;
  }

  /** Merges everything added so far into one geometry, or null if nothing was added. */
  merge(): THREE.BufferGeometry | null {
    if (this.parts.length === 0) return null;
    const merged = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts.length = 0;
    if (!merged) throw new Error('kit: parts have mismatched attributes');
    merged.computeBoundingSphere();
    return merged;
  }
}

/** Builds a piece into its own merged geometry. */
export function buildPiece(builder: PieceBuilder, d: KitDims): THREE.BufferGeometry | null {
  const parts = new PartList();
  builder(parts, d);
  return parts.merge();
}

function boxUv(pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, uv: Float32Array) {
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i + 2 < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    const nrm = b.sub(a).cross(c.sub(a));
    const ax = Math.abs(nrm.x);
    const ay = Math.abs(nrm.y);
    const az = Math.abs(nrm.z);
    const mode = ay >= ax && ay >= az ? 'xz' : ax >= az ? 'zy' : 'xy';
    for (let k = i; k < i + 3; k++) planarVertex(pos, uv, k, mode);
  }
}

function planarUv(
  pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  uv: Float32Array,
  mode: 'xz' | 'xy' | 'zy',
) {
  for (let i = 0; i < pos.count; i++) planarVertex(pos, uv, i, mode);
}

function planarVertex(
  pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  uv: Float32Array,
  i: number,
  mode: 'xz' | 'xy' | 'zy',
) {
  uv[i * 2] = mode === 'zy' ? pos.getZ(i) : pos.getX(i);
  uv[i * 2 + 1] = mode === 'xz' ? pos.getZ(i) : pos.getY(i);
}

// Primitive helpers. Sizes in metres; (x, y, z) places the base centre, so y is the bottom face.

export function box(w: number, h: number, d: number, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
}

/** Box with rounded edges (smooth-shaded bevel of radius r). */
export function rbox(
  w: number,
  h: number,
  d: number,
  r: number,
  x = 0,
  y = 0,
  z = 0,
): THREE.BufferGeometry {
  return new RoundedBoxGeometry(w, h, d, 1, r).translate(x, y + h / 2, z);
}

export function cyl(
  rTop: number,
  rBottom: number,
  h: number,
  segments: number,
  x = 0,
  y = 0,
  z = 0,
  openEnded = false,
): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(rTop, rBottom, h, segments, 1, openEnded).translate(
    x,
    y + h / 2,
    z,
  );
}

/** Sphere-ish blob (icosahedron), centred at (x, y, z). */
export function ball(r: number, x = 0, y = 0, z = 0, detail = 1): THREE.BufferGeometry {
  return new THREE.IcosahedronGeometry(r, detail).translate(x, y, z);
}

/** The same surface seen from the other side: winding reversed and normals negated (non-indexed). */
export function flipped(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const geo = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  for (const name of Object.keys(geo.attributes)) {
    const attr = geo.getAttribute(name) as THREE.BufferAttribute;
    const size = attr.itemSize;
    const arr = attr.array;
    for (let i = 0; i + 2 < attr.count; i += 3) {
      for (let k = 0; k < size; k++) {
        const t = arr[(i + 1) * size + k] as number;
        arr[(i + 1) * size + k] = arr[(i + 2) * size + k] as number;
        arr[(i + 2) * size + k] = t;
      }
    }
  }
  const normal = geo.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < normal.array.length; i++) normal.array[i] = -(normal.array[i] as number);
  return geo;
}

// Shared piece shapes.

export interface CasingOptions {
  /** Casing board width and how far it stands off the wall (m). */
  width: number;
  depth: number;
  slot: SlotName;
  tint?: number;
  /** Lining boards on the jambs and under the lintel. */
  lining: { slot: SlotName; tint?: number };
  /** Blocks at the foot of each casing post (m): width, height, depth. */
  plinth?: readonly [number, number, number];
  /** A cap board over the head casing (m): height, extra overhang. */
  cornice?: readonly [number, number];
}

/** Door trim for a door cell centred at the origin with its passage along z (see ThemeKit.doorFrame). */
export function doorCasing(p: PartList, d: KitDims, o: CasingOptions): void {
  const half = d.t / 2;
  const { width: w, depth: dp } = o;
  const part = { tint: o.tint, baseAo: true } as const;
  for (const s of [-1, 1]) {
    const z = s * (half + dp / 2);
    for (const side of [-1, 1]) {
      const x = side * (half + w / 2);
      p.add(box(w, d.doorHeight + w, dp, x, 0, z), o.slot, part);
      if (o.plinth) {
        const [pw, ph, pd] = o.plinth;
        p.add(box(pw, ph, pd, side * (half + pw / 2), 0, s * (half + pd / 2)), o.slot, part);
      }
    }
    p.add(box(d.t + 2 * w, w, dp, 0, d.doorHeight, z), o.slot, part);
    if (o.cornice) {
      const [ch, over] = o.cornice;
      const cd = dp + over;
      p.add(
        box(d.t + 2 * (w + over), ch, cd, 0, d.doorHeight + w, s * (half + cd / 2)),
        o.slot,
        part,
      );
    }
  }
  const lining = { tint: o.lining.tint, baseAo: true } as const;
  const lt = 0.02;
  for (const side of [-1, 1]) {
    p.add(box(lt, d.doorHeight, d.t, side * (half - lt / 2), 0, 0), o.lining.slot, lining);
  }
  p.add(box(d.t, lt, d.t, 0, d.doorHeight - lt, 0), o.lining.slot, lining);
}

/** An L-shaped corner guard (legs of `leg` m, `thick` m thick) from y0 up `height` m. */
export function cornerAngle(
  p: PartList,
  leg: number,
  thick: number,
  y0: number,
  height: number,
  slot: SlotName,
  tint?: number,
): void {
  p.add(box(leg + thick, height, thick, (thick - leg) / 2, y0, thick / 2), slot, { tint });
  p.add(box(thick, height, leg, thick / 2, y0, -leg / 2), slot, { tint });
}

/** A wooden pallet of footprint w × depth; returns the height of its deck. */
export function pallet(
  p: PartList,
  w: number,
  depth: number,
  slot: SlotName,
  tint?: number,
): number {
  const part = { tint, baseAo: true } as const;
  const board = 0.022;
  const block = 0.1;
  for (const z of [-depth / 2 + 0.06, 0, depth / 2 - 0.06]) {
    p.add(box(w, board, 0.12, 0, 0, z), slot, part);
  }
  for (const x of [-w / 2 + block / 2, 0, w / 2 - block / 2]) {
    p.add(box(block, block, depth, x, board, 0), slot, part);
  }
  const slats = 7;
  const sw = 0.14;
  for (let i = 0; i < slats; i++) {
    const x = -w / 2 + sw / 2 + (i * (w - sw)) / (slats - 1);
    p.add(box(sw, board, depth, x, board + block, 0), slot, part);
  }
  return 2 * board + block;
}
