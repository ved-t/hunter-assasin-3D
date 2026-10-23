// Office: painted walls with a bumper rail, carpet, a suspended ceiling grid, linear pendant lights,
// and desk pods, filing cabinets and print stations for cover.

import { box, cornerAngle, doorCasing, rbox, type PartList, type ThemeKit } from './kit-common';

const FRAME = 0x9ca4ac;
const CHROME = 0xc0c4c8;
const BLACK = 0x18191b;

/** One desk of a back-to-back pod, its user facing −z when s = 1 (so the desk sits on the +z side). */
function desk(p: PartList, s: number): void {
  const ao = { baseAo: true } as const;
  p.add(box(1.7, 0.03, 0.78, 0, 0.72, s * 0.42), 'propA', ao);
  p.add(box(0.42, 0.62, 0.56, 0.6, 0, s * 0.5), 'metal', { tint: 0x55595e, baseAo: true });
  p.add(box(0.36, 0.012, 0.01, 0.6, 0.4, s * 0.785), 'metal', { tint: CHROME });
  // Monitor on a stand, keyboard in front of it.
  const mz = s * 0.2;
  p.add(box(0.2, 0.012, 0.14, -0.15, 0.75, mz), 'metal', { tint: BLACK });
  p.add(box(0.04, 0.1, 0.03, -0.15, 0.76, mz), 'metal', { tint: BLACK });
  p.add(box(0.54, 0.32, 0.025, -0.15, 0.82, mz + s * 0.02), 'metal', { tint: BLACK });
  p.add(box(0.44, 0.015, 0.14, -0.15, 0.75, s * 0.55), 'metal', { tint: 0x2a2b2d });
}

/** A three-drawer cabinet whose drawers face `s` (±z), at x. */
function cabinet(p: PartList, x: number, z: number, s: number): void {
  p.add(box(0.53, 1, 0.6, x, 0, z), 'propB', { tint: 0x9aa2aa, baseAo: true });
  for (let k = 0; k < 3; k++) {
    const y = 0.05 + k * 0.32;
    p.add(box(0.47, 0.29, 0.012, x, y, z + s * 0.306), 'propB', { tint: 0xb0b6bc });
    p.add(box(0.14, 0.02, 0.025, x, y + 0.22, z + s * 0.32), 'metal', { tint: CHROME });
  }
}

export const OFFICE: ThemeKit = {
  fallback: {
    floor: 0x26282b,
    wall: 0x5c574f,
    ceiling: 0x5e6062,
    trim: 0x2a2c2e,
    propA: 0x5a4632,
    propB: 0x3a4450,
    propC: 0x4a4c50,
    metal: 0x60646a,
  },
  floorTint: 0xffffff,
  wall: { tint: 0xd8dce0 },
  ceilingTint: 0xc8c8c8,
  lintelSlot: 'metal',
  strips: [
    { y: 0, height: 0.1, depth: 0.015, slot: 'trim', tint: 0x606060 },
    { y: 0.85, height: 0.12, depth: 0.025, slot: 'trim', tint: 0x808080 },
    { y: 2.94, height: 0.06, depth: 0.03, slot: 'metal', tint: 0xd0d0d0 },
  ],
  corner: (p) => cornerAngle(p, 0.05, 0.008, 0.1, 1.5, 'metal', 0xb0b4b8),
  doorFrame: (p, d) =>
    doorCasing(p, d, {
      width: 0.06,
      depth: 0.02,
      slot: 'metal',
      tint: FRAME,
      lining: { slot: 'metal', tint: FRAME },
    }),
  // Suspended ceiling: T-bars on a 1 m grid (at ±0.5 m in every 2 m cell). Bars along z sit a hair
  // higher so the crossings don't z-fight.
  ceilingDetail: {
    at: () => true,
    build: (p, d) => {
      const top = d.wallHeight;
      for (const k of [-0.25, 0.25]) {
        p.add(box(d.t, 0.025, 0.03, 0, top - 0.025, k * d.t), 'metal', { tint: 0x808080 });
        p.add(box(0.03, 0.022, d.t, k * d.t, top - 0.022, 0), 'metal', { tint: 0x808080 });
      }
    },
  },
  // Linear pendant: dark housing, bright diffuser, two cables.
  lampFixture: (p, d) => {
    p.add(box(1.1, 0.06, 0.16, 0, 0.02, 0), 'metal', { tint: 0x303234 });
    p.add(box(1.06, 0.012, 0.12, 0, 0.008, 0), 'metal', { tint: 0xffffff });
    const cable = d.wallHeight - d.lampHeight - 0.08;
    for (const x of [-0.45, 0.45])
      p.add(box(0.006, cable, 0.006, x, 0.08, 0), 'metal', { tint: BLACK });
  },
  props: [
    // Desk pod: two desks back to back with a fabric privacy screen.
    (p) => {
      desk(p, 1);
      desk(p, -1);
      for (const x of [-0.835, 0.835]) {
        p.add(box(0.03, 0.72, 1.62, x, 0, 0), 'metal', { tint: 0x404448, baseAo: true });
      }
      p.add(rbox(1.66, 1.1, 0.05, 0.015, 0, 0, 0), 'propC', { tint: 0x8890a0, baseAo: true });
    },
    // Filing cabinets, two rows back to back.
    (p) => {
      for (const x of [-0.56, 0, 0.56]) {
        cabinet(p, x, 0.31, 1);
        cabinet(p, x, -0.31, -1);
      }
    },
    // Print station: low cabinet, worktop, printer and paper.
    (p) => {
      p.add(box(1.5, 0.68, 0.7, 0, 0, 0), 'propB', { tint: 0x6c7178, baseAo: true });
      for (const x of [-0.375, 0.375]) {
        p.add(box(0.72, 0.62, 0.012, x, 0.03, 0.356), 'propB', { tint: 0x7c828a });
      }
      p.add(box(1.56, 0.03, 0.74, 0, 0.68, 0), 'propA');
      p.add(rbox(0.62, 0.34, 0.52, 0.03, -0.35, 0.71, 0), 'metal', { tint: 0xd8d6cc });
      p.add(box(0.5, 0.02, 0.3, -0.35, 0.86, 0.3), 'metal', { tint: 0xd8d6cc });
      p.add(box(0.3, 0.14, 0.22, 0.42, 0.71, -0.1), 'metal', { tint: 0xf0f0f0 });
      p.add(box(0.3, 0.1, 0.22, 0.4, 0.85, -0.08), 'metal', { tint: 0xe8e8e8 });
    },
  ],
};
