// Game sound wiring: guard footsteps and radio barks (positional, muffled by walls, audible only within
// path range so what you hear matches what the minimap may show), idle patrol chatter, and the
// player's own footsteps. Sim events are queued and played on the next rendered frame.

import type { GuardState } from '../ai/guard-fsm';
import type { GuardSystem } from '../ai/guards';
import type { QualityTier } from '../config/quality';
import { AUDIO, PLAYER_HEARING } from '../config/tunables';
import type { Vec2 } from '../level/collision';
import type { Grid } from '../level/grid';
import { hasLineOfSight } from '../nav/los';
import { createSoundField, type DistanceField } from '../nav/sound';
import type { PlayerGait } from '../player/controller';
import { AudioManager } from './audio-manager';
import { Spatial, type ListenerPose } from './spatial';
import {
  barkDuration,
  createNoiseBuffer,
  footstep,
  FOOTSTEP_S,
  radioBark,
  type BarkKind,
} from './synth';

type Pending = { x: number; z: number } & (
  { kind: 'step'; run: boolean } | { kind: 'bark'; bark: BarkKind }
);

/** Most sim events kept between two rendered frames; extras are dropped. */
const MAX_PENDING = 32;
const MAX_RANGE = Math.max(AUDIO.barkRangeM, PLAYER_HEARING.runRangeM);

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
  private readonly field: DistanceField;
  private noise: AudioBuffer | null = null;
  private readonly pending: Pending[] = [];
  private chatter: number[] = [];

  constructor(
    private readonly grid: Grid,
    private readonly random: () => number,
  ) {
    this.field = createSoundField(grid);
    this.manager.onReady = (ctx) => (this.noise = createNoiseBuffer(ctx));
  }

  /** Listen to a new set of guards (each mission attempt has its own); drops anything queued. */
  attach(guards: GuardSystem): void {
    this.pending.length = 0;
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
        p.kind === 'bark'
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
