// Runs every guard each sim step: sense (vision, queued noises) → awareness → FSM → behaviour.
// Operates on the grid and plain data only; rendering reads guard state afterwards.

import { ALERT, AWARENESS, BODIES, GUARD, SIM, WEAPON } from '../config/tunables';
import { Emitter } from '../core/events';
import type { Rng } from '../core/rng';
import type { Vec2 } from '../level/collision';
import type { Grid } from '../level/grid';
import type { GuardDef } from '../level/types';
import { BeamRays, castBeamFan } from '../lighting/beam-rays';
import type { BeamLight } from '../lighting/light-sampling';
import type { Lens } from '../lighting/pool-points';
import { Pathfinder } from '../nav/astar';
import { createSoundField, createWalkField, type DistanceField } from '../nav/sound';
import type { PlayerGait } from '../player/controller';
import { Guard, type GuardContext, type GuardGait } from './guard';
import { nextState, type GuardState } from './guard-fsm';
import {
  createVisionResult,
  hearingGain,
  inOwnBeam,
  strayLightSeen,
  visionFill,
  type Viewer,
} from './perception';
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
  /** His beam landed on a body (once per guard per body): awareness 100, LKP at the body. */
  bodyFound: { guard: Guard; body: Guard };
}

/** Sim steps between two body/stray-light checks of the same guard. */
const BODY_BUCKETS = Math.max(1, Math.round(SIM.hz / BODIES.checkHz));
const DROP_PITCH = (BODIES.dropLensPitchDeg * Math.PI) / 180;

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
  /** Ray fan of each dead guard's dropped flashlight (it never moves), null while alive. */
  private readonly dropRays: (BeamRays | null)[];
  private readonly dropLens: Lens = { x: 0, y: 0, z: 0, pitch: DROP_PITCH };
  /** found[i·n + j]: guard i has already found guard j's body. */
  private readonly found: Uint8Array;
  private readonly beam: BeamLight = {
    x: 0,
    z: 0,
    height: GUARD.flashlightHeight,
    yaw: 0,
    intensity: 1,
  };
  private bodyStep = 0;

  constructor(grid: Grid, defs: readonly GuardDef[], rng: Rng) {
    this.ctx = {
      grid,
      paths: new Pathfinder(grid, GUARD.radius),
      walk: createWalkField(grid),
      rng,
    };
    this.sound = createSoundField(grid);
    this.guards = defs.map((def, i) => Guard.fromDef(i, grid, def));
    this.dropRays = this.guards.map(() => null);
    this.found = new Uint8Array(this.guards.length * this.guards.length);
    for (const g of this.guards) g.enter('patrol', this.ctx);
  }

  /** Queue a noise (footstep, impact) for the next step. */
  noise(x: number, z: number, radius: number): void {
    if (radius > 0) this.noises.push({ x, z, radius });
  }

  /**
   * A distraction (a bottle shattering) at (x, z): every living guard within `radius` path distance
   * becomes at least Suspicious, with his LKP moved there. Guards with the player in sight ignore it.
   */
  distract(x: number, z: number, radius: number): Guard[] {
    this.sound.flood(x, z, radius);
    const drawn: Guard[] = [];
    for (const g of this.guards) {
      if (g.dead || g.seesPlayer) continue;
      if (!(this.sound.at(g.pos.x, g.pos.z) <= radius)) continue;
      g.awareness.raiseTo(AWARENESS.suspicious, x, z);
      drawn.push(g);
    }
    return drawn;
  }

  /** Kill a guard. Returns false if he was already dead. */
  kill(g: Guard): boolean {
    if (g.dead) return false;
    const jitter = (BODIES.dropYawJitterDeg * Math.PI) / 180;
    g.die(this.ctx.rng.range(-jitter, jitter));
    const d = g.dropLens;
    this.dropRays[g.id] = castBeamFan(this.ctx.grid, d.x, d.z, d.yaw, new BeamRays());
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
    this.senseBodies(dt);

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

  /**
   * Dead guards give themselves away by light. A living guard whose own beam lands on a body goes
   * straight to awareness 100 (once per body); one who merely sees a stray dropped light gets a weak,
   * capped stimulus toward it, so he wanders over to look. Staggered: each guard checks at checkHz.
   */
  private senseBodies(dt: number): void {
    const { grid } = this.ctx;
    const n = this.guards.length;
    const bucket = this.bodyStep++ % BODY_BUCKETS;
    const period = BODY_BUCKETS * dt;
    const { beam, viewer } = this;
    for (let i = bucket; i < n; i += BODY_BUCKETS) {
      const g = this.guards[i] as Guard;
      if (g.dead) continue;
      viewer.x = g.pos.x;
      viewer.z = g.pos.z;
      viewer.yaw = g.yaw;
      beam.x = g.pos.x - Math.sin(g.yaw) * GUARD.flashlightForward;
      beam.z = g.pos.z - Math.cos(g.yaw) * GUARD.flashlightForward;
      beam.yaw = g.yaw;
      for (let j = 0; j < n; j++) {
        const body = this.guards[j] as Guard;
        if (!body.dead || this.found[i * n + j]) continue;
        if (inOwnBeam(grid, beam, body.pos.x, body.pos.z)) {
          this.found[i * n + j] = 1;
          // A guard already chasing the player in sight keeps his eyes on the player.
          if (!(g.state === 'alert' && g.seesPlayer)) {
            g.awareness.raiseTo(AWARENESS.alert, body.pos.x, body.pos.z);
          }
          this.events.emit('bodyFound', { guard: g, body });
          continue;
        }
        const rays = this.dropRays[j];
        if (!rays) continue;
        const lens = this.dropLens;
        lens.x = body.dropLens.x;
        lens.y = body.dropLens.height;
        lens.z = body.dropLens.z;
        if (!strayLightSeen(grid, viewer, lens, rays)) continue;
        const room = BODIES.strayLightCap - g.awareness.value;
        if (room > 0) {
          g.awareness.stimulus(Math.min(room, BODIES.strayLightPerS * period), lens.x, lens.z);
        }
      }
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
