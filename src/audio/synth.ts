// Procedural sounds, synthesised in WebAudio: footsteps (filtered noise transients), radio barks
// (squelch, static and a formant buzz that reads as a muffled voice), combat one-shots (knife, gun,
// glass, stingers) and a room tone. Recordings (sound-bank.ts) replace most of them once loaded; these
// stay as the fallback, and barks and the near-miss whiz have no recording.

import { AUDIO } from '../config/tunables';
import type { VoiceHandle } from './audio-manager';

export type BarkKind = 'suspicious' | 'alert' | 'search' | 'giveUp' | 'chatter';

/** Seconds of shared white noise every sound reads a random slice of. */
const NOISE_S = 2;
export const FOOTSTEP_S = 0.18;
/** Below this a ramp target counts as silent (exponential ramps can't reach 0). */
const SILENT = 0.0001;

/** Per-bark speech pattern: syllable count and rate, base pitch, pitch drift across it, loudness. */
const BARKS: Record<
  BarkKind,
  { syllables: number; rateHz: number; pitchHz: number; contour: number; level: number }
> = {
  suspicious: { syllables: 2, rateHz: 4.5, pitchHz: 150, contour: 0.35, level: 0.8 },
  alert: { syllables: 4, rateHz: 8, pitchHz: 195, contour: 0.15, level: 1 },
  search: { syllables: 3, rateHz: 6, pitchHz: 140, contour: 0, level: 0.8 },
  giveUp: { syllables: 3, rateHz: 4.5, pitchHz: 130, contour: -0.3, level: 0.7 },
  chatter: { syllables: 5, rateHz: 6, pitchHz: 120, contour: -0.1, level: 0.6 },
};
/** Vowel formant pairs (Hz) a syllable picks from. */
const VOWELS: readonly (readonly [number, number])[] = [
  [730, 1090],
  [270, 2290],
  [530, 1840],
  [660, 1720],
  [300, 870],
];
const SQUELCH_S = 0.06;
/** Radio band-pass (Hz). */
const RADIO_LOW_HZ = 350;
const RADIO_HIGH_HZ = 2800;

export function createNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.round(ctx.sampleRate * NOISE_S), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // Fixed LCG so the buffer is the same every run (no Math.random in game code).
  let s = 0x2f6b1d;
  for (let i = 0; i < data.length; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    data[i] = (s / 0xffffffff) * 2 - 1;
  }
  return buffer;
}

function noiseSlice(
  v: VoiceHandle,
  noise: AudioBuffer,
  at: number,
  duration: number,
  random: () => number,
): AudioBufferSourceNode {
  const src = v.ctx.createBufferSource();
  src.buffer = noise;
  src.start(at, random() * (noise.duration - duration), duration);
  v.track(src);
  return src;
}

function filter(ctx: AudioContext, type: BiquadFilterType, hz: number, q = 0.7): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = hz;
  f.Q.value = q;
  return f;
}

/** A heel-toe footstep into `dest`. `run` is heavier and brighter. */
export function footstep(
  v: VoiceHandle,
  dest: AudioNode,
  noise: AudioBuffer,
  level: number,
  run: boolean,
  random: () => number,
): void {
  const { ctx } = v;
  const t = ctx.currentTime;
  const scuff = filter(ctx, 'bandpass', (run ? 700 : 520) * (0.85 + 0.3 * random()), 1.1);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(level, t + 0.004); // heel
  env.gain.exponentialRampToValueAtTime(level * 0.15, t + 0.035);
  env.gain.linearRampToValueAtTime(level * 0.6, t + 0.045); // toe
  env.gain.exponentialRampToValueAtTime(SILENT, t + FOOTSTEP_S);
  noiseSlice(v, noise, t, FOOTSTEP_S, random).connect(scuff).connect(env).connect(dest);

  // A soft low thump gives the step weight.
  const thump = ctx.createOscillator();
  thump.frequency.setValueAtTime(run ? 95 : 80, t);
  thump.frequency.exponentialRampToValueAtTime(45, t + 0.08);
  const thumpEnv = ctx.createGain();
  thumpEnv.gain.setValueAtTime(level * (run ? 0.7 : 0.5), t);
  thumpEnv.gain.exponentialRampToValueAtTime(SILENT, t + 0.09);
  thump.connect(thumpEnv).connect(dest);
  thump.start(t);
  thump.stop(t + 0.1);
  v.track(thump);
}

export function barkDuration(kind: BarkKind): number {
  const b = BARKS[kind];
  return 2 * SQUELCH_S + b.syllables / b.rateHz + 0.1;
}

/** A short radio transmission: squelch, a burst of muffled "speech" over static, squelch. */
export function radioBark(
  v: VoiceHandle,
  dest: AudioNode,
  noise: AudioBuffer,
  kind: BarkKind,
  level: number,
  random: () => number,
): void {
  const { ctx } = v;
  const b = BARKS[kind];
  const t0 = ctx.currentTime;
  const total = barkDuration(kind);
  const speechStart = t0 + SQUELCH_S;
  const speechEnd = speechStart + b.syllables / b.rateHz;
  const out = ctx.createGain();
  out.gain.value = level * b.level;
  const band = filter(ctx, 'highpass', RADIO_LOW_HZ);
  band
    .connect(filter(ctx, 'lowpass', RADIO_HIGH_HZ))
    .connect(out)
    .connect(dest);

  // Squelch at both ends.
  for (const at of [t0, speechEnd]) {
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(0.5, at + 0.005);
    env.gain.exponentialRampToValueAtTime(SILENT, at + SQUELCH_S);
    noiseSlice(v, noise, at, SQUELCH_S, random)
      .connect(filter(ctx, 'highpass', 2500))
      .connect(env)
      .connect(band);
  }

  // Static bed under the speech.
  const hiss = ctx.createGain();
  hiss.gain.setValueAtTime(0, t0);
  hiss.gain.linearRampToValueAtTime(0.06, speechStart);
  hiss.gain.setValueAtTime(0.06, speechEnd);
  hiss.gain.linearRampToValueAtTime(0, t0 + total);
  noiseSlice(v, noise, t0, total, random)
    .connect(filter(ctx, 'bandpass', 1800, 0.6))
    .connect(hiss)
    .connect(band);

  // Speech: a buzzy source through two moving formant filters, one syllable at a time.
  const voice = ctx.createOscillator();
  voice.type = 'sawtooth';
  const f1 = filter(ctx, 'bandpass', 700, 6);
  const f2 = filter(ctx, 'bandpass', 1200, 6);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t0);
  const syl = 1 / b.rateHz;
  for (let k = 0; k < b.syllables; k++) {
    const at = speechStart + k * syl;
    const drift = b.syllables > 1 ? k / (b.syllables - 1) : 0;
    voice.frequency.setValueAtTime(
      b.pitchHz * (1 + b.contour * drift) * (0.92 + 0.16 * random()),
      at,
    );
    const vowel = VOWELS[Math.floor(random() * VOWELS.length)] ?? VOWELS[0]!;
    f1.frequency.setValueAtTime(vowel[0], at);
    f2.frequency.setValueAtTime(vowel[1], at);
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(1, at + 0.02);
    env.gain.setValueAtTime(1, at + syl * 0.6);
    env.gain.linearRampToValueAtTime(0, at + syl * 0.9);
  }
  voice.connect(f1).connect(env);
  voice.connect(f2).connect(env);
  env.connect(band);
  voice.start(speechStart);
  voice.stop(speechEnd);
  v.track(voice);
}

// --- Combat (Phase 4) ---------------------------------------------------------------------------

export type SfxKind =
  'knife' | 'windup' | 'shot' | 'whiz' | 'hurt' | 'throw' | 'shatter' | 'pickup' | 'win' | 'fail';

/** How long each combat sound rings (s), for voice bookkeeping. */
export const SFX_S: Record<SfxKind, number> = {
  knife: 0.3,
  windup: 0.16,
  shot: 0.45,
  whiz: 0.28,
  hurt: 0.35,
  throw: 0.22,
  shatter: 0.5,
  pickup: 0.5,
  win: 1.1,
  fail: 1.4,
};

/** A short enveloped tone into `dest`. */
function tone(
  v: VoiceHandle,
  dest: AudioNode,
  type: OscillatorType,
  hz: number,
  at: number,
  duration: number,
  level: number,
  endHz = hz,
): void {
  const { ctx } = v;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(hz, at);
  if (endHz !== hz) osc.frequency.exponentialRampToValueAtTime(endHz, at + duration);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(level, at + 0.005);
  env.gain.exponentialRampToValueAtTime(SILENT, at + duration);
  osc.connect(env).connect(dest);
  osc.start(at);
  osc.stop(at + duration + 0.01);
  v.track(osc);
}

/** A burst of filtered noise into `dest`, optionally sweeping the filter from `hz` to `endHz`. */
function burst(
  v: VoiceHandle,
  dest: AudioNode,
  noise: AudioBuffer,
  random: () => number,
  type: BiquadFilterType,
  hz: number,
  at: number,
  duration: number,
  level: number,
  endHz = hz,
  q = 0.8,
): void {
  const { ctx } = v;
  const f = filter(ctx, type, hz, q);
  if (endHz !== hz) f.frequency.exponentialRampToValueAtTime(endHz, at + duration);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(level, at + 0.004);
  env.gain.exponentialRampToValueAtTime(SILENT, at + duration);
  noiseSlice(v, noise, at, duration, random).connect(f).connect(env).connect(dest);
}

/** One combat sound into `dest` at loudness `level`. */
export function sfx(
  v: VoiceHandle,
  dest: AudioNode,
  noise: AudioBuffer,
  kind: SfxKind,
  level: number,
  random: () => number,
): void {
  const t = v.ctx.currentTime;
  switch (kind) {
    case 'knife': // a fast swish, then a dull thud
      burst(v, dest, noise, random, 'bandpass', 4000, t, 0.12, level * 0.6, 900, 1.5);
      tone(v, dest, 'sine', 110, t + 0.1, 0.16, level, 50);
      burst(v, dest, noise, random, 'lowpass', 500, t + 0.1, 0.12, level * 0.5);
      break;
    case 'windup': // the hammer cocking: two dry metallic ticks
      for (const dt of [0, 0.07]) {
        burst(v, dest, noise, random, 'highpass', 3500, t + dt, 0.035, level);
        tone(v, dest, 'square', 1900, t + dt, 0.03, level * 0.25);
      }
      break;
    case 'shot': // crack and boom
      burst(v, dest, noise, random, 'lowpass', 6000, t, 0.4, level, 400);
      tone(v, dest, 'sine', 140, t, 0.3, level * 0.9, 40);
      break;
    case 'whiz': // a near miss going past
      burst(v, dest, noise, random, 'bandpass', 2500, t, SFX_S.whiz, level, 900, 4);
      break;
    case 'hurt': // a heavy hit
      tone(v, dest, 'sine', 90, t, 0.3, level, 35);
      burst(v, dest, noise, random, 'lowpass', 1200, t, 0.18, level * 0.8, 300);
      break;
    case 'throw': // the bottle leaving the hand
      burst(v, dest, noise, random, 'bandpass', 700, t, SFX_S.throw, level, 2000, 1.2);
      break;
    case 'shatter': // a crash and glass tinkles
      burst(v, dest, noise, random, 'highpass', 2500, t, 0.25, level);
      for (let k = 0; k < 5; k++) {
        const at = t + 0.03 + random() * 0.3;
        tone(v, dest, 'sine', 3000 + random() * 3500, at, 0.08, level * 0.3);
      }
      break;
    case 'pickup': // a bright two-note chime (player-relevant, so clean and cool)
      tone(v, dest, 'sine', 880, t, 0.3, level);
      tone(v, dest, 'sine', 1320, t + 0.1, 0.38, level * 0.8);
      break;
    case 'win': // rising major arpeggio
      [523, 659, 784, 1047].forEach((hz, k) =>
        tone(v, dest, 'triangle', hz, t + k * 0.12, 0.6, level * 0.7),
      );
      break;
    case 'fail': // falling minor line, low
      [311, 262, 196].forEach((hz, k) =>
        tone(v, dest, 'sawtooth', hz, t + k * 0.28, 0.6, level * 0.35, hz * 0.97),
      );
      break;
  }
}

// --- Beds (Phase 5d) ----------------------------------------------------------------------------

/** A low, steady room tone looped from the shared noise: the ambience until a recording loads. */
export function roomTone(
  ctx: AudioContext,
  dest: AudioNode,
  noise: AudioBuffer,
): AudioScheduledSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const gain = ctx.createGain();
  gain.gain.value = AUDIO.roomToneGain;
  src
    .connect(filter(ctx, 'lowpass', AUDIO.roomToneCutoffHz, 0.5))
    .connect(gain)
    .connect(dest);
  src.start();
  return src;
}
