// Prints raw and gzipped sizes of everything in dist/ plus totals and file count.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = 'dist';
const JS_GZIP_BUDGET = 1024 * 1024;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const files = walk(DIST);
let raw = 0;
let gz = 0;
let jsGz = 0;
for (const file of files) {
  const buf = readFileSync(file);
  const g = gzipSync(buf).length;
  raw += buf.length;
  gz += g;
  if (file.endsWith('.js')) jsGz += g;
  console.log(
    `${relative(DIST, file).padEnd(48)} ${kb(buf.length).padStart(10)} ${kb(g).padStart(10)} gz`,
  );
}
console.log('-'.repeat(72));
console.log(
  `files: ${files.length}   total: ${kb(raw)}   gzipped: ${kb(gz)}   JS gzipped: ${kb(jsGz)}`,
);
if (jsGz > JS_GZIP_BUDGET) {
  console.error(`JS gzipped exceeds budget of ${kb(JS_GZIP_BUDGET)}`);
  process.exit(1);
}
