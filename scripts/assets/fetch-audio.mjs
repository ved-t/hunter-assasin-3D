// Downloads the CC0 audio sources listed in audio-sources.mjs into art-src/audio/ (gitignored), and
// extracts the Kenney zips. Already-downloaded sources are skipped.
//   node scripts/assets/fetch-audio.mjs

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AUDIO_SRC_DIR, SOURCES } from './audio-sources.mjs';

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** The pack's zip link, scraped from its kenney.nl page. */
async function kenneyZipUrl(name) {
  const page = (await download(`https://kenney.nl/assets/${name}`)).toString('utf8');
  const m = page.match(/https:\/\/kenney\.nl\/media\/pages\/assets\/[^"']+\.zip/);
  if (!m) throw new Error(`no zip link on kenney.nl/assets/${name}`);
  return m[0];
}

/** unzip where there is one (Linux, Git Bash), else bsdtar, which reads zips (Windows 10+, macOS). */
function extract(zip, dir) {
  try {
    execFileSync('unzip', ['-oq', zip, '-d', dir], { stdio: 'ignore' });
  } catch {
    execFileSync('tar', ['-xf', zip, '-C', dir], { stdio: 'inherit' });
  }
}

for (const s of SOURCES) {
  const dir = join(AUDIO_SRC_DIR, s.dir);
  mkdirSync(dir, { recursive: true });
  if (s.kenney) {
    const zip = join(dir, `${s.kenney}.zip`);
    if (existsSync(zip)) continue;
    const url = await kenneyZipUrl(s.kenney);
    console.log(`fetch ${url}`);
    writeFileSync(zip, await download(url));
    extract(zip, dir);
  } else {
    const out = join(dir, s.file);
    if (existsSync(out)) continue;
    console.log(`fetch ${s.url}`);
    writeFileSync(out, await download(s.url));
  }
}
console.log(`audio sources in ${AUDIO_SRC_DIR}/`);
