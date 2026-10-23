// Game sound wiring: guard footsteps, radio barks and gunfire (positional, muffled by walls, audible
// only within path range so what you hear matches what the minimap may show), idle patrol chatter, the
// player's own footsteps, and the player's combat sounds (knife, hits, bottle, pickup, stingers).
// Positional sim events are queued and played on the next rendered frame.

import type { GuardState } from '../ai/guard-fsm';
import type { GuardSystem } from '../ai/guards';
import type { QualityTier } from '../config/quality';
import { AUDIO, PLAYER_HEARING } from '../config/tunables';
import type { Vec2 } from '../level/collision';
import type { Grid } from '../level/grid';
import { hasLineOfSight } from '../nav/los';
import { createSoundField, type DistanceField } from '../nav/sound';
import type { Emitter } from '../core/events';
import type { MissionEvents } from '../mission/mission';
import type { PlayerGait } from '../player/controller';
import { AudioManager } from './audio-manager';
import { Spatial, type ListenerPose } from './spatial';
import {
  barkDuration,
  createNoiseBuffer,
  footstep,
  FOOTSTEP_S,
  radioBark,
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

/** Most sim events kept between two rendered frames; extras are dropped. */
const MAX_PENDING = 32;
const MAX_RANGE = Math.max(
  AUDIO.barkRangeM,
  PLAYER_HEARING.runRangeM,
  ...Object.values(AUDIO.sfxRangeM),
);

/** The bark a state change calls for, if any. */
export function barkFor(from: GuardState, to: GuardState): BarkKind | null {
  if (to === 'suspicious') return 'suspicious';
  if (to === 'alert') return 'alert';
  if (to === 'search') return 'search';
  if (from === 'search' && to === 'patrol') return 'giveUp';
  return null;
}

/** What chatter reads from each guard (Guard satisfies this). */
export interface ChatterGuard {
  readonly pos: Vec2;
  readonly state: GuardState;
}

export class GameAudio {
  readonly manager = new AudioManager();
  private readonly spatial = new Spatial();
  private field: DistanceField;
  private noise: AudioBuffer | null = null;
  private readonly pending: Pending[] = [];
  private chatter: number[] = [];

  constructor(
    private grid: Grid,
    private readonly random: () => number,
  ) {
    this.field = createSoundField(grid);
    this.manager.onReady = (ctx) => (this.noise = createNoiseBuffer(ctx));
  }

  /** A new level: path distance and occlusion use its grid. Call attach() for its first attempt. */
  setGrid(grid: Grid): void {
    this.grid = grid;
    this.field = createSoundField(grid);
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
    const { noise } = this;
    if (gait === 'still' || !noise) return;
    const level = AUDIO.playerStepGain[gait];
    this.manager.play(level, FOOTSTEP_S, (v) =>
      footstep(v, v.out, noise, level, gait === 'run', this.random),
    );
  }

  /** A sound of the player's own (not positional), played at once. */
  private flat(kind: SfxKind): void {
    const { noise } = this;
    if (!noise) return;
    const level = AUDIO.sfxGain[kind];
    this.manager.play(level, SFX_S[kind], (v) => sfx(v, v.out, noise, kind, level, this.random));
  }

  /** Once per rendered frame: move the listener, run chatter timers, play queued sounds. */
  update(dt: number, listener: ListenerPose, guards: readonly ChatterGuard[]): void {
    const { ctx } = this.manager;
    const { noise } = this;
    if (!ctx || !noise || !this.manager.ready) {
      this.pending.length = 0;
      return;
    }
    this.spatial.updateListener(ctx, listener);

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
      if (p.kind === 'step') {
        const level = AUDIO.guardStepGain[p.run ? 'run' : 'walk'] * falloff;
        this.manager.play(level, FOOTSTEP_S, (v) =>
          footstep(v, this.spatial.chain(v, p.x, y, p.z, cutoff), noise, level, p.run, this.random),
        );
      } else if (p.kind === 'sfx') {
        const level = AUDIO.sfxGain[p.sfx] * falloff;
        const kind = p.sfx;
        this.manager.play(level, SFX_S[kind], (v) =>
          sfx(v, this.spatial.chain(v, p.x, y, p.z, cutoff), noise, kind, level, this.random),
        );
      } else {
        const level = AUDIO.barkGain * falloff;
        const bark = p.bark;
        this.manager.play(level, barkDuration(bark), (v) =>
          radioBark(v, this.spatial.chain(v, p.x, y, p.z, cutoff), noise, bark, level, this.random),
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
