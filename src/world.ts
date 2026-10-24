// A playable world: the long-lived scene, input, HUD, audio and visuals, hosting one level at a time and
// one Mission (the pure sim of the current attempt) on it. Loading a level swaps only the level's meshes,
// grid and Mission: guard and flashlight visuals are sized for LEVEL_LIMITS.maxGuards once, so the scene's
// light count (and with it every compiled shader) survives level switches. Same update/render shape as
// the Phase 0 perf scene so main.ts can drive either.

import type * as THREE from 'three';
import { GameAudio } from './audio/game-audio';
import type { QualityTier } from './config/quality';
import { KNIFE, LEVEL_LIMITS, MISSION } from './config/tunables';
import { gloveLook, knifeLook } from './config/unlocks';
import { Rng } from './core/rng';
import { InputManager } from './input/input-manager';
import type { LoadedLevel } from './level/loader';
import { DEFAULT_THEME } from './level/kit';
import { buildLevelMesh, type LevelMesh } from './level/mesh-builder';
import { Flashlights, type FlashlightState } from './lighting/flashlights';
import { Mission, type ViewLens } from './mission/mission';
import { NO_MODIFIERS, type MissionModifiers } from './mission/modifiers';
import { applyCameraFx, applyCameraRig } from './player/camera-rig';
import type { PlayerController } from './player/controller';
import { ViewmodelAnimator } from './player/viewmodel';
import type { DebugAi } from './render/debug-ai';
import type { ThemeAssets } from './render/assets';
import { deathClipFor } from './render/guard-anim';
import type { GuardModel } from './render/guard-models';
import { guardFlashlight, GuardVisuals } from './render/guard-visuals';
import { MissionProps } from './render/mission-props';
import { createSessionScene } from './render/level-scene';
import { ViewmodelMesh } from './render/viewmodel-mesh';
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
  /** Drawn after the world over a cleared depth buffer (the first-person viewmodel). */
  overlay?: { scene: THREE.Scene; camera: THREE.Camera };
}

export interface GameWorld extends World {
  readonly input: InputManager;
  /** The level on stage. */
  readonly level: LoadedLevel;
  /** The current attempt; replaced on restart and on a level change. */
  readonly mission: Mission;
  readonly player: PlayerController;
  /** Unlocked by main.ts on the first user gesture; suspended with the host. */
  readonly audio: GameAudio;
  /** While true, look input is discarded (menus, rotate prompt). */
  paused: boolean;
  applySettings(settings: Settings): void;
  /** Put another level on stage, with a first attempt using `mods`. */
  loadLevel(level: LoadedLevel, mods?: Readonly<MissionModifiers>): void;
  /** Start the level over: a fresh Mission (with new `mods` if given); scene, HUD and audio are kept. */
  restart(mods?: Readonly<MissionModifiers>): void;
  /** Hide the in-game HUD and the viewmodel (menus, the result screen). */
  setHudVisible(visible: boolean): void;
  /** Paint the viewmodel with these knife and glove skins (unlock ids). */
  setLoadout(knife: string, glove: string): void;
  /** The skinned guard model has loaded: it replaces the capsules. */
  setGuardModel(model: GuardModel): void;
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
  /** Per-theme environment materials (textured once their trim sheets load). */
  themes: ThemeAssets;
}

/** Per-level sim seed: the same level always replays the same, whatever was played before it. */
function levelSeed(seed: number, id: string): number {
  let h = 0x811c9dc5 ^ seed;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

export function createGameWorld(first: LoadedLevel, opts: GameWorldOptions): GameWorld {
  const { scene, camera } = createSessionScene();
  const capacity = LEVEL_LIMITS.maxGuards;
  const visualRng = new Rng(opts.seed).fork();
  const input = new InputManager(opts.canvas, opts.uiRoot, opts.startInTouchMode);
  const look = { yaw: 0, pitch: 0 };
  const lens: ViewLens = { vFov: 0, aspect: 1 };

  const flashlights = new Flashlights(scene, first.grid, capacity, opts.tier, () =>
    visualRng.next(),
  );
  const guardVisuals = new GuardVisuals(capacity);
  const props = new MissionProps();
  scene.add(guardVisuals.group, props.group);
  const viewmodel = new ViewmodelMesh();
  const hands = new ViewmodelAnimator();
  let handsVisible = true;
  /** A bottle left the hand since the last rendered frame. */
  let threw = false;
  const hud = new Hud(opts.uiRoot, first.grid, capacity);
  const audio = new GameAudio(first.grid, () => visualRng.next());
  audio.applyTier(opts.tier);
  let settings: Settings | null = null;

  // Per-level state, replaced by load().
  let level = first;
  let levelMesh: LevelMesh | null = null;
  let seed = 0;
  let mods: Readonly<MissionModifiers> = NO_MODIFIERS;
  let mission!: Mission;
  /** ?debug=1 [G]: kept across restarts and levels. */
  let godMode = false;
  let exitOpen = true;
  /** Per-frame interpolated flashlights, one per guard of the current level. */
  let lights: FlashlightState[] = [];

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

  let debugAi: DebugAi | null = null;
  let debugAiModule: typeof import('./render/debug-ai') | null = null;
  const rebuildDebugAi = () => {
    debugAi?.dispose();
    debugAi = debugAiModule
      ? new debugAiModule.DebugAi(
          scene,
          level.grid,
          mission.guards.guards,
          mission.lamps,
          opts.uiRoot,
        )
      : null;
  };
  if (opts.debug) {
    void import('./render/debug-ai').then((m) => {
      debugAiModule = m;
      rebuildDebugAi();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyG') godMode = mission.godMode = !godMode;
    });
  }

  /** A fresh attempt on the current level. */
  const begin = () => {
    mission = new Mission(level, new Rng(seed), mods);
    mission.godMode = godMode;
    if (settings) mission.player.invertY = settings.invertY;
    input.releaseAll();
    hud.reset();
    audio.attach(mission.guards, mission.events);
    mission.events.on('hit', ({ guard }) => hud.hit(guard.pos.x, guard.pos.z));
    mission.events.on('throw', () => (threw = true));
    mission.events.on('kill', ({ guard }) => {
      const p = mission.player.pos;
      const i = mission.guards.guards.indexOf(guard);
      guardVisuals.setDeath(i, deathClipFor(guard.yaw, guard.pos.x, guard.pos.z, p.x, p.z));
    });
    guardVisuals.reset();
    applyCameraRig(camera, mission.player, 1);
  };

  const load = (next: LoadedLevel, nextMods: Readonly<MissionModifiers>) => {
    levelMesh?.group.removeFromParent();
    levelMesh?.dispose();
    level = next;
    seed = levelSeed(opts.seed, next.data.id);
    mods = nextMods;
    const material = opts.themes.material(next.data.theme ?? DEFAULT_THEME);
    levelMesh = buildLevelMesh(next.data, next.grid, material, opts.debug);
    scene.add(levelMesh.group);
    exitOpen = true;
    flashlights.setGrid(next.grid);
    hud.setGrid(next.grid);
    audio.setGrid(next.grid);
    lights = next.data.guards.map(() => ({
      id: 0,
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      pitch: 0,
      intensity: 0,
    }));
    begin();
    rebuildDebugAi();
  };
  load(first, NO_MODIFIERS);

  return {
    scene,
    camera,
    overlay: { scene: viewmodel.scene, camera: viewmodel.camera },
    input,
    audio,
    paused: false,
    get level() {
      return level;
    },
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
      const looking = !this.paused && !mission.outcome;
      if (looking) player.applyLook(look.yaw, look.pitch);
      const stab = mission.lockTimer > 0 ? 1 - mission.lockTimer / KNIFE.lockS : 0;
      const fall =
        mission.outcome === 'failed' ? Math.min(1, mission.endedFor / MISSION.failDelayS) : 0;
      applyCameraRig(camera, player, alpha);
      applyCameraFx(camera, stab, fall);
      const pose = hands.update({
        dt: frameDt,
        speed: player.speed,
        gait: player.gait,
        crouched: player.crouched,
        lookYaw: looking ? look.yaw : 0,
        lookPitch: looking ? look.pitch : 0,
        stab,
        threw,
        ready: mission.knifeTarget >= 0,
        fall,
      });
      threw = false;
      viewmodel.update(pose, camera.aspect, mission.exposure, handsVisible);
      guards.guards.forEach((g, i) =>
        guardFlashlight(g, alpha, mission.time, lights[i] as FlashlightState),
      );
      // Guards first: skinned guards move each beam's start to the flashlight in their hand.
      guardVisuals.update(guards.guards, lights, alpha, frameDt, camera);
      flashlights.update(lights, camera, frameDt, mission.time, opts.pixelRatio());
      const itemLeft = mission.item && !mission.itemTaken ? mission.item : null;
      props.update(frameDt, alpha, mission.bottle, itemLeft);
      if (exitOpen !== !itemLeft) levelMesh?.setExitOpen((exitOpen = !itemLeft));

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
      opts.themes.applyTier(tier);
      flashlights.applyTier(tier);
      audio.applyTier(tier);
    },
    applySettings(next) {
      settings = next;
      input.apply(next);
      mission.player.invertY = next.invertY;
      hud.minimapMode = next.minimapMode;
      audio.manager.setVolume(next.volumeMaster, next.volumeSfx, next.volumeMusic);
    },
    loadLevel(next, nextMods = NO_MODIFIERS) {
      load(next, nextMods);
    },
    setHudVisible(visible) {
      hud.visible = visible;
      handsVisible = visible;
    },
    setGuardModel(model) {
      guardVisuals.setModel(model);
    },
    setLoadout(knife, glove) {
      viewmodel.setKnife(knifeLook(knife));
      viewmodel.setGlove(gloveLook(glove));
    },
    restart(nextMods) {
      if (nextMods) mods = nextMods;
      begin();
      debugAi?.setGuards(mission.guards.guards);
    },
    debugLines() {
      const { player, guards, perception } = mission;
      const c = level.grid.worldToCell(player.pos.x, player.pos.z);
      return [
        `level   ${level.data.id}`,
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
