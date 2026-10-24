// Prints raw and gzipped sizes of everything in a build folder (dist/, or the one given:
// node scripts/size-report.mjs dist-crazygames), then checks the download budgets:
//   initial  what a new player downloads before level 1: everything except the lazy packs listed in
//            assets/manifest.json with initial: false (≤ 20 MB, the CrazyGames mobile limit)
//   total    the whole build (≤ 50 MB)
//   files    file count (≤ 1,500)
//   JS       gzipped JavaScript (≤ 1 MB)
// Sizes are raw bytes (KTX2 is already supercompressed; portals count what they host). A pack's `alt`
// files are another format of its `files` (M4A beside OGG); a client fetches one of the two, so only the
// larger set counts toward initial and total (both count toward the file limit). Exits 1 on any overrun.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = process.argv[2] ?? 'dist';
const MANIFEST = join(DIST, 'assets', 'manifest.json');
const MB = 1024 * 1024;
const BUDGET = { initial: 20 * MB, total: 50 * MB, files: 1500, jsGz: 1 * MB };

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const mb = (n) => `${(n / MB).toFixed(2)} MB`;

/** Published paths (as in the manifest) of every pack's files, keyed to the pack. */
const owner = new Map();
const packs = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')).packs : [];
for (const pack of packs) {
  pack.size = { files: 0, alt: 0 };
  for (const f of pack.files) owner.set(f, { pack, set: 'files' });
  for (const f of pack.alt ?? []) owner.set(f, { pack, set: 'alt' });
}
if (!existsSync(MANIFEST)) {
  console.warn(`${MANIFEST} missing: every file counts as initial`);
}

const files = walk(DIST);
let total = 0;
let initial = 0;
let gz = 0;
let jsGz = 0;
for (const file of files) {
  const buf = readFileSync(file);
  const g = gzipSync(buf).length;
  const path = relative(DIST, file).split(sep).join('/');
  total += buf.length;
  gz += g;
  if (file.endsWith('.js')) jsGz += g;
  const own = owner.get(path);
  if (own) own.pack.size[own.set] += buf.length;
  else initial += buf.length;
  console.log(
    `${path.padEnd(48)} ${kb(buf.length).padStart(10)} ${kb(g).padStart(10)} gz${own ? `  (${own.pack.id}${own.set === 'alt' ? ' alt' : ''})` : ''}`,
  );
}
// Count each pack once, in its larger format.
for (const pack of packs) {
  const { files: main, alt } = pack.size;
  total -= Math.min(main, alt);
  if (pack.initial) initial += Math.max(main, alt);
}

console.log('-'.repeat(80));
for (const pack of packs) {
  const { files: main, alt } = pack.size;
  const formats = alt ? `  (${mb(main)} / ${mb(alt)} alt)` : '';
  console.log(
    `${pack.initial ? 'initial' : 'lazy   '} ${pack.id.padEnd(24)} ${mb(Math.max(main, alt)).padStart(10)}${formats}`,
  );
}
console.log(`initial ${mb(initial).padStart(10)}   budget ${mb(BUDGET.initial)}`);
console.log(`total   ${mb(total).padStart(10)}   budget ${mb(BUDGET.total)}   (gzipped ${mb(gz)})`);
console.log(`files   ${String(files.length).padStart(10)}   budget ${BUDGET.files}`);
console.log(`JS gz   ${kb(jsGz).padStart(10)}   budget ${kb(BUDGET.jsGz)}`);

const over = [
  initial > BUDGET.initial && 'initial download',
  total > BUDGET.total && 'total size',
  files.length > BUDGET.files && 'file count',
  jsGz > BUDGET.jsGz && 'gzipped JS',
].filter(Boolean);
if (over.length > 0) {
  console.error(`Over budget: ${over.join(', ')}`);
  process.exit(1);
}
