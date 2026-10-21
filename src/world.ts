// A playable world: level scene + player + input + camera + guards and their flashlights, plus what the
// player perceives of them (minimap, HUD, sound), behind the same update/render shape as the Phase 0
// perf scene so main.ts can drive either.

import type * as THREE from 'three';
import { GuardSystem } from './ai/guards';
import { GameAudio } from './audio/game-audio';
import type { QualityTier } from './config/quality';
import { GUARD, LIGHT_EXPOSURE } from './config/tunables';
import { Rng } from './core/rng';
import { InputManager } from './input/input-manager';
import type { LoadedLevel } from './level/loader';
import { flickerIntensity } from './lighting/flicker';
import { Flashlights, type FlashlightState } from './lighting/flashlights';
import { lightExposure, type BeamLight } from './lighting/light-sampling';
import { PlayerPerception } from './perception/player-perception';
import { createPlayerView } from './perception/view';
import { applyCameraRig } from './player/camera-rig';
import { PlayerController } from './player/controller';
import type { DebugAi } from './render/debug-ai';
import { guardFlashlight, GuardVisuals } from './render/guard-visuals';
import { createLevelScene } from './render/level-scene';
import type { Settings } from './save/settings';
import { Hud } from './ui/hud';

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
  readonly guards: GuardSystem;
  /** Unlocked by main.ts on the first user gesture; suspended with the host. */
  readonly audio: GameAudio;
  /** While true, look input is discarded (menus, rotate prompt). */
  paused: boolean;
  applySettings(settings: Settings): void;
}

export interface GameWorldOptions {
  canvas: HTMLCanvasElement;
  uiRoot: HTMLElement;
  debug: boolean;
  startInTouchMode: boolean;
  tier: QualityTier;
  seed: number;
  /** The renderer's current pixel ratio (for screen-sized effects such as beam dust). */
  pixelRatio: () => number;
}

export function createGameWorld(level: LoadedLevel, opts: GameWorldOptions): GameWorld {
  const { scene, camera } = createLevelScene(level, opts.debug);
  const { grid, data } = level;
  const rng = new Rng(opts.seed);
  const spawn = grid.gridToWorld(data.playerSpawn.x, data.playerSpawn.y);
  const player = new PlayerController({ ...spawn, yawDeg: data.playerSpawn.yawDeg });
  const input = new InputManager(opts.canvas, opts.uiRoot, opts.startInTouchMode);
  const look = { yaw: 0, pitch: 0 };
  applyCameraRig(camera, player, 1);

  const guards = new GuardSystem(grid, data.guards, rng.fork());
  const lamps = data.lamps.map((l) => grid.gridToWorld(l.x, l.y));
  const count = guards.guards.length;
  const visualRng = rng.fork();
  const flashlights = new Flashlights(scene, grid, count, opts.tier, () => visualRng.next());
  const guardVisuals = new GuardVisuals(count);
  scene.add(guardVisuals.group);

  // Sim-side flashlights (for player exposure) and per-frame interpolated ones (for visuals).
  const simBeams: BeamLight[] = guards.guards.map(() => ({
    x: 0,
    z: 0,
    height: 0,
    yaw: 0,
    intensity: 0,
  }));
  const lights: FlashlightState[] = guards.guards.map(() => ({
    id: 0,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
    intensity: 0,
  }));
  let simTime = 0;
  let exposure: number = LIGHT_EXPOSURE.dark;
  const updateSimBeams = () =>
    guards.guards.forEach((g, i) => {
      const b = simBeams[i] as BeamLight;
      b.x = g.pos.x - Math.sin(g.yaw) * GUARD.flashlightForward;
      b.z = g.pos.z - Math.cos(g.yaw) * GUARD.flashlightForward;
      b.height = GUARD.flashlightHeight;
      b.yaw = g.yaw;
      b.intensity = flickerIntensity(g.flicker, simTime, g.id);
    });

  const perception = new PlayerPerception(grid, count);
  const view = createPlayerView();
  const hud = new Hud(opts.uiRoot, grid, count);
  const audio = new GameAudio(grid, guards, () => visualRng.next());
  audio.applyTier(opts.tier);
  const hudPose = { x: 0, z: 0, yaw: 0 };
  const listener = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };

  let debugAi: DebugAi | null = null;
  if (opts.debug) {
    void import('./render/debug-ai').then(({ DebugAi }) => {
      debugAi = new DebugAi(scene, grid, guards.guards, lamps, opts.uiRoot);
    });
  }

  return {
    scene,
    camera,
    input,
    player,
    guards,
    audio,
    paused: false,
    update(dt) {
      input.pollMovement();
      player.step(dt, input.state, grid);
      if (player.footstep > 0) {
        guards.noise(player.pos.x, player.pos.z, player.footstep);
        hud.noise(player.pos.x, player.pos.z, player.footstep);
        audio.playerStep(player.gait);
      }
      simTime += dt;
      updateSimBeams();
      exposure = lightExposure(grid, player.pos.x, player.pos.z, lamps, simBeams);
      guards.step(dt, player, exposure);

      // What the player could have noticed, from where the guards are now.
      updateSimBeams();
      view.x = player.pos.x;
      view.y = player.eyeHeight;
      view.z = player.pos.z;
      view.yaw = player.yaw;
      view.pitch = player.pitch;
      view.vFov = (camera.fov * Math.PI) / 180;
      view.aspect = camera.aspect;
      perception.step(dt, view, guards.guards, simBeams);
    },
    render(alpha, frameDt) {
      input.flushLook(frameDt);
      input.state.consumeLook(look);
      if (!this.paused) player.applyLook(look.yaw, look.pitch);
      applyCameraRig(camera, player, alpha);
      guards.guards.forEach((g, i) =>
        guardFlashlight(g, alpha, simTime, lights[i] as FlashlightState),
      );
      flashlights.update(lights, camera, frameDt, simTime, opts.pixelRatio());
      guardVisuals.update(guards.guards, lights, alpha, camera);

      hudPose.x = listener.x = camera.position.x;
      hudPose.z = listener.z = camera.position.z;
      hudPose.yaw = listener.yaw = player.yaw;
      listener.y = camera.position.y;
      listener.pitch = player.pitch;
      hud.update(frameDt, hudPose, exposure, perception.memory.markers, guards.guards);
      audio.update(frameDt, listener, guards.guards);
      debugAi?.update(alpha, frameDt, camera, simBeams, perception.results);
    },
    applyTier(tier) {
      flashlights.applyTier(tier);
      audio.applyTier(tier);
    },
    applySettings(settings) {
      input.apply(settings);
      player.invertY = settings.invertY;
      hud.minimapMode = settings.minimapMode;
    },
    debugLines() {
      const c = grid.worldToCell(player.pos.x, player.pos.z);
      return [
        `level   ${data.id}`,
        `pos     ${player.pos.x.toFixed(2)}, ${player.pos.z.toFixed(2)}  cell ${c.cx},${c.cy}`,
        `gait    ${player.gait}${player.crouched ? ' (crouched)' : ''}  ${player.speed.toFixed(2)} m/s`,
        `noise   ${player.noiseRadius} m  input ${input.isTouchMode ? 'touch' : 'kbm'}`,
        `light   ${exposure.toFixed(2)}`,
        flashlights.debugLine(),
        ...guards.guards.map((g, i) => {
          const m = perception.memory.markers[i];
          const seen = perception.results[i]?.kind ?? '-';
          const map = m?.visible ? `map ${m.alpha.toFixed(2)}` : 'map -';
          return `g${g.id}      ${g.state.padEnd(10)} ${g.awareness.value.toFixed(0).padStart(3)}  ${seen.padEnd(6)} ${map}${g.seesPlayer ? '  sees you' : ''}`;
        }),
        `[N] light/nav heatmap ${debugAi?.heatmapVisible ? 'on' : 'off'}`,
      ];
    },
  };
}
