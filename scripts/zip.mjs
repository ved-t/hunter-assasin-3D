// Zips a target build for upload: node scripts/zip.mjs <target>  (reads dist-<target>/, writes
// release/shadow-hunter-<target>-<version>.zip with index.html at the zip root, as portals expect).
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { zipSync } from 'fflate';

const target = process.argv[2];
if (!target) {
  console.error('usage: node scripts/zip.mjs <target>');
  process.exit(1);
}
const dir = `dist-${target}`;
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));

function walk(d) {
  return readdirSync(d).flatMap((name) => {
    const path = join(d, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const entries = {};
for (const file of walk(dir)) {
  // KTX2, audio and images are already compressed; store them rather than deflate again.
  const level = /\.(ktx2|ogg|m4a|png|jpe?g|webp|glb)$/i.test(file) ? 0 : 9;
  entries[relative(dir, file).split(sep).join('/')] = [readFileSync(file), { level }];
}
mkdirSync('release', { recursive: true });
const out = join('release', `shadow-hunter-${target}-${version}.zip`);
const zip = zipSync(entries);
writeFileSync(out, zip);
console.log(`${out}  ${(zip.length / 1024 / 1024).toFixed(2)} MB  ${Object.keys(entries).length} files`);
