// A looping bed (the music track, or the theme's ambience): plays whichever sound is wanted, crossfading
// on a change, and swaps a fallback for the recording once that has loaded. The fallback (procedural
// room tone for ambience) keeps the bed from going silent while files load or when a theme has none.

import { AUDIO } from '../config/tunables';
import type { SoundBank, SoundKey } from './sound-bank';

/** Builds a looping fallback into `out`; returns its source so it can be stopped. */
export type LoopFallback = (ctx: AudioContext, out: AudioNode) => AudioScheduledSourceNode;

interface Playing {
  key: SoundKey | null;
  /** True while the fallback stands in for `key`. */
  fallback: boolean;
  src: AudioScheduledSourceNode;
  gain: GainNode;
}

export class LoopPlayer {
  private wanted: SoundKey | null = null;
  private level = 0;
  private playing: Playing | null = null;

  constructor(private readonly fallback: LoopFallback | null = null) {}

  /** What should play, at what gain (0..1 before the bus volume); null for silence. */
  want(key: SoundKey | null, level: number): void {
    this.wanted = key;
    this.level = level;
  }

  /** Per frame while the context runs: start, swap or fade as needed. */
  update(ctx: AudioContext, bus: AudioNode, bank: SoundBank, random: () => number): void {
    const p = this.playing;
    const ready = this.wanted !== null && bank.has(this.wanted);
    const useFallback = this.wanted !== null && !ready && this.fallback !== null;
    const audible = ready || useFallback;
    if (p && p.key === this.wanted && p.fallback === !ready && audible) {
      // Same bed: just follow level changes.
      p.gain.gain.setTargetAtTime(this.level, ctx.currentTime, AUDIO.loopFadeS / 3);
      return;
    }
    if (p) this.fadeOut(ctx, p);
    this.playing = null;
    if (!audible || this.wanted === null) return;

    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(this.level, ctx.currentTime, AUDIO.loopFadeS / 3);
    gain.connect(bus);
    let src: AudioScheduledSourceNode;
    const buffer = ready ? bank.get(this.wanted, random()) : null;
    if (buffer) {
      const s = ctx.createBufferSource();
      s.buffer = buffer;
      s.loop = true;
      s.connect(gain);
      s.start();
      src = s;
    } else {
      src = (this.fallback as LoopFallback)(ctx, gain);
    }
    this.playing = { key: this.wanted, fallback: !buffer, src, gain };
  }

  /** Cut everything at once (context lost or closing). */
  stop(): void {
    try {
      this.playing?.src.stop();
    } catch {
      // never started
    }
    this.playing?.gain.disconnect();
    this.playing = null;
  }

  private fadeOut(ctx: AudioContext, p: Playing): void {
    const now = ctx.currentTime;
    p.gain.gain.cancelScheduledValues(now);
    p.gain.gain.setTargetAtTime(0, now, AUDIO.loopFadeS / 3);
    try {
      p.src.stop(now + AUDIO.loopFadeS * 1.5);
    } catch {
      // already stopped
    }
    p.src.onended = () => p.gain.disconnect();
  }
}
