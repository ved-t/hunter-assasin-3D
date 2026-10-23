// A playable world: the long-lived scene, input, HUD, audio and visuals around one Mission (the pure sim
// of the current attempt), behind the same update/render shape as the Phase 0 perf scene so main.ts can
// drive either.

import type * as THREE from 'three';
import { GameAudio } from './audio/game-audio';
import type { QualityTier } from './config/quality';
import { Rng } from './core/rng';
import { InputManager } from './input/input-manager';
import type { LoadedLevel } from './level/loader';
import { Flashlights, type FlashlightState } from './lighting/flashlights';
import { Mission, type ViewLens } from './mission/mission';
import { applyCameraRig } from './player/camera-rig';
import type { PlayerController } from './player/controller';
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
  /** The current attempt; replaced on restart. */
  readonly mission: Mission;
  readonly player: PlayerController;
  /** Unlocked by main.ts on the first user gesture; suspended with the host. */
  readonly audio: GameAudio;
  /** While true, look input is discarded (menus, rotate prompt). */
  paused: boolean;
  applySettings(settings: Settings): void;
  /** Start the level over: a fresh Mission; the scene, HUD and audio are kept. */
  restart(): void;
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
  // Every attempt gets the same seed, so a retry replays the same guard behaviour.
  const missionSeed = rng.int(0, 0xffffffff);
  const newMission = () => new Mission(level, new Rng(missionSeed));
  let mission = newMission();
  const input = new InputManager(opts.canvas, opts.uiRoot, opts.startInTouchMode);
  const look = { yaw: 0, pitch: 0 };
  const lens: ViewLens = { vFov: 0, aspect: 1 };
  applyCameraRig(camera, mission.player, 1);

  const count = data.guards.length;
  const visualRng = rng.fork();
  const flashlights = new Flashlights(scene, grid, count, opts.tier, () => visualRng.next());
  const guardVisuals = new GuardVisuals(count);
  scene.add(guardVisuals.group);
  // Per-frame interpolated flashlights, for visuals.
  const lights: FlashlightState[] = Array.from({ length: count }, () => ({
    id: 0,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
    intensity: 0,
  }));

  const hud = new Hud(opts.uiRoot, grid, count);
  const audio = new GameAudio(grid, () => visualRng.next());
  audio.applyTier(opts.tier);
  audio.attach(mission.guards);
  let settings: Settings | null = null;
  const hudPose = { x: 0, z: 0, yaw: 0 };
  const listener = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };

  let debugAi: DebugAi | null = null;
  if (opts.debug) {
    void import('./render/debug-ai').then(({ DebugAi }) => {
      debugAi = new DebugAi(scene, grid, mission.guards.guards, mission.lamps, opts.uiRoot);
    });
  }

  return {
    scene,
    camera,
    input,
    audio,
    paused: false,
    get mission() {
      return mission;
    },
    get player() {
      return mission.player;
    },
    update(dt) {
      input.pollMovement();
      lens.vFov = (camera.fov * Math.PI) / 180;
      lens.aspect = camera.aspect;
      mission.step(dt, input.state, lens);
      const { player } = mission;
      if (player.footstep > 0) {
        hud.noise(player.pos.x, player.pos.z, player.footstep);
        audio.playerStep(player.gait);
      }
    },
    render(alpha, frameDt) {
      const { player, guards, perception } = mission;
      input.flushLook(frameDt);
      input.state.consumeLook(look);
      if (!this.paused) player.applyLook(look.yaw, look.pitch);
      applyCameraRig(camera, player, alpha);
      guards.guards.forEach((g, i) =>
        guardFlashlight(g, alpha, mission.time, lights[i] as FlashlightState),
      );
      flashlights.update(lights, camera, frameDt, mission.time, opts.pixelRatio());
      guardVisuals.update(guards.guards, lights, alpha, camera);

      hudPose.x = listener.x = camera.position.x;
      hudPose.z = listener.z = camera.position.z;
      hudPose.yaw = listener.yaw = player.yaw;
      listener.y = camera.position.y;
      listener.pitch = player.pitch;
      hud.update(frameDt, hudPose, mission.exposure, perception.memory.markers, guards.guards);
      audio.update(frameDt, listener, guards.guards);
      debugAi?.update(alpha, frameDt, camera, mission.beams, perception.results);
    },
    applyTier(tier) {
      flashlights.applyTier(tier);
      audio.applyTier(tier);
    },
    applySettings(next) {
      settings = next;
      input.apply(next);
      mission.player.invertY = next.invertY;
      hud.minimapMode = next.minimapMode;
    },
    restart() {
      const godMode = mission.godMode;
      mission = newMission();
      mission.godMode = godMode;
      if (settings) mission.player.invertY = settings.invertY;
      input.releaseAll();
      hud.reset();
      audio.attach(mission.guards);
      debugAi?.setGuards(mission.guards.guards);
      applyCameraRig(camera, mission.player, 1);
    },
    debugLines() {
      const { player, guards, perception } = mission;
      const c = grid.worldToCell(player.pos.x, player.pos.z);
      return [
        `level   ${data.id}`,
        `pos     ${player.pos.x.toFixed(2)}, ${player.pos.z.toFixed(2)}  cell ${c.cx},${c.cy}`,
        `gait    ${player.gait}${player.crouched ? ' (crouched)' : ''}  ${player.speed.toFixed(2)} m/s`,
        `noise   ${player.noiseRadius} m  input ${input.isTouchMode ? 'touch' : 'kbm'}`,
        `light   ${mission.exposure.toFixed(2)}`,
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
