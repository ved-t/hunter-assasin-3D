// One WebAudio context for the game: created on the first user gesture (browsers keep audio locked until
// then), suspended while the host pauses us (tab hidden, ads), and a cap on simultaneous voices. Two
// buses under the master: effects (every one-shot and the ambience bed) and music.

import { AUDIO } from '../config/tunables';

interface Voice {
  out: GainNode;
  level: number;
  end: number;
  sources: AudioScheduledSourceNode[];
}

/** A one-shot sound being built: connect its graph to `out`, register its sources, then start them. */
export interface VoiceHandle {
  ctx: AudioContext;
  /** Connect the sound's output here. */
  out: GainNode;
  /** Register a scheduled source so stealing the voice stops it. */
  track(source: AudioScheduledSourceNode): void;
}

export class AudioManager {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** Every one-shot and the ambience go through this bus. */
  sfx: GainNode | null = null;
  music: GainNode | null = null;
  private volume = { master: 1, sfx: 1, music: 1 };
  private readonly voices: Voice[] = [];
  private hostPaused = false;
  /** The portal muted the game (its own audio setting); separate from the player's sliders. */
  private hostMuted = false;
  /** Called once, right after the context is created (build shared buffers here). */
  onReady: ((ctx: AudioContext) => void) | null = null;

  /** Call from inside a user gesture (tap, click, key). Safe to call repeatedly. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.sfx = this.ctx.createGain();
      this.sfx.connect(this.master);
      this.music = this.ctx.createGain();
      this.music.connect(this.master);
      this.applyVolume();
      this.onReady?.(this.ctx);
    }
    if (!this.hostPaused && this.ctx.state !== 'running') void this.ctx.resume();
  }

  /** Player volume sliders, 0..1. Safe before the context exists. */
  setVolume(master: number, sfx: number, music: number): void {
    this.volume = { master, sfx, music };
    this.applyVolume();
  }

  /** Portal audio setting: silence everything while muted, whatever the sliders say. */
  setHostMuted(muted: boolean): void {
    this.hostMuted = muted;
    this.applyVolume();
  }

  private applyVolume(): void {
    if (!this.master || !this.sfx || !this.music) return;
    this.master.gain.value = this.hostMuted ? 0 : AUDIO.masterGain * this.volume.master;
    this.sfx.gain.value = this.volume.sfx;
    this.music.gain.value = this.volume.music;
  }

  get ready(): boolean {
    return this.ctx?.state === 'running';
  }

  /** Host pause (tab hidden, ad, backgrounded): silence everything. */
  suspend(): void {
    this.hostPaused = true;
    void this.ctx?.suspend();
  }

  resume(): void {
    this.hostPaused = false;
    if (this.ctx && this.ctx.state !== 'closed') void this.ctx.resume();
  }

  /**
   * Starts a voice of the given loudness lasting `duration` seconds. Returns false if the context
   * isn't running or every voice is louder. `build` wires the sound into the handle's output.
   */
  play(level: number, duration: number, build: (v: VoiceHandle) => void): boolean {
    const { ctx, sfx } = this;
    if (!ctx || !sfx || ctx.state !== 'running' || level <= 0) return false;
    const now = ctx.currentTime;
    for (let i = this.voices.length - 1; i >= 0; i--) {
      const done = this.voices[i] as Voice;
      if (done.end > now) continue;
      done.out.disconnect(); // let the finished graph be collected
      this.voices.splice(i, 1);
    }
    if (this.voices.length >= AUDIO.maxVoices) {
      let quietest = 0;
      for (let i = 1; i < this.voices.length; i++) {
        if ((this.voices[i] as Voice).level < (this.voices[quietest] as Voice).level) quietest = i;
      }
      const victim = this.voices[quietest] as Voice;
      if (victim.level >= level) return false;
      this.stop(victim, now);
      this.voices.splice(quietest, 1);
    }
    const out = ctx.createGain();
    out.connect(sfx);
    const voice: Voice = { out, level, end: now + duration, sources: [] };
    build({ ctx, out, track: (s) => voice.sources.push(s) });
    this.voices.push(voice);
    return true;
  }

  private stop(v: Voice, now: number): void {
    v.out.gain.setTargetAtTime(0, now, AUDIO.stealFadeS / 3);
    for (const s of v.sources) {
      try {
        s.stop(now + AUDIO.stealFadeS);
      } catch {
        // already stopped
      }
    }
    const last = v.sources[v.sources.length - 1];
    if (last) last.onended = () => v.out.disconnect();
  }
}
