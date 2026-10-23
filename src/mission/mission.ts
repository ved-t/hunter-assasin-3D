// One attempt at a level, as pure sim state: the player, the guards, their flashlights as the sim sees
// them, the player's light exposure and what the player has perceived. No three.js, no DOM, so a restart
// is just a new Mission and whole levels can run headless in tests.

import { GuardSystem } from '../ai/guards';
import { GUARD, LIGHT_EXPOSURE } from '../config/tunables';
import type { Rng } from '../core/rng';
import type { InputState } from '../input/input-state';
import type { Vec2 } from '../level/collision';
import type { LoadedLevel } from '../level/loader';
import { flickerIntensity } from '../lighting/flicker';
import { lightExposure, type BeamLight } from '../lighting/light-sampling';
import { PlayerPerception } from '../perception/player-perception';
import { createPlayerView } from '../perception/view';
import { PlayerController } from '../player/controller';

/** The camera's lens, which decides what the player can see. */
export interface ViewLens {
  /** Vertical field of view (rad). */
  vFov: number;
  aspect: number;
}

export class Mission {
  readonly player: PlayerController;
  readonly guards: GuardSystem;
  readonly perception: PlayerPerception;
  /** Guard i's flashlight as the sim sees it (lens, facing, brightness). */
  readonly beams: BeamLight[];
  readonly lamps: readonly Vec2[];
  /** Player light exposure from the last step (dark..lit). */
  exposure: number = LIGHT_EXPOSURE.dark;
  /** Sim seconds since the mission started. */
  time = 0;
  private readonly view = createPlayerView();

  constructor(
    readonly level: LoadedLevel,
    rng: Rng,
  ) {
    const { grid, data } = level;
    const spawn = grid.gridToWorld(data.playerSpawn.x, data.playerSpawn.y);
    this.player = new PlayerController({ ...spawn, yawDeg: data.playerSpawn.yawDeg });
    this.guards = new GuardSystem(grid, data.guards, rng.fork());
    this.lamps = data.lamps.map((l) => grid.gridToWorld(l.x, l.y));
    this.beams = this.guards.guards.map(() => ({ x: 0, z: 0, height: 0, yaw: 0, intensity: 0 }));
    this.perception = new PlayerPerception(grid, this.guards.guards.length);
  }

  step(dt: number, input: InputState, lens: ViewLens): void {
    const { grid } = this.level;
    const { player, guards } = this;
    player.step(dt, input, grid);
    if (player.footstep > 0) guards.noise(player.pos.x, player.pos.z, player.footstep);
    this.time += dt;
    this.updateBeams();
    this.exposure = lightExposure(grid, player.pos.x, player.pos.z, this.lamps, this.beams);
    guards.step(dt, player, this.exposure);

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
  }

  private updateBeams(): void {
    this.guards.guards.forEach((g, i) => {
      const b = this.beams[i] as BeamLight;
      b.x = g.pos.x - Math.sin(g.yaw) * GUARD.flashlightForward;
      b.z = g.pos.z - Math.cos(g.yaw) * GUARD.flashlightForward;
      b.height = GUARD.flashlightHeight;
      b.yaw = g.yaw;
      b.intensity = flickerIntensity(g.flicker, this.time, g.id);
    });
  }
}
