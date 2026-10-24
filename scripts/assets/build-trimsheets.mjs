// Packs each theme's Poly Haven sets (from fetch-polyhaven.mjs) into one trim sheet per map — albedo,
// normal, and ORM (AO/roughness/metal in R/G/B) — and encodes them to KTX2 with toktx: ETC1S for albedo
// and ORM, UASTC + zstd for normals. Writes public/assets/themes/<theme>/{albedo,normal,orm}.ktx2,
// sheet.json (each slot's UV rect and metres per repeat) and the asset manifest used by size-report.mjs.
//   node scripts/assets/build-trimsheets.mjs [theme…]
//
// Sheet cells hold one tile plus a border copied from the opposite edges (wrapped), so the runtime can
// tile inside a cell with fract() without bleeding into its neighbours. The image is flipped vertically
// before encoding: KTX2 textures are uploaded without flipY, and this keeps +V pointing up the picture,
// which the OpenGL-convention normal maps rely on.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { updateManifest } from './manifest.mjs';
import { encodeKtx2, findToktx } from './toktx.mjs';
import { CACHE_DIR, INITIAL_THEME, MAPS, OUT_DIR, SHEET, SLOTS, THEMES } from './themes.mjs';

const BUILD_DIR = 'art-src/build';

/** UV rect [u, v, w, h] of a slot's tile (without its border), with v measured up from the bottom. */
function slotRect(index) {
  const { cols, rows, cell, gutter } = SHEET;
  const width = cols * cell;
  const height = rows * cell;
  const inner = cell - 2 * gutter;
  const col = index % cols;
  const row = Math.floor(index / cols);
  const top = row * cell + gutter;
  return [
    (col * cell + gutter) / width,
    (height - top - inner) / height,
    inner / width,
    inner / height,
  ];
}

async function buildSheet(theme, map) {
  const { cols, rows, cell, gutter } = SHEET;
  const inner = cell - 2 * gutter;
  const tiles = await Promise.all(
    SLOTS.map(async (slot, i) => {
      const src = join(CACHE_DIR, THEMES[theme][slot].id, `${map}.jpg`);
      if (!existsSync(src)) throw new Error(`${src} missing; run fetch-polyhaven.mjs first`);
      const resized = await sharp(src).removeAlpha().resize(inner, inner).toBuffer();
      const input = await sharp(resized)
        .extend({ top: gutter, bottom: gutter, left: gutter, right: gutter, extendWith: 'repeat' })
        .toBuffer();
      return { input, left: (i % cols) * cell, top: Math.floor(i / cols) * cell };
    }),
  );
  const png = join(BUILD_DIR, `${theme}-${map}.png`);
  const composed = await sharp({
    create: { width: cols * cell, height: rows * cell, channels: 3, background: '#808080' },
  })
    .composite(tiles)
    .png()
    .toBuffer();
  await sharp(composed).flip().png().toFile(png);
  return png;
}

const toktx = findToktx();
const wanted = process.argv.slice(2);
const themes = wanted.length ? wanted : Object.keys(THEMES);
mkdirSync(BUILD_DIR, { recursive: true });

for (const theme of themes) {
  if (!THEMES[theme]) throw new Error(`Unknown theme "${theme}"`);
  const dir = join(OUT_DIR, theme);
  mkdirSync(dir, { recursive: true });
  for (const map of Object.keys(MAPS)) {
    const png = await buildSheet(theme, map);
    const out = join(dir, `${map}.ktx2`);
    encodeKtx2(toktx, map, png, out);
    console.log(`${out.padEnd(44)} ${(readFileSync(out).length / 1024).toFixed(0).padStart(6)} KB`);
  }
  const sheet = {
    slots: Object.fromEntries(
      SLOTS.map((slot, i) => [slot, { rect: slotRect(i), tileM: THEMES[theme][slot].tileM }]),
    ),
  };
  writeFileSync(join(dir, 'sheet.json'), `${JSON.stringify(sheet, null, 2)}\n`);
}

// The manifest lists every theme pack (not only the ones rebuilt now) for the size report.
const packs = Object.keys(THEMES).map((theme) => ({
  id: `theme-${theme}`,
  initial: theme === INITIAL_THEME,
  files: [...Object.keys(MAPS).map((m) => `${m}.ktx2`), 'sheet.json'].map(
    (f) => `assets/themes/${theme}/${f}`,
  ),
}));
updateManifest((id) => id.startsWith('theme-'), packs);
