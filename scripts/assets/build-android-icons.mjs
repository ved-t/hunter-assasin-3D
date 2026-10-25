// Android launcher icons from one square source: node scripts/assets/build-android-icons.mjs
// Reads art-src/icon.png (1024×1024, full-bleed artwork, no transparency needed) and writes:
//   mipmap-*/ic_launcher.png          legacy square icon (Android 7 and older launchers)
//   mipmap-*/ic_launcher_round.png    legacy round icon
//   mipmap-*/ic_launcher_foreground.png  adaptive-icon layer (Android 8+), art in the 66/108 safe zone
//   release/play-icon-512.png         the Play Console store-listing icon
// The adaptive background is the game's near-black (values/ic_launcher_background.xml).
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const SRC = 'art-src/icon.png';
const RES = 'android/app/src/main/res';
/** Launcher icon size in px per density (48 dp); adaptive layers are 108 dp. */
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

if (!existsSync(SRC)) {
  console.log(`${SRC} not found: keeping the current launcher icons. Add a 1024×1024 PNG there and rerun.`);
  process.exit(0);
}
const meta = await sharp(SRC).metadata();
if (meta.width !== meta.height || meta.width < 512) {
  console.error(`${SRC} must be square and at least 512 px (got ${meta.width}×${meta.height}).`);
  process.exit(1);
}

const circle = (size) =>
  Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`);

for (const [name, scale] of Object.entries(DENSITIES)) {
  const dir = join(RES, `mipmap-${name}`);
  const icon = Math.round(48 * scale);
  const layer = Math.round(108 * scale);
  const art = Math.round(layer * (66 / 108));
  await sharp(SRC).resize(icon, icon).png().toFile(join(dir, 'ic_launcher.png'));
  await sharp(SRC)
    .resize(icon, icon)
    .composite([{ input: circle(icon), blend: 'dest-in' }])
    .png()
    .toFile(join(dir, 'ic_launcher_round.png'));
  const pad = Math.round((layer - art) / 2);
  await sharp(SRC)
    .resize(art, art)
    .extend({ top: pad, bottom: layer - art - pad, left: pad, right: layer - art - pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(join(dir, 'ic_launcher_foreground.png'));
}
mkdirSync('release', { recursive: true });
await sharp(SRC).resize(512, 512).png().toFile('release/play-icon-512.png');
console.log('Android launcher icons and release/play-icon-512.png written.');
