// Game sound wiring: guard footsteps, radio barks and gunfire (positional, muffled by walls, audible
// only within path range so what you hear matches what the minimap may show), idle patrol chatter, the
// player's own footsteps, the player's combat sounds (knife, hits, bottle, pickup, stingers), and the
// music and ambience beds. Positional sim events are queued and played on the next rendered frame.
// Each sound plays its recording once that has loaded (sound-bank.ts) and the synth until then; radio
// barks and the near-miss whiz are always synthesised.

import type { GuardState } from '../ai/guard-fsm';
import type { GuardSystem } from '../ai/guards';
import type { QualityTier } from '../config/quality';
import { AUDIO, PLAYER_HEARING } from '../config/tunables';
import type { Vec2 } from '../level/collision';
import type { Grid } from '../level/grid';
import type { Theme } from '../level/types';
import { hasLineOfSight } from '../nav/los';
import { createSoundField, type DistanceField } from '../nav/sound';
import type { Emitter } from '../core/events';
import type { MissionEvents } from '../mission/mission';
import type { PlayerGait } from '../player/controller';
import { AudioManager, type VoiceHandle } from './audio-manager';
import { LoopPlayer } from './loops';
import { ambienceKey, preferredFormat, SoundBank, type SoundKey } from './sound-bank';
import { Spatial, type ListenerPose } from './spatial';
import {
  barkDuration,
  createNoiseBuffer,
  footstep,
  FOOTSTEP_S,
  radioBark,
  roomTone,
  sfx,
  SFX_S,
  type BarkKind,
  type SfxKind,
} from './synth';

/** Combat sounds that come from a place in the world. */
type PositionalSfx = keyof typeof AUDIO.sfxRangeM;

type Pending = { x: number; z: number } & (
  | { kind: 'step'; run: boolean }
  | { kind: 'bark'; bark: BarkKind }
  | { kind: 'sfx'; sfx: PositionalSfx }
);

/** Which beds play: the menu track, or a level's track and its theme's ambience. */
export type AudioScene = { kind: 'menu' } | { kind: 'level'; theme: Theme };

/** Where a voice's sound goes: the voice output itself, or a positional chain built on it. */
type Route = ((v: VoiceHandle) => AudioNode) | null;

/** Most sim events kept between two rendered frames; extras are dropped. */
const MAX_PENDING = 32;
const MAX_RANGE = Math.max(
  AUDIO.barkRangeM,
  PLAYER_HEARING.runRangeM,
  ...Object.values(AUDIO.sfxRangeM),
);

/** The recording that replaces a synth one-shot, if there is one. */
export const SAMPLE_FOR: Partial<Record<SfxKind, SoundKey>> = {
  knife: 'knife',
  windup: 'windup',
  shot: 'shot',
  hurt: 'hurt',
  throw: 'throw',
  shatter: 'shatter',
  pickup: 'pickup',
  win: 'win',
  fail: 'fail',
};

/** The bark a state change calls for, if any. */
export function barkFor(from: GuardState, to: GuardState): BarkKind | null {
  if (to === 'suspicious') return 'suspicious';
  if (to === 'alert') return 'alert';
  if (to === 'search') return 'search';
  if (from === 'search' && to === 'patrol') return 'giveUp';
  return null;
}

/** Plays a recording into `dest` at `level`, pitched by `rate`. */
function playSample(
  v: VoiceHandle,
  dest: AudioNode,
  buffer: AudioBuffer,
  level: number,
  rate: number,
): void {
  const src = v.ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = rate;
  const gain = v.ctx.createGain();
  gain.gain.value = level;
  src.connect(gain).connect(dest);
  src.start();
  v.track(src);
}

/** What chatter reads from each guard (Guard satisfies this). */
export interface ChatterGuard {
  readonly pos: Vec2;
  readonly state: GuardState;
}

export class GameAudio {
  readonly manager = new AudioManager();
  readonly bank: SoundBank;
  private readonly spatial = new Spatial();
  private readonly music = new LoopPlayer();
  private readonly ambience: LoopPlayer;
  private field: DistanceField;
  private noise: AudioBuffer | null = null;
  private readonly pending: Pending[] = [];
  private chatter: number[] = [];

  constructor(
    private grid: Grid,
    private readonly random: () => number,
  ) {
    this.field = createSoundField(grid);
    this.bank = new SoundBank(
      preferredFormat((type) => document.createElement('audio').canPlayType(type)),
    );
    // Until a theme's ambience has loaded (or if it has none), a low procedural room tone stands in.
    this.ambience = new LoopPlayer((ctx, out) => roomTone(ctx, out, this.noise as AudioBuffer));
    this.manager.onReady = (ctx) => {
      this.noise = createNoiseBuffer(ctx);
      this.bank.setContext(ctx);
    };
    // Shared one-shots and both music tracks are part of the first download.
    for (const key of ['step', 'musicMenu', 'musicLevel'] as const) void this.bank.loadFor(key);
  }

  /** A new level: path distance and occlusion use its grid. Call attach() for its first attempt. */
  setGrid(grid: Grid): void {
    this.grid = grid;
    this.field = createSoundField(grid);
  }

  /** Switch the music and ambience beds (they crossfade). */
  setScene(scene: AudioScene): void {
    if (scene.kind === 'menu') {
      this.music.want('musicMenu', AUDIO.musicGain.menu);
      this.ambience.want(null, 0);
      return;
    }
    const amb = ambienceKey(scene.theme);
    this.music.want('musicLevel', AUDIO.musicGain.level);
    this.ambience.want(amb, AUDIO.ambienceGain);
    void this.bank.loadFor(amb);
  }

  /** Fetch a theme's ambience ahead of time (e.g. the next level's). */
  prefetchTheme(theme: Theme): void {
    void this.bank.loadFor(ambienceKey(theme));
  }

  /** Listen to a new attempt's guards and mission events; drops anything still queued. */
  attach(guards: GuardSystem, mission: Emitter<MissionEvents>): void {
    this.pending.length = 0;
    const at = (kind: PositionalSfx, p: Vec2) =>
      this.queue({ kind: 'sfx', sfx: kind, x: p.x, z: p.z });
    guards.events.on('windup', (e) => at('windup', e.guard.pos));
    guards.events.on('shot', (e) => {
      at('shot', e.guard.pos);
      if (!e.hit) this.flat('whiz');
    });
    mission.on('hit', () => this.flat('hurt'));
    mission.on('kill', () => this.flat('knife'));
    mission.on('wound', () => this.flat('knife'));
    mission.on('throw', () => this.flat('throw'));
    mission.on('shatter', (e) => at('shatter', e.at));
    mission.on('pickup', () => this.flat('pickup'));
    mission.on('end', (e) => this.flat(e.outcome === 'won' ? 'win' : 'fail'));
    this.chatter = guards.guards.map(() => this.chatterDelay());
    guards.events.on('footstep', (e) =>
      this.queue({ kind: 'step', run: e.gait === 'run', x: e.guard.pos.x, z: e.guard.pos.z }),
    );
    guards.events.on('stateChange', (e) => {
      const bark = barkFor(e.from, e.to);
      if (bark) this.queue({ kind: 'bark', bark, x: e.guard.pos.x, z: e.guard.pos.z });
    });
  }

  applyTier(tier: QualityTier): void {
    // HRTF convolution is the expensive part of positional audio; plain panning on the low tier.
    this.spatial.panningModel = tier === 'low' ? 'equalpower' : 'HRTF';
  }

  /** The player's own footstep (not positional). */
  playerStep(gait: PlayerGait): void {
    if (gait === 'still') return;
    this.step(AUDIO.playerStepGain[gait], gait === 'run', null);
  }

  /** A sound of the player's own (not positional), played at once. */
  private flat(kind: SfxKind): void {
    this.oneShot(kind, AUDIO.sfxGain[kind], null);
  }

  /** One footstep: the recording if loaded, else the synth. */
  private step(level: number, run: boolean, route: Route): void {
    const { noise } = this;
    if (!noise) return;
    const buffer = this.bank.get('step', this.random());
    if (buffer) {
      const rate = this.rate() * (run ? AUDIO.runStepRate : 1);
      this.manager.play(level, buffer.duration / rate, (v) =>
        playSample(v, route ? route(v) : v.out, buffer, level, rate),
      );
      return;
    }
    this.manager.play(level, FOOTSTEP_S, (v) =>
      footstep(v, route ? route(v) : v.out, noise, level, run, this.random),
    );
  }

  /** A combat one-shot: the recording if loaded, else the synth. */
  private oneShot(kind: SfxKind, level: number, route: Route): void {
    const { noise } = this;
    if (!noise) return;
    const key = SAMPLE_FOR[kind];
    const buffer = key ? this.bank.get(key, this.random()) : null;
    if (buffer) {
      // Stingers keep their pitch; everything else varies a little so repeats don't sound copied.
      const rate = kind === 'win' || kind === 'fail' ? 1 : this.rate();
      this.manager.play(level, buffer.duration / rate, (v) =>
        playSample(v, route ? route(v) : v.out, buffer, level, rate),
      );
      return;
    }
    this.manager.play(level, SFX_S[kind], (v) =>
      sfx(v, route ? route(v) : v.out, noise, kind, level, this.random),
    );
  }

  /** Playback rate for a one-shot: 1 ± the jitter. */
  private rate(): number {
    return 1 + (this.random() * 2 - 1) * AUDIO.sampleRateJitter;
  }

  /** Once per rendered frame: move the listener, run the beds and chatter timers, play queued sounds. */
  update(dt: number, listener: ListenerPose, guards: readonly ChatterGuard[]): void {
    const { ctx, music, sfx: sfxBus } = this.manager;
    const { noise } = this;
    if (!ctx || !noise || !this.manager.ready) {
      this.pending.length = 0;
      return;
    }
    this.spatial.updateListener(ctx, listener);
    if (music) this.music.update(ctx, music, this.bank, this.random);
    if (sfxBus) this.ambience.update(ctx, sfxBus, this.bank, this.random);

    for (let i = 0; i < guards.length; i++) {
      const g = guards[i] as ChatterGuard;
      if (g.state !== 'patrol') continue;
      const left = (this.chatter[i] ?? 0) - dt;
      this.chatter[i] = left > 0 ? left : this.chatterDelay();
      if (left <= 0) this.queue({ kind: 'bark', bark: 'chatter', x: g.pos.x, z: g.pos.z });
    }
    if (this.pending.length === 0) return;

    this.field.flood(listener.x, listener.z, MAX_RANGE);
    for (const p of this.pending) {
      const range =
        p.kind === 'sfx'
          ? AUDIO.sfxRangeM[p.sfx]
          : p.kind === 'bark'
            ? AUDIO.barkRangeM
            : p.run
              ? PLAYER_HEARING.runRangeM
              : PLAYER_HEARING.walkRangeM;
      const d = this.field.at(p.x, p.z);
      if (!(d <= range)) continue;
      const falloff = 1 - d / range;
      const clear = hasLineOfSight(
        this.grid,
        listener.x,
        AUDIO.earHeight,
        listener.z,
        p.x,
        AUDIO.sourceHeight,
        p.z,
      );
      const cutoff = clear ? AUDIO.openCutoffHz : AUDIO.occludedCutoffHz;
      const y = AUDIO.sourceHeight;
      const at = (v: VoiceHandle) => this.spatial.chain(v, p.x, y, p.z, cutoff);
      if (p.kind === 'step') {
        this.step(AUDIO.guardStepGain[p.run ? 'run' : 'walk'] * falloff, p.run, at);
      } else if (p.kind === 'sfx') {
        this.oneShot(p.sfx, AUDIO.sfxGain[p.sfx] * falloff, at);
      } else {
        const level = AUDIO.barkGain * falloff;
        const bark = p.bark;
        this.manager.play(level, barkDuration(bark), (v) =>
          radioBark(v, at(v), noise, bark, level, this.random),
        );
      }
    }
    this.pending.length = 0;
  }

  private queue(p: Pending): void {
    if (this.pending.length < MAX_PENDING) this.pending.push(p);
  }

  private chatterDelay(): number {
    const [min, max] = AUDIO.chatterIntervalS;
    return min + (max - min) * this.random();
  }
}
