// One guard: body on the grid, facing (= flashlight direction), awareness and per-state behaviour.
// The state transitions themselves come from guard-fsm.ts; GuardSystem drives sensing and transitions.

import { AWARENESS, BODIES, GUARD, KNIFE } from '../config/tunables';
import { turnToward, wrapAngle, yawFromCompassDeg, yawFromDir } from '../core/angles';
import type { Rng } from '../core/rng';
import { moveCircle, type Vec2 } from '../level/collision';
import type { Grid } from '../level/grid';
import type { GuardDef } from '../level/types';
import type { FlickerMode } from '../lighting/flicker';
import type { Pathfinder } from '../nav/astar';
import type { DistanceField } from '../nav/sound';
import { Awareness } from './awareness';
import type { FsmInput, GuardState } from './guard-fsm';
import { pickSearchCells } from './search';
import { Gun } from './weapon';

const DEG = Math.PI / 180;
const TURN_RATE: Record<GuardState, number> = {
  patrol: GUARD.turnRateDegPerS.patrol * DEG,
  suspicious: GUARD.turnRateDegPerS.suspicious * DEG,
  alert: GUARD.turnRateDegPerS.alert * DEG,
  search: GUARD.turnRateDegPerS.search * DEG,
};
const WALK_GATE = GUARD.walkTurnGateDeg * DEG;
const LOOK_ARC = GUARD.lookAroundArcDeg * DEG;

export interface GuardWaypoint extends Vec2 {
  waitS: number;
}

export interface GuardSpawn {
  x: number;
  z: number;
  yaw: number;
  waypoints: GuardWaypoint[];
}

/** Shared services every guard uses while stepping. */
export interface GuardContext {
  grid: Grid;
  paths: Pathfinder;
  walk: DistanceField;
  rng: Rng;
}

type SearchPhase = 'toLkp' | 'cells' | 'done';
export type GuardGait = 'walk' | 'run';

export class Guard {
  readonly pos: Vec2;
  readonly prevPos: Vec2;
  yaw: number;
  prevYaw: number;
  state: GuardState = 'patrol';
  /** Seconds since entering the current state. */
  stateTime = 0;
  readonly awareness = new Awareness();
  /** Stepped by GuardSystem while Alert; he stands still to aim during a wind-up. */
  readonly gun = new Gun();
  /** Set by GuardSystem each step: the player is in the cone with LOS. */
  seesPlayer = false;
  /** Put in Alert by another guard's shout; such guards don't shout on in turn. */
  alertedByOther = false;
  /** Actual ground speed this step (m/s). */
  speed = 0;
  /** Gait of the footstep that landed this step, or null if none did. */
  footstep: GuardGait | null = null;
  /** Current path (world points after the guard's position); exposed for the debug overlay. */
  readonly path: Vec2[] = [];
  /** Search cells for the current search (debug overlay). */
  searchCells: Vec2[] = [];
  /** Knife stabs it takes to kill him (2 on Hardcore); each one short of that wounds. */
  hp = 1;
  /** Seconds left of the stagger after a wound: he can't move, turn or shoot. */
  stagger = 0;
  /** Killed: no senses, no behaviour, just a body and a flashlight left on the floor. */
  dead = false;
  /** Seconds since death. */
  deadFor = 0;
  /** Where the dropped flashlight lies and points (valid once dead). */
  readonly dropLens = { x: 0, z: 0, height: 0, yaw: 0 };

  private pathIndex = 0;
  private readonly goal: Vec2 = { x: 0, z: 0 };
  private hasGoal = false;
  private repathTimer = 0;
  private waypointIndex = 0;
  private waitTimer = 0;
  private lookBaseYaw = 0;
  private lookTimer = 0;
  private reactTimer = 0;
  private dwellTimer = 0;
  private investigated = false;
  private atLkp = false;
  private searchPhase: SearchPhase = 'done';
  private searchIndex = 0;
  private readonly searchOrigin: Vec2 = { x: 0, z: 0 };
  private stepTimer = 0;

  constructor(
    readonly id: number,
    readonly spawn: GuardSpawn,
  ) {
    this.pos = { x: spawn.x, z: spawn.z };
    this.prevPos = { x: spawn.x, z: spawn.z };
    this.yaw = this.prevYaw = spawn.yaw;
    this.lookBaseYaw = spawn.yaw;
  }

  static fromDef(id: number, grid: Grid, def: GuardDef): Guard {
    const s = grid.gridToWorld(def.spawn.x, def.spawn.y);
    return new Guard(id, {
      ...s,
      yaw: yawFromCompassDeg(def.yawDeg),
      waypoints: def.waypoints.map((w) => ({ ...grid.gridToWorld(w.x, w.y), waitS: w.waitS ?? 0 })),
    });
  }

  /** How this guard's flashlight flickers right now. */
  get flicker(): FlickerMode {
    return this.state === 'alert' && !this.dead ? 'alertJitter' : 'steady';
  }

  /** A stab that doesn't kill: one hit point less, and he staggers on the spot. */
  wound(): void {
    this.hp--;
    this.stagger = KNIFE.woundStaggerS;
    this.clearPath();
    this.gun.reset();
  }

  /** Drop dead where he stands; the flashlight falls ahead of him, still on, turned by `yawJitter`. */
  die(yawJitter: number): void {
    this.dead = true;
    this.deadFor = 0;
    this.stagger = 0;
    this.seesPlayer = false;
    this.speed = 0;
    this.footstep = null;
    this.searchCells = [];
    this.clearPath();
    this.gun.reset();
    const d = this.dropLens;
    d.x = this.pos.x - Math.sin(this.yaw) * BODIES.dropForwardM;
    d.z = this.pos.z - Math.cos(this.yaw) * BODIES.dropForwardM;
    d.height = BODIES.dropLensHeight;
    d.yaw = wrapAngle(this.yaw + yawJitter);
  }

  fsmInput(): FsmInput {
    return {
      state: this.state,
      awareness: this.awareness.value,
      investigated: this.investigated,
      atLkp: this.atLkp,
      seesPlayer: this.seesPlayer,
      searchElapsed: this.state === 'search' ? this.stateTime : 0,
      searchExhausted: this.searchPhase === 'done' && this.state === 'search',
    };
  }

  /** Switch state and run its entry actions. */
  enter(next: GuardState, ctx: GuardContext): void {
    const prev = this.state;
    this.state = next;
    this.stateTime = 0;
    this.lookTimer = 0;
    this.dwellTimer = 0;
    if (prev === 'search' && next === 'patrol') {
      this.awareness.setFloor(AWARENESS.searchFloor, AWARENESS.searchFloorS);
    }
    if (next !== 'alert') {
      this.alertedByOther = false;
      this.gun.reset();
    }
    switch (next) {
      case 'patrol':
        this.searchCells = [];
        this.waitTimer = 0;
        this.goTo(this.currentWaypoint() ?? this.spawn, ctx);
        break;
      case 'suspicious':
        this.reactTimer = GUARD.suspiciousReactS;
        this.investigated = false;
        this.clearPath();
        break;
      case 'alert':
        this.atLkp = false;
        this.searchCells = [];
        if (this.awareness.lkp) this.goTo(this.awareness.lkp, ctx);
        break;
      case 'search':
        this.awareness.value = Math.min(this.awareness.value, AWARENESS.searchStart);
        this.startSearch(ctx);
        break;
    }
  }

  /** Behaviour for the current state. `player` is used only while it is in sight. */
  step(dt: number, ctx: GuardContext, player: Vec2): void {
    this.prevPos.x = this.pos.x;
    this.prevPos.z = this.pos.z;
    this.prevYaw = this.yaw;
    if (this.dead) {
      this.deadFor += dt;
      return;
    }
    if (this.stagger > 0) {
      this.stagger = Math.max(0, this.stagger - dt);
      this.speed = 0;
      this.stepFootsteps(dt);
      return;
    }
    this.stateTime += dt;
    this.repathTimer -= dt;
    switch (this.state) {
      case 'patrol':
        this.patrol(dt, ctx);
        break;
      case 'suspicious':
        this.suspicious(dt, ctx);
        break;
      case 'alert':
        this.alert(dt, ctx, player);
        break;
      case 'search':
        this.search(dt, ctx);
        break;
    }
    this.speed = Math.hypot(this.pos.x - this.prevPos.x, this.pos.z - this.prevPos.z) / dt;
    this.stepFootsteps(dt);
  }

  /** Walking or running by ground speed; null while standing. */
  get gait(): GuardGait | null {
    if (this.speed < GUARD.gaitMovingSpeed) return null;
    return this.speed >= GUARD.gaitRunSpeed ? 'run' : 'walk';
  }

  private stepFootsteps(dt: number): void {
    const gait = this.gait;
    this.footstep = null;
    if (!gait) {
      this.stepTimer = 0; // the first step lands as soon as he moves again
      return;
    }
    this.stepTimer -= dt;
    if (this.stepTimer <= 0) {
      this.footstep = gait;
      this.stepTimer += GUARD.footstepIntervalS[gait];
    }
  }

  // --- States ---------------------------------------------------------------------------------

  private patrol(dt: number, ctx: GuardContext): void {
    if (this.waitTimer > 0) {
      this.lookAround(dt);
      this.waitTimer -= dt;
      if (this.waitTimer <= 0) this.advanceWaypoint(ctx);
      return;
    }
    if (!this.followPath(dt, GUARD.walkSpeed, ctx)) return;
    if (this.spawn.waypoints.length <= 1) {
      // A posted guard: hold position and sweep around the spawn heading.
      if (this.dwellTimer === 0) this.startLookAround(this.spawn.yaw);
      this.dwellTimer += dt;
      this.lookAround(dt);
      return;
    }
    const wait = this.currentWaypoint()?.waitS ?? 0;
    if (wait > 0) {
      this.waitTimer = wait;
      this.startLookAround();
    } else {
      this.advanceWaypoint(ctx);
    }
  }

  private suspicious(dt: number, ctx: GuardContext): void {
    const lkp = this.awareness.lkp;
    if (!lkp) {
      this.investigated = true;
      return;
    }
    const rate = TURN_RATE.suspicious;
    if (this.reactTimer > 0) {
      this.reactTimer -= dt;
      this.faceToward(lkp.x, lkp.z, rate * dt);
      if (this.reactTimer <= 0) this.goTo(lkp, ctx);
      return;
    }
    // A fresh stimulus elsewhere restarts the investigation there.
    if (this.goalStale(lkp)) {
      this.goTo(lkp, ctx);
      this.investigated = false;
      this.dwellTimer = 0;
    }
    if (this.followPath(dt, GUARD.walkSpeed * GUARD.suspiciousSpeedFactor, ctx)) {
      if (this.dwellTimer === 0) this.startLookAround();
      this.dwellTimer += dt;
      this.lookAround(dt);
      if (this.dwellTimer >= GUARD.investigateLookS) this.investigated = true;
    }
  }

  private alert(dt: number, ctx: GuardContext, player: Vec2): void {
    const lkp = this.awareness.lkp;
    if (!lkp) {
      this.atLkp = true;
      return;
    }
    if (this.goalStale(lkp)) {
      this.goTo(lkp, ctx);
      this.atLkp = false;
    }
    if (this.seesPlayer) {
      this.atLkp = false;
      this.faceToward(player.x, player.z, TURN_RATE.alert * dt);
      const d = Math.hypot(player.x - this.pos.x, player.z - this.pos.z);
      const aiming = this.gun.phase === 'windup';
      if (d > GUARD.standoffM && !aiming) this.followPath(dt, GUARD.runSpeed, ctx, true);
      return;
    }
    if (this.followPath(dt, GUARD.runSpeed, ctx)) this.atLkp = true;
  }

  private search(dt: number, ctx: GuardContext): void {
    const lkp = this.awareness.lkp;
    // The LKP only moves on a new stimulus: re-centre the search on it (the give-up clock keeps running).
    if (
      lkp &&
      Math.hypot(lkp.x - this.searchOrigin.x, lkp.z - this.searchOrigin.z) > GUARD.repathMoveM
    ) {
      this.startSearch(ctx);
    }
    if (this.searchPhase === 'done') {
      this.lookAround(dt);
      return;
    }
    if (!this.followPath(dt, GUARD.walkSpeed, ctx)) return;
    if (this.searchPhase === 'toLkp') {
      this.searchCells = pickSearchCells(
        ctx.walk,
        this.searchOrigin,
        this.awareness.heading,
        ctx.rng,
      );
      this.searchPhase = 'cells';
      this.searchIndex = 0;
      this.nextSearchCell(ctx);
      return;
    }
    if (this.dwellTimer === 0) this.startLookAround();
    this.dwellTimer += dt;
    this.lookAround(dt);
    if (this.dwellTimer >= GUARD.searchCellLookS) {
      this.dwellTimer = 0;
      this.searchIndex++;
      this.nextSearchCell(ctx);
    }
  }

  // --- Helpers --------------------------------------------------------------------------------

  private startSearch(ctx: GuardContext): void {
    const lkp = this.awareness.lkp ?? this.pos;
    this.searchOrigin.x = lkp.x;
    this.searchOrigin.z = lkp.z;
    this.searchCells = [];
    this.searchPhase = 'toLkp';
    this.dwellTimer = 0;
    this.goTo(this.searchOrigin, ctx);
  }

  private nextSearchCell(ctx: GuardContext): void {
    const cell = this.searchCells[this.searchIndex];
    if (cell) this.goTo(cell, ctx);
    else this.searchPhase = 'done';
  }

  private currentWaypoint(): GuardWaypoint | undefined {
    return this.spawn.waypoints[this.waypointIndex];
  }

  private advanceWaypoint(ctx: GuardContext): void {
    const n = this.spawn.waypoints.length;
    if (n === 0) return;
    this.waypointIndex = (this.waypointIndex + 1) % n;
    this.waitTimer = 0;
    this.goTo(this.currentWaypoint() as GuardWaypoint, ctx);
  }

  /** Plan a path to (x, z). An unreachable goal leaves an empty path, which reads as "arrived". */
  private goTo(target: Vec2, ctx: GuardContext): void {
    this.goal.x = target.x;
    this.goal.z = target.z;
    this.hasGoal = true;
    this.repathTimer = GUARD.repathS;
    this.pathIndex = 0;
    ctx.paths.findPath(this.pos.x, this.pos.z, target.x, target.z, this.path);
  }

  private clearPath(): void {
    this.path.length = 0;
    this.pathIndex = 0;
    this.hasGoal = false;
  }

  /** The target has moved far enough from the planned goal, and we're allowed to re-plan. */
  private goalStale(target: Vec2): boolean {
    if (!this.hasGoal) return true;
    if (this.repathTimer > 0) return false;
    return Math.hypot(target.x - this.goal.x, target.z - this.goal.z) > GUARD.repathMoveM;
  }

  /**
   * Walk along the path. Turns toward each point first (unless `strafe`, where facing is handled
   * by the caller). Returns true once the whole path is done.
   */
  private followPath(dt: number, speed: number, ctx: GuardContext, strafe = false): boolean {
    for (;;) {
      const target = this.path[this.pathIndex];
      if (!target) return true;
      const dx = target.x - this.pos.x;
      const dz = target.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < GUARD.arriveDistM) {
        this.pathIndex++;
        continue;
      }
      const desired = yawFromDir(dx, dz);
      if (!strafe) {
        this.yaw = turnToward(this.yaw, desired, TURN_RATE[this.state] * dt);
        if (Math.abs(wrapAngle(desired - this.yaw)) > WALK_GATE) return false;
      }
      const step = Math.min(speed * dt, d);
      moveCircle(ctx.grid, this.pos, (dx / d) * step, (dz / d) * step, GUARD.radius);
      return false;
    }
  }

  private faceToward(x: number, z: number, maxStep: number): void {
    const dx = x - this.pos.x;
    const dz = z - this.pos.z;
    if (dx * dx + dz * dz < 1e-6) return;
    this.yaw = turnToward(this.yaw, yawFromDir(dx, dz), maxStep);
  }

  private startLookAround(baseYaw = this.yaw): void {
    this.lookBaseYaw = baseYaw;
    this.lookTimer = 0;
  }

  private lookAround(dt: number): void {
    this.lookTimer += dt;
    const target =
      this.lookBaseYaw +
      LOOK_ARC * Math.sin((2 * Math.PI * this.lookTimer) / GUARD.lookAroundPeriodS);
    this.yaw = turnToward(this.yaw, target, TURN_RATE[this.state] * dt);
  }
}
