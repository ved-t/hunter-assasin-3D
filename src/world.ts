// A playable world: the long-lived scene, input, HUD, audio and visuals around one Mission (the pure sim
// of the current attempt), behind the same update/render shape as the Phase 0 perf scene so main.ts can
// drive either.

import type * as THREE from 'three';
import { GameAudio } from './audio/game-audio';
import type { QualityTier } from './config/quality';
import { KNIFE, MISSION } from './config/tunables';
import { Rng } from './core/rng';
import { InputManager } from './input/input-manager';
import type { LoadedLevel } from './level/loader';
import { Flashlights, type FlashlightState } from './lighting/flashlights';
import { Mission, type ViewLens } from './mission/mission';
import { applyCameraFx, applyCameraRig } from './player/camera-rig';
import type { PlayerController } from './player/controller';
import type { DebugAi } from './render/debug-ai';
import { guardFlashlight, GuardVisuals } from './render/guard-visuals';
import { MissionProps } from './render/mission-props';
import { createLevelScene } from './render/level-scene';
import type { Settings } from './save/settings';
import { Hud, type HudFrame } from './ui/hud';

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
  /** Hide the in-game HUD (behind the result screen). */
  setHudVisible(visible: boolean): void;
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
  const { scene, camera, setExitOpen } = createLevelScene(level, opts.debug);
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
  const props = new MissionProps();
  scene.add(guardVisuals.group, props.group);
  let exitOpen = true;
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
  let settings: Settings | null = null;
  const frame: HudFrame = {
    pose: { x: 0, z: 0, yaw: 0 },
    exposure: 0,
    markers: [],
    guards: [],
    hp: 0,
    objective: '',
    bottles: '',
    prompt: null,
  };
  const listener = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };

  /** Hook the views up to an attempt's events (a new Mission brings new emitters). */
  const bind = (m: Mission) => {
    audio.attach(m.guards);
    m.events.on('hit', ({ guard }) => hud.hit(guard.pos.x, guard.pos.z));
  };
  bind(mission);

  let debugAi: DebugAi | null = null;
  if (opts.debug) {
    void import('./render/debug-ai').then(({ DebugAi }) => {
      debugAi = new DebugAi(scene, grid, mission.guards.guards, mission.lamps, opts.uiRoot);
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyG') mission.godMode = !mission.godMode;
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
      if (!this.paused && !mission.outcome) player.applyLook(look.yaw, look.pitch);
      applyCameraRig(camera, player, alpha);
      applyCameraFx(
        camera,
        mission.lockTimer > 0 ? 1 - mission.lockTimer / KNIFE.lockS : 0,
        mission.outcome === 'failed' ? Math.min(1, mission.endedFor / MISSION.failDelayS) : 0,
      );
      guards.guards.forEach((g, i) =>
        guardFlashlight(g, alpha, mission.time, lights[i] as FlashlightState),
      );
      flashlights.update(lights, camera, frameDt, mission.time, opts.pixelRatio());
      guardVisuals.update(guards.guards, lights, alpha, camera);
      const itemLeft = mission.item && !mission.itemTaken ? mission.item : null;
      props.update(frameDt, alpha, mission.bottle, itemLeft);
      if (exitOpen !== !itemLeft) setExitOpen((exitOpen = !itemLeft));

      const touch = input.isTouchMode;
      frame.pose.x = listener.x = camera.position.x;
      frame.pose.z = listener.z = camera.position.z;
      frame.pose.yaw = listener.yaw = player.yaw;
      listener.y = camera.position.y;
      listener.pitch = player.pitch;
      frame.exposure = mission.exposure;
      frame.markers = perception.memory.markers;
      frame.guards = guards.guards;
      frame.hp = mission.health.hp;
      frame.objective = mission.objectiveLabel;
      frame.bottles = `${touch ? '' : 'F · '}Bottles ×${mission.bottles}`;
      frame.prompt = !touch && mission.knifeTarget >= 0 ? 'E · Takedown' : null;
      hud.update(frameDt, frame);
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
    setHudVisible(visible) {
      hud.visible = visible;
    },
    restart() {
      const godMode = mission.godMode;
      mission = newMission();
      mission.godMode = godMode;
      if (settings) mission.player.invertY = settings.invertY;
      input.releaseAll();
      hud.reset();
      bind(mission);
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
        `hp      ${mission.health.hp}${mission.godMode ? ' (god)' : ''}  bottles ${mission.bottles}  knife ${mission.knifeTarget < 0 ? '-' : `g${mission.knifeTarget}`}`,
        `goal    ${mission.objectiveLabel}  ${mission.time.toFixed(1)} s${mission.outcome ? `  ${mission.outcome}` : ''}`,
        flashlights.debugLine(),
        ...guards.guards.map((g, i) => {
          const m = perception.memory.markers[i];
          const seen = perception.results[i]?.kind ?? '-';
          const map = m?.visible ? `map ${m.alpha.toFixed(2)}` : 'map -';
          const gun = g.gun.phase === 'windup' ? `  aim ${g.gun.windupFraction.toFixed(1)}` : '';
          const state = g.dead ? 'dead' : g.state;
          return `g${g.id}      ${state.padEnd(10)} ${g.awareness.value.toFixed(0).padStart(3)}  ${seen.padEnd(6)} ${map}${g.seesPlayer ? '  sees you' : ''}${gun}`;
        }),
        `[N] light/nav heatmap ${debugAi?.heatmapVisible ? 'on' : 'off'}  [G] god mode`,
      ];
    },
  };
}
