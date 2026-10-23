// Runs every guard each sim step: sense (vision, queued noises) → awareness → FSM → behaviour.
// Operates on the grid and plain data only; rendering reads guard state afterwards.

import { ALERT, AWARENESS, BODIES, GUARD, WEAPON } from '../config/tunables';
import { Emitter } from '../core/events';
import type { Rng } from '../core/rng';
import type { Vec2 } from '../level/collision';
import type { Grid } from '../level/grid';
import type { GuardDef } from '../level/types';
import { Pathfinder } from '../nav/astar';
import { createSoundField, createWalkField, type DistanceField } from '../nav/sound';
import type { PlayerGait } from '../player/controller';
import { Guard, type GuardContext, type GuardGait } from './guard';
import { nextState, type GuardState } from './guard-fsm';
import { createVisionResult, hearingGain, visionFill, type Viewer } from './perception';
import { hitChance } from './weapon';

/** What the guards need to know about the player (PlayerController satisfies this). */
export interface PlayerView {
  readonly pos: Vec2;
  readonly vel: Vec2;
  readonly crouched: boolean;
  readonly gait: PlayerGait;
}

export interface GuardEvents {
  stateChange: { guard: Guard; from: GuardState; to: GuardState };
  /** A guard went Alert on its own and shouted to `alerted`. */
  alert: { guard: Guard; alerted: Guard[] };
  /** One of a guard's feet landed (audio only; the player's perception reads guard speed). */
  footstep: { guard: Guard; gait: GuardGait };
  death: { guard: Guard };
  /** An Alert guard started his 0.6 s aim at the player (the muzzle tell). */
  windup: { guard: Guard };
  /** He fired; `hit` says whether it struck the player. */
  shot: { guard: Guard; hit: boolean };
}

interface Noise {
  x: number;
  z: number;
  radius: number;
}

export class GuardSystem {
  readonly guards: Guard[];
  readonly events = new Emitter<GuardEvents>();
  private readonly ctx: GuardContext;
  private readonly sound: DistanceField;
  private readonly noises: Noise[] = [];
  private readonly viewer: Viewer = { x: 0, z: 0, yaw: 0, eyeHeight: GUARD.eyeHeight };
  private readonly vision = createVisionResult();
  private readonly target = {
    x: 0,
    z: 0,
    crouched: false,
    gait: 'still' as PlayerGait,
    exposure: 0,
  };

  constructor(grid: Grid, defs: readonly GuardDef[], rng: Rng) {
    this.ctx = {
      grid,
      paths: new Pathfinder(grid, GUARD.radius),
      walk: createWalkField(grid),
      rng,
    };
    this.sound = createSoundField(grid);
    this.guards = defs.map((def, i) => Guard.fromDef(i, grid, def));
    for (const g of this.guards) g.enter('patrol', this.ctx);
  }

  /** Queue a noise (footstep, impact) for the next step. */
  noise(x: number, z: number, radius: number): void {
    if (radius > 0) this.noises.push({ x, z, radius });
  }

  /** Kill a guard. Returns false if he was already dead. */
  kill(g: Guard): boolean {
    if (g.dead) return false;
    const jitter = (BODIES.dropYawJitterDeg * Math.PI) / 180;
    g.die(this.ctx.rng.range(-jitter, jitter));
    this.events.emit('death', { guard: g });
    return true;
  }

  get aliveCount(): number {
    let n = 0;
    for (const g of this.guards) if (!g.dead) n++;
    return n;
  }

  /** `exposure` is the player's current light exposure (0.25..1). */
  step(dt: number, player: PlayerView, exposure: number): void {
    const { grid } = this.ctx;
    const t = this.target;
    t.x = player.pos.x;
    t.z = player.pos.z;
    t.crouched = player.crouched;
    t.gait = player.gait;
    t.exposure = exposure;

    for (const g of this.guards) {
      if (g.dead) continue;
      this.viewer.x = g.pos.x;
      this.viewer.z = g.pos.z;
      this.viewer.yaw = g.yaw;
      const seen = visionFill(grid, this.viewer, t, this.vision);
      g.seesPlayer = seen.fillPerS > 0;
      if (g.seesPlayer) {
        g.awareness.stimulus(seen.fillPerS * dt, t.x, t.z, player.vel.x, player.vel.z);
      }
    }

    for (const n of this.noises) {
      this.sound.flood(n.x, n.z, n.radius);
      for (const g of this.guards) {
        if (g.dead) continue;
        g.awareness.stimulus(hearingGain(this.sound.at(g.pos.x, g.pos.z), n.radius), n.x, n.z);
      }
    }
    this.noises.length = 0;

    for (const g of this.guards) {
      if (g.dead) continue;
      g.awareness.update(dt);
      const from = g.state;
      const to = nextState(g.fsmInput());
      if (to === from) continue;
      g.enter(to, this.ctx);
      this.events.emit('stateChange', { guard: g, from, to });
      if (to === 'alert' && !g.alertedByOther) this.shout(g);
    }

    for (const g of this.guards) {
      g.step(dt, this.ctx, player.pos);
      if (g.footstep) this.events.emit('footstep', { guard: g, gait: g.footstep });
      if (!g.dead) this.stepGun(g, dt, player);
    }
  }

  private stepGun(g: Guard, dt: number, player: PlayerView): void {
    const d = Math.hypot(player.pos.x - g.pos.x, player.pos.z - g.pos.z);
    const canShoot = g.state === 'alert' && g.seesPlayer && d <= WEAPON.rangeM;
    const e = g.gun.step(dt, canShoot);
    if (e === 'windup') {
      this.events.emit('windup', { guard: g });
    } else if (e === 'fire') {
      const speed = Math.hypot(player.vel.x, player.vel.z);
      const hit = this.ctx.rng.next() < hitChance(d, speed);
      this.events.emit('shot', { guard: g, hit });
      this.shout(g, WEAPON.shotAlertM);
    }
  }

  /** Alert every other guard within `radius` path distance, sharing the LKP. */
  private shout(from: Guard, radius: number = ALERT.propagateM): void {
    const lkp = from.awareness.lkp ?? from.pos;
    this.sound.flood(from.pos.x, from.pos.z, radius);
    const alerted: Guard[] = [];
    for (const g of this.guards) {
      if (g === from || g.dead || g.state === 'alert') continue;
      if (this.sound.at(g.pos.x, g.pos.z) > radius) continue;
      g.alertedByOther = true;
      g.awareness.raiseTo(
        AWARENESS.alert,
        lkp.x,
        lkp.z,
        from.awareness.heading.x,
        from.awareness.heading.z,
      );
      alerted.push(g);
    }
    this.events.emit('alert', { guard: from, alerted });
  }
}
