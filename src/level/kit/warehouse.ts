// Warehouse: brick walls over a concrete kerb, steel I-beams under a corrugated roof, enamel dome lamps,
// and crates, pallets and drums for cover.

import {
  box,
  cornerAngle,
  cyl,
  doorCasing,
  doorLeaf,
  flipped,
  pallet,
  rbox,
  type PartList,
  type SlotName,
  type ThemeKit,
} from './kit-common';

const STEEL = 0x8a8c8e;

/** A plank crate: a slightly inset body inside a frame of corner posts and edge boards. */
function crate(
  p: PartList,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  slot: SlotName = 'propA',
): void {
  const f = 0.065;
  const frame = { tint: 0x9a9080, baseAo: true } as const;
  p.add(rbox(w - 0.03, h - 0.02, d - 0.03, 0.01, x, y + 0.01, z), slot, { baseAo: true });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      p.add(box(f, h, f, x + (sx * (w - f)) / 2, y, z + (sz * (d - f)) / 2), slot, frame);
    }
  }
  for (const yy of [y, y + h - f]) {
    for (const sz of [-1, 1]) {
      p.add(box(w - 2 * f, f, 0.025, x, yy, z + sz * (d / 2 - 0.0125)), slot, frame);
    }
    for (const sx of [-1, 1]) {
      p.add(box(0.025, f, d - 2 * f, x + sx * (w / 2 - 0.0125), yy, z), slot, frame);
    }
  }
}

/** A steel drum standing at (x, y, z). */
function drum(p: PartList, x: number, y: number, z: number, tint: number): void {
  const r = 0.28;
  const h = 0.84;
  p.add(cyl(r, r, h, 20, x, y, z), 'propC', { tint, baseAo: true, uv: [2 * Math.PI * r, h] });
  for (const k of [0.33, 0.66]) {
    p.add(cyl(r + 0.012, r + 0.012, 0.025, 20, x, y + h * k, z), 'propC', {
      tint: 0x9a9a9a,
      baseAo: true,
    });
  }
  p.add(cyl(r + 0.006, r + 0.006, 0.03, 20, x, y + h - 0.02, z), 'metal', { tint: STEEL });
}

export const WAREHOUSE: ThemeKit = {
  fallback: {
    floor: 0x2b2d30,
    wall: 0x4a3a32,
    ceiling: 0x2e3238,
    trim: 0x3a423e,
    propA: 0x4d4539,
    propB: 0x403830,
    propC: 0x2f4a3a,
    metal: 0x3c3c3c,
  },
  floorTint: 0xd0d0d0,
  wall: { tint: 0xc8bcb4 },
  ceilingTint: 0x9098a0,
  lintelSlot: 'trim',
  strips: [
    { y: 0, height: 0.18, depth: 0.05, slot: 'trim', tint: 0x9aa09a },
    { y: 2.78, height: 0.1, depth: 0.06, slot: 'metal', tint: STEEL },
  ],
  // Yellow steel corner guard above the kerb.
  corner: (p) => cornerAngle(p, 0.12, 0.012, 0.18, 1.2, 'metal', 0xd8b030),
  doorFrame: (p, d) =>
    doorCasing(p, d, {
      width: 0.14,
      depth: 0.06,
      slot: 'metal',
      tint: 0x6a6e70,
      lining: { slot: 'metal', tint: 0x6a6e70 },
    }),
  // Steel fire door: wired-glass vision panel, push bar, kick plate.
  exitDoor: (p, d) =>
    doorLeaf(p, d, {
      thickness: 0.05,
      slot: 'metal',
      tint: 0x5a6670,
      glass: { y: [0.62, 0.86], margin: 0.32, tint: 0x141a1e },
      handle: { kind: 'bar', slot: 'metal', tint: STEEL },
      kick: { height: 0.25, slot: 'metal', tint: STEEL },
    }),
  // I-beams across every other row of cells.
  ceilingDetail: {
    at: (_cx, cy) => cy % 2 === 0,
    build: (p, d) => {
      const top = d.wallHeight;
      const part = { tint: 0x7a7c7e } as const;
      p.add(box(d.t, 0.02, 0.2, 0, top - 0.02, 0), 'metal', part);
      p.add(box(d.t, 0.28, 0.02, 0, top - 0.3, 0), 'metal', part);
      p.add(box(d.t, 0.02, 0.2, 0, top - 0.32, 0), 'metal', part);
    },
  },
  // Enamel dome shade on a cable.
  lampFixture: (p, d) => {
    const shade = () => cyl(0.08, 0.3, 0.22, 20, 0, -0.05, 0, true);
    p.add(shade(), 'propC', { tint: 0x6a8a70 });
    p.add(flipped(shade()), 'propC', { tint: 0xc8c0a8 });
    p.add(cyl(0.08, 0.08, 0.06, 12, 0, 0.17, 0), 'metal', { tint: STEEL });
    p.add(cyl(0.008, 0.008, d.wallHeight - d.lampHeight - 0.23, 6, 0, 0.23, 0), 'metal', {
      tint: 0x202020,
    });
  },
  props: [
    // Two crates on a pallet.
    (p) => {
      const top = pallet(p, 1.6, 1.2, 'propB');
      crate(p, 0.78, 0.82, 1.1, -0.4, top, 0);
      crate(p, 0.78, 0.82, 1.1, 0.4, top, 0);
    },
    // Four drums on a pallet.
    (p) => {
      const top = pallet(p, 1.4, 1.4, 'propB');
      const tints = [0xffffff, 0xc89a90, 0xffffff, 0x98a8c8];
      [
        [-0.33, -0.33],
        [0.33, -0.33],
        [-0.33, 0.33],
        [0.33, 0.33],
      ].forEach(([x, z], i) => drum(p, x ?? 0, top, z ?? 0, tints[i] ?? 0xffffff));
    },
    // A long crate with two small ones on top.
    (p) => {
      crate(p, 1.6, 0.56, 1.2, 0, 0, 0);
      crate(p, 0.66, 0.44, 0.66, -0.42, 0.56, -0.15);
      crate(p, 0.6, 0.4, 0.6, 0.38, 0.56, 0.2);
    },
  ],
};
