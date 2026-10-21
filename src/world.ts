// A playable world: level scene + player + input + camera, behind the same update/render shape as the
// Phase 0 perf scene so main.ts can drive either.

import type * as THREE from 'three';
import type { QualityTier } from './config/quality';
import { InputManager } from './input/input-manager';
import type { LoadedLevel } from './level/loader';
import { applyCameraRig } from './player/camera-rig';
import { PlayerController } from './player/controller';
import { createLevelScene } from './render/level-scene';
import type { Settings } from './save/settings';

export interface World {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Fixed-step sim update. */
  update(dt: number): void;
  /** Per rendered frame: interpolation alpha and the real frame delta (s). */
  render(alpha: number, frameDt: number): void;
  applyTier(tier: QualityTier): void;
  debugLines(): string[];
}

export interface GameWorld extends World {
  readonly input: InputManager;
  readonly player: PlayerController;
  /** While true, look input is discarded (menus, rotate prompt). */
  paused: boolean;
  applySettings(settings: Settings): void;
}

export interface GameWorldOptions {
  canvas: HTMLCanvasElement;
  uiRoot: HTMLElement;
  debug: boolean;
  startInTouchMode: boolean;
}

export function createGameWorld(level: LoadedLevel, opts: GameWorldOptions): GameWorld {
  const { scene, camera } = createLevelScene(level, opts.debug);
  const { grid, data } = level;
  const spawn = grid.gridToWorld(data.playerSpawn.x, data.playerSpawn.y);
  const player = new PlayerController({ ...spawn, yawDeg: data.playerSpawn.yawDeg });
  const input = new InputManager(opts.canvas, opts.uiRoot, opts.startInTouchMode);
  const look = { yaw: 0, pitch: 0 };
  applyCameraRig(camera, player, 1);

  return {
    scene,
    camera,
    input,
    player,
    paused: false,
    update(dt) {
      input.pollMovement();
      player.step(dt, input.state, grid);
    },
    render(alpha, frameDt) {
      input.flushLook(frameDt);
      input.state.consumeLook(look);
      if (!this.paused) player.applyLook(look.yaw, look.pitch);
      applyCameraRig(camera, player, alpha);
    },
    applyTier() {
      // No shadow-casting lights until the Phase 2 SpotLight pool; nothing tier-dependent yet.
    },
    applySettings(settings) {
      input.apply(settings);
      player.invertY = settings.invertY;
    },
    debugLines() {
      const c = grid.worldToCell(player.pos.x, player.pos.z);
      return [
        `level   ${data.id}`,
        `pos     ${player.pos.x.toFixed(2)}, ${player.pos.z.toFixed(2)}  cell ${c.cx},${c.cy}`,
        `gait    ${player.gait}${player.crouched ? ' (crouched)' : ''}  ${player.speed.toFixed(2)} m/s`,
        `noise   ${player.noiseRadius} m  input ${input.isTouchMode ? 'touch' : 'kbm'}`,
      ];
    },
  };
}
