// Boot: platform init → settings → tier → renderer → level → world → loop → fps probe. Menu arrives in Phase 5.

import './styles.css';
import type { QualityTier } from './config/quality';
import { nextLevelId } from './config/campaign';
import { MISSION } from './config/tunables';
import { requestGyroPermission } from './input/gyro';
import { LevelLoadError, loadLevel } from './level/loader';
import { parseDebugFlags } from './core/debug-flags';
import { GameLoop } from './core/loop';
import { Rng } from './core/rng';
import { createPlatform } from './platform';
import {
  applyTier,
  createRenderer,
  handleContextLoss,
  markMaterialsDirty,
  queryGpu,
  resizeToCanvas,
  simulateContextLoss,
  watchResize,
} from './render/renderer';
import { createTestScene } from './render/test-scene';
import { FpsProbe, guessTier, tierAfterProbe } from './render/tier-detect';
import { loadSettings, saveSettings, type Settings } from './save/settings';
import type { DebugOverlay } from './ui/debug-overlay';
import { createOverlay } from './ui/overlay';
import { createPlayHint } from './ui/play-hint';
import { ResultScreen } from './ui/result-screen';
import { setupRotateOverlay } from './ui/rotate-overlay';
import { SettingsPanel } from './ui/settings-panel';
import { TouchControls } from './ui/touch-controls';
import { createGameWorld, type GameWorld, type World } from './world';

type TierSource = 'url' | 'settings' | 'guess' | 'probe';
type PauseReason = 'rotate' | 'menu' | 'result';

const PERF_LEVEL_ID = 'perf';

const CONTEXT_LOSS_TEST_DELAY_MS = 1000;

function fatal(root: HTMLElement, message: string): void {
  const overlay = createOverlay(root, 'fatal-overlay', '');
  overlay.element.textContent = message;
  overlay.show();
}

async function boot(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const uiRoot = document.getElementById('ui-root') as HTMLElement;
  const flags = parseDebugFlags(window.location.search);

  const platform = createPlatform(flags.debug);
  await platform.init();
  platform.loadingStart();
  let settings = await loadSettings(platform.storage);

  // Tier: URL flag > saved override > hardware guess (then refined by the fps probe).
  const gpuInfo = queryGpu();
  if (!gpuInfo) {
    fatal(uiRoot, 'This game needs WebGL 2, which your browser or device does not support.');
    return;
  }
  const gpu = gpuInfo.name;
  let tier: QualityTier;
  let tierSource: TierSource;
  if (flags.tier) {
    tier = flags.tier;
    tierSource = 'url';
  } else if (settings.quality !== 'auto') {
    tier = settings.quality;
    tierSource = 'settings';
  } else {
    tier = guessTier({
      gpu,
      isMobile: platform.isMobile,
      cores: navigator.hardwareConcurrency || 0,
      memoryGb: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 0,
    });
    tierSource = 'guess';
  }

  const ctx = createRenderer(canvas, tier, platform.isMobile);

  let world: World;
  let game: GameWorld | null = null;
  if (flags.level === PERF_LEVEL_ID) {
    const perf = createTestScene(new Rng(flags.seed), tier);
    world = { ...perf, render: (alpha) => perf.render(alpha), debugLines: () => [] };
  } else {
    let level;
    try {
      level = await loadLevel(flags.level);
    } catch (err) {
      console.error(err);
      fatal(uiRoot, err instanceof LevelLoadError ? err.message : 'Could not load the level.');
      return;
    }
    game = createGameWorld(level, {
      canvas,
      uiRoot,
      debug: flags.debug,
      startInTouchMode: platform.isMobile,
      tier: ctx.tier,
      seed: flags.seed,
      pixelRatio: () => ctx.renderer.getPixelRatio(),
    });
    game.applySettings(settings);
    world = game;
    // ?debug=1 only: a handle for console poking and scripted (CDP) playtests.
    if (flags.debug) (window as Window & { __shadowHunter?: unknown }).__shadowHunter = { game };
  }
  watchResize(ctx, world.camera);

  let debugOverlay: DebugOverlay | null = null;
  if (flags.debug) {
    const { DebugOverlay } = await import('./ui/debug-overlay');
    debugOverlay = new DebugOverlay(uiRoot);
  }

  let probe = tierSource === 'guess' ? new FpsProbe() : null;

  const loop = new GameLoop({
    update: (dt) => world.update(dt),
    render: (alpha, frameDt) => {
      world.render(alpha, frameDt);
      if (game && touchControls) {
        touchControls.setCrouched(game.player.crouched);
        touchControls.setContext(game.mission.knifeTarget >= 0);
        touchControls.setBottles(game.mission.bottles);
      }
      if (game?.mission.outcome && !result?.isOpen) {
        const { outcome, endedFor } = game.mission;
        if (endedFor >= (outcome === 'won' ? MISSION.winDelayS : MISSION.failDelayS)) showResult();
      }
      ctx.renderer.info.reset();
      ctx.renderer.render(world.scene, world.camera);

      if (probe?.push(frameDt * 1000)) {
        const next = tierAfterProbe(ctx.tier, probe.medianFps());
        if (flags.debug) {
          console.info(`[tier] probe median ${probe.medianFps().toFixed(1)} fps → ${next}`);
        }
        if (next !== ctx.tier) {
          applyTier(ctx, next);
          world.applyTier(next);
          markMaterialsDirty(world.scene);
          resizeToCanvas(ctx, world.camera);
          tierSource = 'probe';
        }
      }

      debugOverlay?.update(frameDt, {
        stats: loop.stats,
        time: loop.time,
        renderer: ctx.renderer,
        tier: ctx.tier,
        tierSource,
        gpu,
        platform: platform.name,
        simPaused: loop.simPaused,
        extra: world.debugLines(),
      });
    },
  });

  // Pausing: host pause (tab hidden / ads) stops the loop; the rotate prompt and menus only freeze the sim.
  let hostPaused = false;
  let contextLost = false;
  const pauseReasons = new Set<PauseReason>();
  const setPaused = (reason: PauseReason, on: boolean) => {
    if (on) pauseReasons.add(reason);
    else pauseReasons.delete(reason);
    loop.simPaused = pauseReasons.size > 0;
    if (game) game.paused = loop.simPaused;
    if (on) game?.input.releaseAll();
    updatePlayHint();
  };
  const resumeIfAllowed = () => {
    if (!hostPaused && !contextLost) loop.start();
  };
  platform.onPause(() => {
    hostPaused = true;
    game?.input.releaseAll();
    game?.audio.manager.suspend();
    loop.stop();
  });
  platform.onResume(() => {
    hostPaused = false;
    game?.audio.manager.resume();
    resumeIfAllowed();
  });
  // Browsers keep audio locked until a user gesture; every tap, click or key retries the unlock.
  if (game) {
    const unlockAudio = () => game?.audio.manager.unlock();
    window.addEventListener('pointerdown', unlockAudio, { capture: true });
    window.addEventListener('keydown', unlockAudio, { capture: true });
  }

  // Settings / pause panel, touch buttons and the desktop click-to-play hint.
  const kbm = game?.input.keyboardMouse ?? null;
  const playHint = createPlayHint(uiRoot);
  function updatePlayHint(): void {
    playHint.set(
      !!game &&
        !game.input.isTouchMode &&
        !kbm?.locked &&
        !panel.isOpen &&
        !result?.isOpen &&
        !pauseReasons.has('rotate'),
    );
  }
  const panel = new SettingsPanel(uiRoot, settings, {
    gyroAvailable: navigator.maxTouchPoints > 0,
    requestGyro: requestGyroPermission,
    onChange: (next) => {
      applySettingsChange(settings, next);
      settings = next;
      void saveSettings(platform.storage, next);
    },
    onResume: () => {
      setPaused('menu', false);
      if (game && !game.input.isTouchMode) void kbm?.lock().then(updatePlayHint);
    },
  });
  const openMenu = () => {
    if (panel.isOpen || result?.isOpen) return;
    kbm?.unlock();
    panel.open();
    setPaused('menu', true);
  };
  function applySettingsChange(prev: Settings, next: Settings): void {
    game?.applySettings(next);
    if (next.quality !== prev.quality && next.quality !== 'auto' && next.quality !== ctx.tier) {
      applyTier(ctx, next.quality);
      world.applyTier(next.quality);
      markMaterialsDirty(world.scene);
      resizeToCanvas(ctx, world.camera);
      tierSource = 'settings';
      probe = null; // a manual choice wins over the startup probe
    }
  }

  let touchControls: TouchControls | null = null;
  if (game) {
    const g = game;
    touchControls = new TouchControls(uiRoot, {
      onCrouch: () => (g.input.state.crouchToggle = true),
      onContext: () => (g.input.state.context = true),
      onThrow: () => (g.input.state.throw = true),
      onSettings: openMenu,
    });
    touchControls.visible = g.input.isTouchMode;
    g.input.onTouchModeChange = (touch) => {
      touchControls!.visible = touch && !result?.isOpen;
      updatePlayHint();
    };
    if (kbm) {
      kbm.onUnlock = openMenu;
      document.addEventListener('pointerlockchange', updatePlayHint);
    }
  }
  window.addEventListener('keydown', (e) => {
    // With Pointer Lock held, Esc releases it and onUnlock opens the menu; this covers the unlocked case.
    if (e.code === 'Escape' && game && !kbm?.locked && !panel.isOpen) openMenu();
    if (e.code === 'KeyR' && !e.repeat && result?.isOpen) retry();
  });

  // Win / fail screen. Retry restarts in place (no reload); Next loads the following level.
  const nextLevel = nextLevelId(flags.level);
  const result = game
    ? new ResultScreen(uiRoot, {
        onRetry: retry,
        onNext: () => {
          if (!nextLevel) return;
          const params = new URLSearchParams(window.location.search);
          params.set('level', nextLevel);
          window.location.search = params.toString();
        },
      })
    : null;
  function showResult(): void {
    const r = game?.mission.result;
    if (!game || !r || !result) return;
    kbm?.unlock();
    game.setHudVisible(false);
    if (touchControls) touchControls.visible = false;
    setPaused('result', true);
    const level = game.mission.level.data;
    result.show(r, level.guards.length, level.parTimeS, nextLevel !== null);
  }
  /** From a click or key press, so Pointer Lock can be taken straight back. */
  function retry(): void {
    if (!game || !result?.isOpen) return;
    result.hide();
    game.restart();
    game.setHudVisible(true);
    if (touchControls) touchControls.visible = game.input.isTouchMode;
    setPaused('result', false);
    if (!game.input.isTouchMode) void kbm?.lock().then(updatePlayHint);
  }

  setPaused(
    'rotate',
    setupRotateOverlay(uiRoot, (blocked) => setPaused('rotate', blocked)),
  );

  const lostOverlay = createOverlay(
    uiRoot,
    'context-lost-overlay',
    '<div>Restoring graphics…</div>',
  );
  handleContextLoss(canvas, {
    onLost: () => {
      contextLost = true;
      game?.input.releaseAll();
      loop.stop();
      lostOverlay.show();
    },
    onRestored: () => {
      contextLost = false;
      lostOverlay.hide();
      resizeToCanvas(ctx, world.camera);
      resumeIfAllowed();
    },
  });

  if (flags.debug) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyL' && !contextLost) {
        simulateContextLoss(ctx.renderer, CONTEXT_LOSS_TEST_DELAY_MS);
      }
    });
  }

  platform.loadingStop();
  loop.start();
  platform.gameplayStart();
}

boot().catch((err: unknown) => {
  console.error(err);
  const root = document.getElementById('ui-root');
  if (root) fatal(root, 'Something went wrong while starting the game. Please reload.');
});
