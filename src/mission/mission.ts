// One attempt at a level, as pure sim state: the player, the guards, their flashlights as the sim sees
// them, the player's light exposure and what the player has perceived. No three.js, no DOM, so a restart
// is just a new Mission and whole levels can run headless in tests.

import type { Guard } from '../ai/guard';
import { GuardSystem } from '../ai/guards';
import { BOTTLE, GUARD, KNIFE, LIGHT_EXPOSURE, MISSION, WEAPON } from '../config/tunables';
import { Emitter } from '../core/events';
import type { Rng } from '../core/rng';
import type { InputState } from '../input/input-state';
import type { Vec2 } from '../level/collision';
import type { LoadedLevel } from '../level/loader';
import { flickerIntensity } from '../lighting/flicker';
import { lightExposure, type BeamLight } from '../lighting/light-sampling';
import { PlayerPerception } from '../perception/player-perception';
import { createPlayerView } from '../perception/view';
import { PlayerController } from '../player/controller';
import { Health } from '../player/health';
import { findKillTarget } from '../player/knife';
import { Bottle, type Point3 } from '../player/throw';
import { NO_MODIFIERS, type MissionModifiers } from './modifiers';
import { checkOutcome, objectiveLabel, onExitTile, type Outcome } from './objectives';
import { starCriteria, starRating, type RunStats, type StarCriteria } from './stars';

/** The camera's lens, which decides what the player can see. */
export interface ViewLens {
  /** Vertical field of view (rad). */
  vFov: number;
  aspect: number;
}

export interface MissionEvents {
  /** The player knifed a guard. */
  kill: { guard: Guard };
  /** A hit point came back. */
  heal: { hp: number };
  /** A guard's shot struck the player. */
  hit: { guard: Guard; hp: number };
  /** A bottle left the player's hand. */
  throw: { left: number };
  /** It shattered at `at`; `drawn` guards turn toward it. */
  shatter: { at: Point3; drawn: Guard[] };
  /** The objective item was collected. */
  pickup: Record<string, never>;
  /** The mission is over. */
  end: { outcome: Outcome };
}

export interface MissionResult {
  outcome: Outcome;
  stats: RunStats;
  criteria: StarCriteria;
  /** Only meaningful when won. */
  stars: 1 | 2 | 3;
}

export class Mission {
  readonly events = new Emitter<MissionEvents>();
  readonly player: PlayerController;
  readonly health: Health;
  readonly guards: GuardSystem;
  readonly perception: PlayerPerception;
  /** Guard i's flashlight as the sim sees it (lens, facing, brightness). */
  readonly beams: BeamLight[];
  readonly lamps: readonly Vec2[];
  /** Player light exposure from the last step (dark..lit). */
  exposure: number = LIGHT_EXPOSURE.dark;
  /** Sim seconds since the mission started. */
  time = 0;
  kills = 0;
  /** Index of the guard a knife press would kill right now, or -1 (drives the context prompt). */
  knifeTarget = -1;
  /** Seconds left of the post-kill movement lock. */
  lockTimer = 0;
  /** ?debug=1 playtesting aid: hits still land (and show) but cost no HP. */
  godMode = false;
  /** Distraction bottles left, and the one in flight (only one at a time). */
  bottles: number;
  readonly bottle = new Bottle();
  /** The objective item's position, if the level has one. */
  readonly item: Vec2 | null;
  itemTaken = false;
  /** A guard went Alert with the player in sight at some point (costs the stealth star). */
  detected = false;
  /** Set once, when the mission is won or failed; the sim then freezes. */
  outcome: Outcome | null = null;
  /** Seconds since the mission ended. */
  endedFor = 0;
  private readonly view = createPlayerView();

  /** `mods`: what the equipped perk changes for this attempt. */
  constructor(
    readonly level: LoadedLevel,
    rng: Rng,
    readonly mods: Readonly<MissionModifiers> = NO_MODIFIERS,
  ) {
    const { grid, data } = level;
    const spawn = grid.gridToWorld(data.playerSpawn.x, data.playerSpawn.y);
    this.player = new PlayerController({ ...spawn, yawDeg: data.playerSpawn.yawDeg });
    this.player.noiseScale = mods.noiseScale;
    this.health = new Health(mods.regenDelayS);
    this.guards = new GuardSystem(grid, data.guards, rng.fork());
    this.lamps = data.lamps.map((l) => grid.gridToWorld(l.x, l.y));
    this.beams = this.guards.guards.map(() => ({ x: 0, z: 0, height: 0, yaw: 0, intensity: 0 }));
    this.perception = new PlayerPerception(grid, this.guards.guards.length);
    this.bottles = (data.bottles ?? BOTTLE.defaultCount) + mods.bonusBottles;
    const item = data.objective.type === 'reachExit' ? data.objective.item : undefined;
    this.item = item ? grid.gridToWorld(item.x, item.y) : null;
    this.guards.events.on('stateChange', ({ guard, to }) => {
      if (to === 'alert' && guard.seesPlayer) this.detected = true;
    });
    this.guards.events.on('shot', ({ guard, hit }) => {
      if (!hit) return;
      if (!this.godMode) this.health.damage(WEAPON.damage);
      this.events.emit('hit', { guard, hp: this.health.hp });
    });
  }

  step(dt: number, input: InputState, lens: ViewLens): void {
    if (this.outcome) {
      this.endedFor += dt;
      input.consumeEdges();
      return;
    }
    const { grid } = this.level;
    const { player, guards } = this;
    // Actions read edge flags before the controller consumes them.
    this.knifeTarget = findKillTarget(grid, player.pos.x, player.pos.z, guards.guards);
    if (this.lockTimer > 0) this.lockTimer -= dt;
    else if (input.context && this.knifeTarget >= 0) this.knife(this.knifeTarget);
    else if (input.throw) this.throwBottle();
    if (this.lockTimer > 0) input.moveX = input.moveY = 0;
    player.step(dt, input, grid);
    if (this.bottle.step(dt, grid)) this.shatter();
    if (player.footstep > 0) guards.noise(player.pos.x, player.pos.z, player.footstep);
    this.time += dt;
    this.updateBeams();
    this.exposure = lightExposure(grid, player.pos.x, player.pos.z, this.lamps, this.beams);
    guards.step(dt, player, this.exposure);
    if (this.health.update(dt, this.seen)) this.events.emit('heal', { hp: this.health.hp });

    // What the player could have noticed, from where the guards are now.
    this.updateBeams();
    const v = this.view;
    v.x = player.pos.x;
    v.y = player.eyeHeight;
    v.z = player.pos.z;
    v.yaw = player.yaw;
    v.pitch = player.pitch;
    v.vFov = lens.vFov;
    v.aspect = lens.aspect;
    this.perception.step(dt, v, guards.guards, this.beams);

    const { item } = this;
    if (item && !this.itemTaken) {
      if (Math.hypot(player.pos.x - item.x, player.pos.z - item.z) <= MISSION.itemPickupM) {
        this.itemTaken = true;
        this.events.emit('pickup', {});
      }
    }
    const outcome = checkOutcome({
      type: this.level.data.objective.type,
      hasItem: item !== null,
      itemTaken: this.itemTaken,
      onExit: onExitTile(grid, player.pos),
      aliveGuards: guards.aliveCount,
      playerDead: this.health.dead,
    });
    if (outcome) this.end(outcome);
  }

  get stats(): RunStats {
    return {
      timeS: this.time,
      kills: this.kills,
      detected: this.detected,
      damaged: this.health.damaged,
    };
  }

  /** The end-of-mission summary (null while still playing). */
  get result(): MissionResult | null {
    if (!this.outcome) return null;
    const stats = this.stats;
    const criteria = starCriteria(stats, this.level.data.parTimeS);
    return { outcome: this.outcome, stats, criteria, stars: starRating(criteria) };
  }

  /** What to do next, for the HUD. */
  get objectiveLabel(): string {
    const total = this.guards.guards.length;
    return objectiveLabel(
      this.level.data.objective.type,
      this.item !== null,
      this.itemTaken,
      this.guards.aliveCount,
      total,
    );
  }

  private end(outcome: Outcome): void {
    this.outcome = outcome;
    this.endedFor = 0;
    // Freeze in place: with prev = current, render interpolation holds still.
    const { player } = this;
    player.prevPos.x = player.pos.x;
    player.prevPos.z = player.pos.z;
    player.prevEyeHeight = player.eyeHeight;
    for (const g of this.guards.guards) {
      g.prevPos.x = g.pos.x;
      g.prevPos.z = g.pos.z;
      g.prevYaw = g.yaw;
    }
    this.events.emit('end', { outcome });
  }

  /** Some living guard has the player in sight this step. */
  get seen(): boolean {
    return this.guards.guards.some((g) => g.seesPlayer && !g.dead);
  }

  private knife(i: number): void {
    const g = this.guards.guards[i] as Guard;
    if (!this.guards.kill(g)) return;
    this.kills++;
    this.lockTimer = KNIFE.lockS;
    this.knifeTarget = -1;
    this.guards.noise(g.pos.x, g.pos.z, KNIFE.noiseRadiusM);
    this.events.emit('kill', { guard: g });
  }

  private throwBottle(): void {
    if (this.bottles <= 0 || this.bottle.flying) return;
    const { player } = this;
    this.bottles--;
    this.bottle.launch(
      player.pos.x - Math.sin(player.yaw) * BOTTLE.releaseForwardM,
      player.eyeHeight - BOTTLE.releaseDropM,
      player.pos.z - Math.cos(player.yaw) * BOTTLE.releaseForwardM,
      player.yaw,
      player.pitch,
    );
    this.events.emit('throw', { left: this.bottles });
  }

  private shatter(): void {
    const at = this.bottle.pos;
    const drawn = this.guards.distract(at.x, at.z, BOTTLE.noiseRadiusM);
    this.events.emit('shatter', { at, drawn });
  }

  private updateBeams(): void {
    this.guards.guards.forEach((g, i) => {
      const b = this.beams[i] as BeamLight;
      if (g.dead) {
        b.x = g.dropLens.x;
        b.z = g.dropLens.z;
        b.height = g.dropLens.height;
        b.yaw = g.dropLens.yaw;
      } else {
        b.x = g.pos.x - Math.sin(g.yaw) * GUARD.flashlightForward;
        b.z = g.pos.z - Math.cos(g.yaw) * GUARD.flashlightForward;
        b.height = GUARD.flashlightHeight;
        b.yaw = g.yaw;
      }
      b.intensity = flickerIntensity(g.flicker, this.time, g.id);
    });
  }
}
