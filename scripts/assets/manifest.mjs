// The asset manifest (public/assets/manifest.json) lists every lazily-loadable pack. Each build script
// owns some of its packs and rewrites only those, keeping the others.
//   pack: { id, initial, files: [published paths], alt?: [published paths] }
// `alt` files are an alternative format of `files` (M4A beside OGG): a client downloads one or the
// other, so the size report counts them separately.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export const MANIFEST = 'public/assets/manifest.json';

/** Replace every pack `owns(id)` claims with `packs`, keeping the rest. */
export function updateManifest(owns, packs) {
  const kept = existsSync(MANIFEST)
    ? JSON.parse(readFileSync(MANIFEST, 'utf8')).packs.filter((p) => !owns(p.id))
    : [];
  const all = [...kept, ...packs].sort((a, b) => a.id.localeCompare(b.id));
  writeFileSync(MANIFEST, `${JSON.stringify({ packs: all }, null, 2)}\n`);
}
