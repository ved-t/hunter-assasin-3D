// Builds the guard GLB from the Mixamo downloads listed in characters.mjs:
//   1. FBX → GLB with FBX2glTF (from the fbx2gltf devDependency), into art-src/build/characters/.
//   2. Every clip is copied onto the character's own skeleton (bones matched by name), with the hips'
//      motion trimmed per clip (`keep`), and translation/scale tracks on other bones dropped.
//   3. Skinned meshes merged under one skin and joined by material (one draw call per material).
//   4. Prune, dedup, keyframe resample; meshes simplified down to the triangle budget; textures
//      resized and encoded to KTX2 with toktx; meshopt (quantized, reordered, compressed geometry and
//      animation).
// Writes public/assets/characters/guard.glb and the characters pack of the asset manifest.
//   node scripts/assets/build-characters.mjs [config.mjs]   (default ./characters.mjs)
//
// Mixamo files must not be redistributed raw, so art-src/ stays out of git; only the built GLB ships.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRTextureBasisu } from '@gltf-transform/extensions';
import {
  dedup,
  joinPrimitives,
  meshopt,
  prune,
  resample,
  simplify,
  weld,
} from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { updateManifest } from './manifest.mjs';
import { encodeKtx2, findToktx } from './toktx.mjs';

const BUILD_DIR = 'art-src/build/characters';
const configPath = resolve(process.argv[2] ?? 'scripts/assets/characters.mjs');
const { CHARACTER } = await import(pathToFileURL(configPath).href);

function fbx2gltfBinary() {
  const dir = { win32: 'Windows_NT', darwin: 'Darwin', linux: 'Linux' }[process.platform];
  const exe = join(
    'node_modules',
    'fbx2gltf',
    'bin',
    dir ?? '',
    process.platform === 'win32' ? 'FBX2glTF.exe' : 'FBX2glTF',
  );
  if (!dir || !existsSync(exe)) {
    console.error(`FBX2glTF binary not found at ${exe}; run npm install (fbx2gltf devDependency).`);
    process.exit(1);
  }
  return exe;
}

/** A GLB path for `src`: itself if already GLB, else converted from FBX (cached by mtime). */
function toGlb(src) {
  if (!existsSync(src)) {
    console.error(`${src} missing. Download it from Mixamo as described in art-src/README.md.`);
    process.exit(1);
  }
  if (extname(src).toLowerCase() === '.glb') return src;
  mkdirSync(BUILD_DIR, { recursive: true });
  const stem = join(BUILD_DIR, basename(src, extname(src)));
  const out = `${stem}.glb`;
  if (existsSync(out) && statSync(out).mtimeMs >= statSync(src).mtimeMs) return out;
  execFileSync(
    fbx2gltfBinary(),
    ['--binary', '--anim-framerate', 'bake30', '--pbr-metallic-roughness', '-i', src, '-o', stem],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );
  return out;
}

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const isHips = (name) => /hips$/i.test(name.replace(/[^a-z]/gi, ''));

/** Removes the yaw (twist about +Y) from a keyframe quaternion array, in place. */
function stripYaw(q) {
  for (let i = 0; i < q.length; i += 4) {
    const [x, y, z, w] = [q[i], q[i + 1], q[i + 2], q[i + 3]];
    // twist = normalize(0, y, 0, w); result = conj(twist) * q.
    const n = Math.hypot(y, w) || 1;
    const ty = y / n;
    const tw = w / n;
    q[i] = tw * x - ty * z;
    q[i + 1] = tw * y - ty * w;
    q[i + 2] = tw * z + ty * x;
    q[i + 3] = tw * w + ty * y;
  }
}

/** Holds horizontal hips translation at its first keyframe's value (in-place clips). */
function holdHorizontal(t) {
  for (let i = 3; i < t.length; i += 3) {
    t[i] = t[0];
    t[i + 2] = t[2];
  }
}

const doc = await io.read(toGlb(CHARACTER.model));
const root = doc.getRoot();
const buffer = root.listBuffers()[0] ?? doc.createBuffer();
const bones = new Map(root.listNodes().map((n) => [n.getName(), n]));
for (const a of root.listAnimations()) a.dispose(); // the character's own (T-pose) take

// The game's forward is −Z; Mixamo characters face +Z. Wrap the scene in a node that turns it.
if ((CHARACTER.facing ?? '+z') === '+z') {
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  const turn = doc.createNode('facing').setRotation([0, 1, 0, 0]);
  for (const child of scene.listChildren()) {
    scene.removeChild(child);
    turn.addChild(child);
  }
  scene.addChild(turn);
}

for (const [name, clip] of Object.entries(CHARACTER.clips)) {
  const src = await io.read(toGlb(clip.file));
  const anims = src.getRoot().listAnimations();
  const anim = clip.take
    ? anims.find((a) => a.getName() === clip.take)
    : anims.find((a) => a.listChannels().length > 0);
  if (!anim) throw new Error(`${clip.file}: no animation${clip.take ? ` "${clip.take}"` : ''}`);
  const out = doc.createAnimation(name);
  let copied = 0;
  for (const ch of anim.listChannels()) {
    const boneName = ch.getTargetNode()?.getName() ?? '';
    const target = bones.get(boneName);
    const path = ch.getTargetPath();
    if (!target || path === 'scale' || path === 'weights') continue;
    const hips = isHips(boneName);
    if (path === 'translation' && !hips) continue; // bone lengths come from the character
    const s = ch.getSampler();
    const values = s.getOutput().getArray().slice();
    if (hips && path === 'translation' && clip.keep !== 'all') holdHorizontal(values);
    if (hips && path === 'rotation' && clip.keep === 'turn') stripYaw(values);
    const input = doc
      .createAccessor()
      .setType('SCALAR')
      .setArray(s.getInput().getArray().slice())
      .setBuffer(buffer);
    const output = doc
      .createAccessor()
      .setType(s.getOutput().getType())
      .setArray(values)
      .setBuffer(buffer);
    const sampler = doc
      .createAnimationSampler()
      .setInput(input)
      .setOutput(output)
      .setInterpolation(s.getInterpolation());
    out.addSampler(sampler);
    out.addChannel(
      doc.createAnimationChannel().setTargetNode(target).setTargetPath(path).setSampler(sampler),
    );
    copied++;
  }
  if (copied === 0) throw new Error(`${clip.file}: no channel matched a bone of the character`);
  console.log(
    `clip ${name.padEnd(11)} ${String(copied).padStart(3)} tracks  ${basename(clip.file)}`,
  );
}

/**
 * Moves every skinned mesh into the first one, under one skin (joints merged, JOINTS_0 remapped), so
 * the primitives can be joined by material: one draw call per material per guard, not per mesh.
 * Requires the meshes to share a bind pose, which Mixamo exports do; otherwise it leaves them apart.
 */
function mergeSkinnedMeshes() {
  const [base, ...rest] = root.listNodes().filter((n) => n.getMesh() && n.getSkin());
  if (!base || rest.length === 0) return;
  const skin = base.getSkin();
  const joints = skin.listJoints();
  const ibm = Array.from(skin.getInverseBindMatrices().getArray());
  for (const node of rest) {
    const other = node.getSkin();
    const otherIbm = other.getInverseBindMatrices().getArray();
    const remap = [];
    let poseMatches = node.getMatrix().every((v, i) => v === base.getMatrix()[i]);
    const added = [];
    other.listJoints().forEach((j, k) => {
      const at = joints.indexOf(j);
      const m = Array.from(otherIbm.slice(k * 16, k * 16 + 16));
      if (at >= 0) {
        poseMatches &&= m.every((v, e) => Math.abs(v - ibm[at * 16 + e]) < 1e-5);
        remap.push(at);
      } else {
        remap.push(joints.length + added.length);
        added.push([j, m]);
      }
    });
    if (!poseMatches) {
      console.warn(`${node.getName()}: different bind pose, left as its own mesh`);
      continue;
    }
    for (const [j, m] of added) {
      joints.push(j);
      skin.addJoint(j);
      ibm.push(...m);
    }
    for (const prim of node.getMesh().listPrimitives()) {
      const src = prim.getAttribute('JOINTS_0');
      const values = src.getArray().slice();
      for (let i = 0; i < values.length; i++) values[i] = remap[values[i]];
      prim.setAttribute(
        'JOINTS_0',
        doc.createAccessor().setType('VEC4').setArray(values).setBuffer(buffer),
      );
      base.getMesh().addPrimitive(prim);
    }
    node.getMesh().dispose();
    node.dispose();
  }
  skin.setInverseBindMatrices(
    doc.createAccessor().setType('MAT4').setArray(new Float32Array(ibm)).setBuffer(buffer),
  );
  // gltf-transform's join() skips skinned nodes; the primitives now share a node and skin, so
  // joining them directly is safe.
  const mesh = base.getMesh();
  const byMaterial = new Map();
  for (const prim of mesh.listPrimitives()) {
    const group = byMaterial.get(prim.getMaterial()) ?? [];
    byMaterial.set(prim.getMaterial(), [...group, prim]);
  }
  for (const prims of byMaterial.values()) {
    if (prims.length < 2) continue;
    mesh.addPrimitive(joinPrimitives(prims));
    for (const prim of prims) prim.dispose();
  }
}

await doc.transform(dedup());
mergeSkinnedMeshes();
await doc.transform(prune(), dedup(), resample());

/** Triangles drawn per guard (every primitive, as triangle lists). */
const triangles = () =>
  root
    .listMeshes()
    .flatMap((m) => m.listPrimitives())
    .reduce(
      (n, p) => n + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3,
      0,
    );
const sourceTris = triangles();
if (sourceTris > CHARACTER.maxTriangles) {
  const ratio = CHARACTER.maxTriangles / sourceTris;
  await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.01 }));
  console.log(`simplified ${Math.round(sourceTris)} → ${Math.round(triangles())} triangles`);
}

// Textures: resize, then KTX2 (ETC1S colour / UASTC normals), as the theme sheets are.
const kinds = new Map();
for (const m of root.listMaterials()) {
  const mark = (tex, kind) => tex && !kinds.has(tex) && kinds.set(tex, kind);
  mark(m.getNormalTexture(), 'normal');
  mark(m.getBaseColorTexture(), 'albedo');
  mark(m.getEmissiveTexture(), 'albedo');
  mark(m.getMetallicRoughnessTexture(), 'orm');
  mark(m.getOcclusionTexture(), 'orm');
}
if (kinds.size > 0) {
  const toktx = findToktx();
  doc.createExtension(KHRTextureBasisu).setRequired(true);
  let i = 0;
  for (const [tex, kind] of kinds) {
    const png = join(BUILD_DIR, `tex-${i}.png`);
    const ktx = join(BUILD_DIR, `tex-${i}.ktx2`);
    i++;
    await sharp(Buffer.from(tex.getImage()))
      .resize(CHARACTER.maxTexturePx, CHARACTER.maxTexturePx, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .removeAlpha()
      .png()
      .toFile(png);
    encodeKtx2(toktx, kind, png, ktx);
    tex.setImage(new Uint8Array(readFileSync(ktx))).setMimeType('image/ktx2');
  }
}

await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
mkdirSync(dirname(CHARACTER.out), { recursive: true });
await io.write(CHARACTER.out, doc);

const size = statSync(CHARACTER.out).size;
const prims = root.listMeshes().reduce((n, m) => n + m.listPrimitives().length, 0);
console.log(
  `${CHARACTER.out}  ${(size / 1024).toFixed(0)} KB  ${prims} draw call(s) and ` +
    `${Math.round(triangles())} triangles per guard  ${root.listAnimations().length} clips  ` +
    `${kinds.size} textures`,
);
if (size > CHARACTER.budget) {
  console.error(`Over the ${(CHARACTER.budget / 1024 / 1024).toFixed(1)} MB character budget.`);
  process.exit(1);
}

const published = CHARACTER.out.replace(/^public\//, '');
updateManifest(
  (id) => id === 'characters',
  [{ id: 'characters', initial: true, files: [published] }],
);
