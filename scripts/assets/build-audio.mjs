// Encodes the bank sounds listed in audio-sources.mjs (from fetch-audio.mjs) with ffmpeg-static into
// OGG Vorbis and AAC M4A (Safari can't decode Vorbis everywhere), and writes bank.json (what the runtime
// can load: each sound's pack and variant count) and the audio packs of the asset manifest.
//   SFX: mono, leading silence cut, peak-normalised to -1 dBFS, Vorbis q3 / AAC 64 kbps.
//   Music and ambience: stereo, loudness-normalised, 96 kbps. Ambience with `loopS` is cut to that
//   length and its tail crossfaded into its head, so the loop point is seamless.
//   node scripts/assets/build-audio.mjs

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { AUDIO_OUT_DIR, AUDIO_SRC_DIR, BANK, INITIAL_PACKS } from './audio-sources.mjs';
import { updateManifest } from './manifest.mjs';

const FORMATS = {
  sfx: {
    ogg: ['-ac', '1', '-c:a', 'libvorbis', '-q:a', '3'],
    m4a: ['-ac', '1', '-c:a', 'aac', '-b:a', '64k'],
  },
  music: {
    ogg: ['-ac', '2', '-c:a', 'libvorbis', '-b:a', '96k'],
    m4a: ['-ac', '2', '-c:a', 'aac', '-b:a', '96k'],
  },
};
FORMATS.ambience = FORMATS.music;
/** Integrated loudness (LUFS) for music and ambience; runtime gains set the mix on top. */
const LOUDNESS_LUFS = -18;
const SFX_PEAK_DB = -1;
/** Crossfade length at an ambience loop point (s). */
const LOOP_XFADE_S = 3;

if (!ffmpegPath || !existsSync(ffmpegPath)) {
  console.error('ffmpeg-static has no binary for this platform; run npm install again.');
  process.exit(1);
}

const ffmpeg = (args) =>
  execFileSync(ffmpegPath, ['-hide_banner', '-y', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });

/** ffmpeg input and filter arguments for one source of `sound`. */
function filterFor(sound, src) {
  if (sound.kind === 'sfx') {
    const pre = [
      'silenceremove=start_periods=1:start_threshold=-50dB',
      sound.trimS && `atrim=0:${sound.trimS},afade=t=out:st=${sound.trimS - 0.2}:d=0.2`,
    ]
      .filter(Boolean)
      .join(',');
    const report = spawnStderr(['-i', src, '-af', `${pre},volumedetect`, '-f', 'null', '-']);
    const m = report.match(/max_volume:s*(-?[d.]+) dB/);
    const gain = m ? SFX_PEAK_DB - Number(m[1]) : 0;
    return ['-i', src, '-af', `${pre},volume=${gain.toFixed(2)}dB`];
  }
  const norm = `loudnorm=I=${LOUDNESS_LUFS}:TP=-1.5:LRA=11`;
  if (!sound.loopS) return ['-i', src, '-af', norm];
  // The tail just past the loop point is read as a second input (one input split in two stalls the
  // graph) and faded out over the faded-in head.
  const n = sound.loopS;
  const x = LOOP_XFADE_S;
  return [
    '-i',
    src,
    '-ss',
    String(n),
    '-t',
    String(x),
    '-i',
    src,
    '-filter_complex',
    `[0:a]atrim=0:${n},afade=t=in:d=${x}[head];` +
      `[1:a]asetpts=PTS-STARTPTS,afade=t=out:d=${x}[tail];` +
      `[head][tail]amix=inputs=2:duration=first:normalize=0,${norm}[out]`,
    '-map',
    '[out]',
  ];
}

/** Runs ffmpeg and returns its stderr (where its analysis filters report). */
function spawnStderr(args) {
  const r = spawnSync(ffmpegPath, ['-hide_banner', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg ${args.join(' ')}\n${r.stderr}`);
  return r.stderr;
}

rmSync(AUDIO_OUT_DIR, { recursive: true, force: true });
mkdirSync(AUDIO_OUT_DIR, { recursive: true });
const bank = { sounds: {} };
const packs = new Map();
for (const [key, sound] of Object.entries(BANK)) {
  const dir = join(AUDIO_OUT_DIR, sound.pack);
  mkdirSync(dir, { recursive: true });
  const pack = packs.get(sound.pack) ?? { ogg: [], m4a: [] };
  packs.set(sound.pack, pack);
  sound.files.forEach((file, i) => {
    const src = join(AUDIO_SRC_DIR, file);
    if (!existsSync(src)) throw new Error(`${src} missing; run fetch-audio.mjs first`);
    const input = filterFor(sound, src);
    for (const [ext, codec] of Object.entries(FORMATS[sound.kind])) {
      const name = `${key}-${i}.${ext}`;
      const out = join(dir, name);
      const container = ext === 'm4a' ? ['-movflags', '+faststart'] : [];
      ffmpeg([...input, '-ar', '44100', ...codec, ...container, '-vn', '-map_metadata', '-1', out]);
      pack[ext].push(`assets/audio/${sound.pack}/${name}`);
      console.log(`${out.padEnd(52)} ${(statSync(out).size / 1024).toFixed(1).padStart(8)} KB`);
    }
  });
  bank.sounds[key] = { pack: sound.pack, variants: sound.files.length };
}
writeFileSync(join(AUDIO_OUT_DIR, 'bank.json'), `${JSON.stringify(bank, null, 2)}\n`);

updateManifest(
  (id) => id.startsWith('audio-'),
  [...packs].map(([id, files]) => ({
    id: `audio-${id}`,
    initial: INITIAL_PACKS.includes(id),
    files: files.ogg,
    alt: files.m4a,
  })),
);
