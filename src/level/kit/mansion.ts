// Mansion: red plaster over dark wood wainscoting, pilasters on the corners, a white coffered ceiling,
// brass chandeliers, and sofas, dressed tables, planters and sideboards for cover.

import * as THREE from 'three';
import { ball, box, cyl, doorCasing, doorLeaf, rbox, type ThemeKit } from './kit-common';

const BRASS = 0xc8a050;
const PLASTER = 0xe0d8c8;

export const MANSION: ThemeKit = {
  fallback: {
    floor: 0x3c2a1c,
    wall: 0x4e1f1d,
    ceiling: 0x6b665c,
    trim: 0x2c1c14,
    propA: 0x5c1c22,
    propB: 0x4c2c1a,
    propC: 0x8c867a,
    metal: 0x8c7444,
  },
  floorTint: 0xb0a090,
  wall: { tint: 0xb08484, lower: { height: 1, slot: 'trim', tint: 0xa08070 } },
  ceilingTint: PLASTER,
  lintelSlot: 'trim',
  strips: [
    { y: 0, height: 0.22, depth: 0.03, slot: 'trim', tint: 0x705040 },
    { y: 0.97, height: 0.07, depth: 0.045, slot: 'trim' },
    { y: 2.78, height: 0.22, depth: 0.1, slot: 'ceiling', tint: PLASTER },
  ],
  // Pilaster centred on the corner; the half inside the wall is never seen.
  corner: (p, d) => {
    const ao = { baseAo: true } as const;
    p.add(box(0.36, 0.26, 0.36), 'trim', ao);
    p.add(box(0.28, d.wallHeight - 0.22 - 0.26, 0.28, 0, 0.26, 0), 'trim', ao);
    p.add(box(0.34, 0.06, 0.34, 0, 0.26, 0), 'trim', { tint: 0x907060 });
  },
  doorFrame: (p, d) =>
    doorCasing(p, d, {
      width: 0.16,
      depth: 0.045,
      slot: 'trim',
      lining: { slot: 'trim', tint: 0x907060 },
      plinth: [0.19, 0.28, 0.06],
      cornice: [0.07, 0.03],
    }),
  // Panelled wooden door with a brass knob.
  exitDoor: (p, d) =>
    doorLeaf(p, d, {
      thickness: 0.055,
      slot: 'trim',
      panels: {
        rows: [
          [0.07, 0.44],
          [0.52, 0.93],
        ],
        margin: 0.12,
        tint: 0xc0a088,
      },
      handle: { kind: 'knob', slot: 'metal', tint: BRASS },
      kick: { height: 0.18, slot: 'metal', tint: BRASS },
    }),
  // Coffers: each cell carries the beams on its +x and +z edges, so neighbours join into a grid (beams
  // over a wall sink into it; the crown hides the missing ones along −x and −z walls). Beams along z are
  // a hair shallower so the crossings don't z-fight.
  ceilingDetail: {
    at: () => true,
    build: (p, d) => {
      const top = d.wallHeight;
      const w = 0.24;
      const edge = d.t / 2;
      p.add(box(d.t, 0.2, w, 0, top - 0.2, edge), 'ceiling', { tint: PLASTER });
      p.add(box(w, 0.19, d.t, edge, top - 0.19, 0), 'ceiling', { tint: PLASTER });
    },
  },
  // Brass chandelier: stem, bowl, ring of candle arms.
  lampFixture: (p, d) => {
    const stem = d.wallHeight - d.lampHeight - 0.05;
    p.add(cyl(0.012, 0.012, stem, 8, 0, 0.05, 0), 'metal', { tint: BRASS });
    p.add(ball(0.08, 0, 0, 0), 'metal', { tint: BRASS });
    p.add(
      new THREE.TorusGeometry(0.28, 0.012, 5, 20).rotateX(Math.PI / 2).translate(0, -0.03, 0),
      'metal',
      { tint: BRASS },
    );
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const x = Math.cos(a) * 0.28;
      const z = Math.sin(a) * 0.28;
      p.add(cyl(0.03, 0.02, 0.02, 8, x, -0.03, z), 'metal', { tint: BRASS });
      p.add(cyl(0.012, 0.012, 0.09, 6, x, -0.01, z), 'ceiling', { tint: 0xf4ecdc });
    }
  },
  props: [
    // Chesterfield sofa.
    (p) => {
      const v = { tint: 0x907878, baseAo: true } as const;
      const feet = { baseAo: true } as const;
      p.add(rbox(1.8, 0.28, 0.86, 0.04, 0, 0.08, 0), 'propA', v);
      for (const x of [-0.56, 0, 0.56])
        p.add(rbox(0.55, 0.13, 0.62, 0.05, x, 0.36, 0.08), 'propA', v);
      p.add(rbox(1.8, 0.5, 0.22, 0.07, 0, 0.36, -0.32), 'propA', v);
      for (const x of [-0.8, 0.8]) p.add(rbox(0.2, 0.3, 0.86, 0.07, x, 0.36, 0), 'propA', v);
      for (const x of [-0.8, 0.8]) {
        for (const z of [-0.36, 0.36]) p.add(cyl(0.03, 0.025, 0.08, 8, x, 0, z), 'propB', feet);
      }
    },
    // Round table under a white cloth, with a candelabra.
    (p) => {
      p.add(cyl(0.74, 0.8, 0.74, 32, 0, 0, 0), 'ceiling', {
        tint: PLASTER,
        baseAo: true,
        uv: [4.8, 0.74],
      });
      p.add(cyl(0.76, 0.76, 0.03, 32, 0, 0.74, 0), 'ceiling', { tint: PLASTER });
      p.add(cyl(0.08, 0.1, 0.03, 16, 0, 0.77, 0), 'metal', { tint: BRASS });
      p.add(cyl(0.015, 0.015, 0.22, 8, 0, 0.8, 0), 'metal', { tint: BRASS });
      p.add(box(0.38, 0.016, 0.016, 0, 1.0, 0), 'metal', { tint: BRASS });
      for (const x of [-0.18, 0, 0.18]) {
        p.add(cyl(0.012, 0.012, 0.08, 8, x, 1.016, 0), 'ceiling', { tint: 0xf4ecdc });
      }
    },
    // Marble planter with a clipped shrub.
    (p) => {
      p.add(rbox(1.3, 0.55, 1.3, 0.03), 'propC', { baseAo: true });
      p.add(box(1.38, 0.05, 1.38, 0, 0.55, 0), 'propC', { tint: 0xd0d0d0 });
      p.add(box(1.24, 0.02, 1.24, 0, 0.58, 0), 'propB', { tint: 0x302018 });
      const leaves = { tint: 0x2e4a28 } as const;
      for (const [x, y, z, r] of [
        [0, 0.86, 0, 0.32],
        [-0.3, 0.76, -0.22, 0.26],
        [0.32, 0.78, -0.18, 0.25],
        [-0.26, 0.76, 0.28, 0.25],
        [0.28, 0.74, 0.3, 0.24],
      ] as const) {
        p.add(ball(r, x, y, z), 'ceiling', leaves);
      }
    },
    // Sideboard with brass pulls and a vase.
    (p) => {
      p.add(rbox(1.7, 0.8, 0.55, 0.02, 0, 0.05, 0), 'propB', { baseAo: true });
      for (const x of [-0.75, 0.75]) {
        for (const z of [-0.22, 0.22])
          p.add(cyl(0.03, 0.02, 0.06, 8, x, 0, z), 'propB', { baseAo: true });
      }
      p.add(box(1.76, 0.04, 0.6, 0, 0.85, 0), 'propB', { tint: 0x8a6a58 });
      for (const x of [-0.56, 0, 0.56]) {
        p.add(box(0.5, 0.22, 0.012, x, 0.58, 0.28), 'propB', { tint: 0xc0a090 });
        p.add(box(0.1, 0.018, 0.02, x, 0.68, 0.29), 'metal', { tint: BRASS });
      }
      p.add(cyl(0.05, 0.09, 0.22, 16, 0.5, 0.89, -0.05), 'propC', { tint: 0x405870 });
    },
  ],
};
