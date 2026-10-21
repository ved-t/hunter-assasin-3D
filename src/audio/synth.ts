// Procedural placeholder sounds, synthesised in WebAudio so Phase 3 ships with 0 bytes of audio assets:
// footsteps (filtered noise transients) and radio barks (squelch, static and a formant buzz that reads
// as a muffled voice). Phase 5 replaces these with recorded SFX.

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
