// Downloads every texture set listed in themes.mjs from the Poly Haven public API (all CC0) into
// art-src/polyhaven/<id>/, with info.json (name, authors, size) for CREDITS.md. Already-downloaded files
// whose md5 matches are skipped, so re-running is cheap.
//   node scripts/assets/fetch-polyhaven.mjs

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CACHE_DIR, MAPS, SOURCE_RES, THEMES } from './themes.mjs';

const API = 'https://api.polyhaven.com';

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

const md5 = (buf) => createHash('md5').update(buf).digest('hex');

async function fetchSet(id) {
  const dir = join(CACHE_DIR, id);
  mkdirSync(dir, { recursive: true });
  const [info, files] = await Promise.all([
    getJson(`${API}/info/${id}`),
    getJson(`${API}/files/${id}`),
  ]);
  writeFileSync(
    join(dir, 'info.json'),
    JSON.stringify(
      {
        id,
        name: info.name,
        authors: Object.keys(info.authors ?? {}),
        dimensionsMm: info.dimensions,
        url: `https://polyhaven.com/a/${id}`,
        licence: 'CC0',
      },
      null,
      2,
    ),
  );
  for (const [name, key] of Object.entries(MAPS)) {
    const file = files[key]?.[SOURCE_RES]?.jpg;
    if (!file) throw new Error(`${id}: no ${SOURCE_RES} jpg for map "${key}"`);
    const out = join(dir, `${name}.jpg`);
    if (existsSync(out) && md5(readFileSync(out)) === file.md5) continue;
    const res = await fetch(file.url);
    if (!res.ok) throw new Error(`${file.url}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (md5(buf) !== file.md5) throw new Error(`${file.url}: md5 mismatch`);
    writeFileSync(out, buf);
    console.log(`  ${id}/${name}.jpg  ${(buf.length / 1024).toFixed(0)} KB`);
  }
}

const ids = [...new Set(Object.values(THEMES).flatMap((t) => Object.values(t).map((s) => s.id)))];
console.log(`Fetching ${ids.length} Poly Haven texture sets into ${CACHE_DIR}/`);
for (const id of ids) {
  try {
    await fetchSet(id);
  } catch (err) {
    console.error(`Failed: ${err.message}`);
    process.exitCode = 1;
  }
}
