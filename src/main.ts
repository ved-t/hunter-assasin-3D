// Boot: platform init → settings and progress → tier → renderer → world (with a level on stage) → loop →
// main menu. ?level=<id> skips the menu and plays that level straight away.

import './styles.css';
import { CAMPAIGN, nextLevelId } from './config/campaign';
import { TIER_SETTINGS, type QualityTier } from './config/quality';
import { MISSION } from './config/tunables';
import { requestGyroPermission } from './input/gyro';
import { DEFAULT_THEME } from './level/kit';
import { LevelLoadError, loadLevel } from './level/loader';
import type { LevelData, Theme } from './level/types';
import { parseDebugFlags } from './core/debug-flags';
import { GameLoop } from './core/loop';
import { Rng } from './core/rng';
import { createPlatform } from './platform';
import { ThemeAssets } from './render/assets';
import type { PostFx } from './render/post';
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
import {
  loadProgress,
  modifiersFor,
  nextToPlay,
  recordWin,
  saveProgress,
  totalStars,
  type Progress,
  type WinReward,
} from './save/progress';
import { loadSettings, saveSettings, type Settings } from './save/settings';
import type { DebugOverlay } from './ui/debug-overlay';
import { LevelIntro } from './ui/level-intro';
import { LevelSelect } from './ui/level-select';
import { LoadingScreen } from './ui/loading-screen';
import { Loadout } from './ui/loadout';
import { MainMenu } from './ui/main-menu';
import { createOverlay } from './ui/overlay';
import { createPlayHint } from './ui/play-hint';
import { ResultScreen } from './ui/result-screen';
import { setupRotateOverlay } from './ui/rotate-overlay';
import { SettingsPanel, type SettingsPanelMode } from './ui/settings-panel';
import { TouchControls } from './ui/touch-controls';
import { createGameWorld, type GameWorld, type World } from './world';

type TierSource = 'url' | 'settings' | 'guess' | 'probe';
/** Why the sim is frozen: the rotate prompt, the pause panel, the result screen, the menus, loading. */
type PauseReason = 'rotate' | 'menu' | 'result' | 'title' | 'loading';

const PERF_LEVEL_ID = 'perf';

const CONTEXT_LOSS_TEST_DELAY_MS = 1000;

function fatal(root: HTMLElement, message: string): void {
  const overlay = createOverlay(root, 'fatal-overlay', '');
  overlay.element.textContent = message;
  overlay.show();
}

const themeOf = (level: LevelData): Theme => level.theme ?? DEFAULT_THEME;

function levelName(id: string): string {
  return CAMPAIGN.find((l) => l.id === id)?.name ?? id;
}

async function boot(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const uiRoot = document.getElementById('ui-root') as HTMLElement;
  const flags = parseDebugFlags(window.location.search);

  const platform = createPlatform(flags.debug);
  await platform.init();
  platform.loadingStart();
  let settings = await loadSettings(platform.storage);
  let progress = await loadProgress(platform.storage);

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
  const themes = new ThemeAssets(ctx.renderer, ctx.tier);

  let world: World;
  let game: GameWorld | null = null;
  if (flags.level === PERF_LEVEL_ID) {
    const perf = createTestScene(new Rng(flags.seed), tier);
    world = { ...perf, render: (alpha) => perf.render(alpha), debugLines: () => [] };
  } else {
    // The level asked for, or behind the menu the one Play would start.
    let level;
    try {
      level = await loadLevel(flags.level ?? nextToPlay(progress));
      // The first theme is part of the initial download; a failed load leaves it flat, not broken.
      await themes.load(themeOf(level.data));
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
      themes,
    });
    game.applySettings(settings);
    game.restart(modifiersFor(progress));
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

  // High-tier post (bloom, vignette, grain): its module loads only when a tier asks for it.
  let post: PostFx | null = null;
  let postTier = ctx.tier;
  const updatePost = (next: QualityTier) => {
    postTier = next;
    if (!TIER_SETTINGS[next].postFx) {
      post?.dispose();
      post = null;
      return;
    }
    if (post) return;
    void import('./render/post').then(({ PostFx }) => {
      if (post || !TIER_SETTINGS[postTier].postFx) return;
      post = new PostFx(ctx.renderer, world.scene, world.camera, TIER_SETTINGS[postTier].antialias);
    });
  };
  updatePost(ctx.tier);

  const loop = new GameLoop({
    update: (dt) => world.update(dt),
    render: (alpha, frameDt) => {
      world.render(alpha, frameDt);
      if (!loop.simPaused) intro.update(frameDt);
      if (game && touchControls) {
        touchControls.setCrouched(game.player.crouched);
        touchControls.setContext(game.mission.knifeTarget >= 0);
        touchControls.setBottles(game.mission.bottles);
      }
      if (game?.mission.outcome && inLevel && !result?.isOpen) {
        const { outcome, endedFor } = game.mission;
        if (endedFor >= (outcome === 'won' ? MISSION.winDelayS : MISSION.failDelayS)) showResult();
      }
      ctx.renderer.info.reset();
      if (post) post.render(frameDt);
      else ctx.renderer.render(world.scene, world.camera);

      if (probe?.push(frameDt * 1000)) {
        const next = tierAfterProbe(ctx.tier, probe.medianFps());
        if (flags.debug) {
          console.info(`[tier] probe median ${probe.medianFps().toFixed(1)} fps → ${next}`);
        }
        if (next !== ctx.tier) {
          applyTier(ctx, next);
          world.applyTier(next);
          updatePost(next);
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

  // Pausing: host pause (tab hidden / ads) stops the loop; prompts, menus and loading only freeze the sim.
  // The portal hears "gameplay" only while nothing at all holds the sim.
  let hostPaused = false;
  let contextLost = false;
  let gameplayActive = false;
  // Boot starts behind the menu; enterLevel() or showTitle() decides from there.
  const pauseReasons = new Set<PauseReason>(['title']);
  const setPaused = (reason: PauseReason, on: boolean) => {
    if (on) pauseReasons.add(reason);
    else pauseReasons.delete(reason);
    loop.simPaused = pauseReasons.size > 0;
    if (game) game.paused = loop.simPaused;
    if (on) game?.input.releaseAll();
    const active = !!game && pauseReasons.size === 0;
    if (active !== gameplayActive) {
      gameplayActive = active;
      if (active) platform.gameplayStart();
      else platform.gameplayStop();
    }
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

  /** True while a level is being played (paused or not); false in the menus. */
  let inLevel = false;
  let panelMode: SettingsPanelMode = 'pause';

  // Settings / pause panel, touch buttons and the desktop click-to-play hint.
  const kbm = game?.input.keyboardMouse ?? null;
  const playHint = createPlayHint(uiRoot);
  function updatePlayHint(): void {
    playHint.set(
      !!game &&
        inLevel &&
        !game.input.isTouchMode &&
        !kbm?.locked &&
        !panel.isOpen &&
        !result?.isOpen &&
        !pauseReasons.has('rotate') &&
        !pauseReasons.has('loading'),
    );
  }
  /** Take Pointer Lock back for play on desktop (from a click; harmless if it is refused). */
  const capture = () => {
    if (game && !game.input.isTouchMode) void kbm?.lock().then(updatePlayHint);
  };
  const panel = new SettingsPanel(uiRoot, settings, {
    gyroAvailable: navigator.maxTouchPoints > 0,
    requestGyro: requestGyroPermission,
    onChange: (next) => {
      applySettingsChange(settings, next);
      settings = next;
      void saveSettings(platform.storage, next);
    },
    onResume: () => {
      if (panelMode === 'menu') {
        showTitle();
        return;
      }
      setPaused('menu', false);
      capture();
    },
    onRestart: () => {
      setPaused('menu', false);
      retry();
    },
    onQuit: () => {
      setPaused('menu', false);
      showTitle();
    },
  });
  const openPause = () => {
    if (!inLevel || panel.isOpen || result?.isOpen) return;
    kbm?.unlock();
    panelMode = 'pause';
    panel.open('pause');
    setPaused('menu', true);
  };
  function applySettingsChange(prev: Settings, next: Settings): void {
    game?.applySettings(next);
    if (next.quality !== prev.quality && next.quality !== 'auto' && next.quality !== ctx.tier) {
      applyTier(ctx, next.quality);
      world.applyTier(next.quality);
      updatePost(next.quality);
      markMaterialsDirty(world.scene);
      resizeToCanvas(ctx, world.camera);
      tierSource = 'settings';
      probe = null; // a manual choice wins over the startup probe
    }
  }

  let touchControls: TouchControls | null = null;
  const showTouchControls = () => {
    if (touchControls && game) touchControls.visible = game.input.isTouchMode && inLevel;
  };
  if (game) {
    const g = game;
    touchControls = new TouchControls(uiRoot, {
      onCrouch: () => (g.input.state.crouchToggle = true),
      onContext: () => (g.input.state.context = true),
      onThrow: () => (g.input.state.throw = true),
      onSettings: openPause,
    });
    g.input.onTouchModeChange = () => {
      if (!result?.isOpen) showTouchControls();
      updatePlayHint();
    };
    if (kbm) {
      kbm.onUnlock = openPause;
      document.addEventListener('pointerlockchange', updatePlayHint);
    }
  }

  // Menus.
  const setProgress = (p: Progress) => {
    progress = p;
    void saveProgress(platform.storage, p);
  };
  const menu = new MainMenu(uiRoot, {
    onPlay: () => void play(nextToPlay(progress)),
    onLevels: () => {
      menu.hide();
      levelSelect.show(progress, flags.debug);
    },
    onLoadout: () => {
      menu.hide();
      loadout.show(progress);
    },
    onSettings: () => {
      menu.hide();
      panelMode = 'menu';
      panel.open('menu');
    },
  });
  const levelSelect = new LevelSelect(uiRoot, {
    onPick: (id) => void play(id),
    onBack: () => showTitle(),
    onTheme: (theme) => {
      themes.prefetch(theme);
      game?.audio.prefetchTheme(theme);
    },
  });
  const loadout = new Loadout(uiRoot, { onChange: setProgress, onBack: () => showTitle() });
  const loading = new LoadingScreen(uiRoot);
  const intro = new LevelIntro(uiRoot);

  /** Leave the level (if any) for the main menu; the level stays on stage behind it, frozen. */
  function showTitle(): void {
    if (!game) return;
    inLevel = false;
    kbm?.unlock();
    result?.hide();
    panel.close();
    levelSelect.hide();
    loadout.hide();
    intro.hide();
    game.setHudVisible(false);
    game.audio.setScene({ kind: 'menu' });
    showTouchControls();
    setPaused('title', true);
    setPaused('menu', false);
    setPaused('result', false);
    menu.show({
      playName: levelName(nextToPlay(progress)),
      stars: totalStars(progress),
      maxStars: CAMPAIGN.length * 3,
      gems: progress.gems,
    });
  }

  /** Begin play on the level now on stage; `fresh` (not a retry) shows its intro card. */
  function enterLevel(fresh: boolean): void {
    if (!game) return;
    inLevel = true;
    if (fresh) intro.show(game.level.data.name, game.level.data.tip);
    // Fetch the next level's theme while this one is played.
    const next = CAMPAIGN.find((l) => l.id === nextLevelId(game?.level.data.id ?? ''));
    if (next) {
      themes.prefetch(next.theme);
      game.audio.prefetchTheme(next.theme);
    }
    game.audio.setScene({ kind: 'level', theme: themeOf(game.level.data) });
    menu.hide();
    levelSelect.hide();
    loadout.hide();
    result?.hide();
    game.setHudVisible(true);
    showTouchControls();
    setPaused('result', false);
    setPaused('title', false);
    capture();
  }

  /** Play a level from the start: the one on stage restarts in place, any other is loaded first. */
  async function play(id: string): Promise<void> {
    if (!game) return;
    const mods = modifiersFor(progress);
    if (id === game.level.data.id) {
      game.restart(mods);
      enterLevel(true);
      return;
    }
    // Out of the old level first, so its finished mission can't bring the result screen back.
    inLevel = false;
    menu.hide();
    levelSelect.hide();
    result?.hide();
    game.setHudVisible(false);
    showTouchControls();
    loading.show(levelName(id));
    setPaused('loading', true);
    try {
      const level = await loadLevel(id);
      await themes.load(themeOf(level.data));
      game.loadLevel(level, mods);
      // Compile the new level's materials now rather than as a hitch on its first frames.
      await ctx.renderer.compileAsync(world.scene, world.camera);
    } catch (err) {
      console.error(err);
      loading.hide();
      setPaused('loading', false);
      fatal(uiRoot, err instanceof LevelLoadError ? err.message : 'Could not load the level.');
      return;
    }
    loading.hide();
    setPaused('loading', false);
    enterLevel(true);
  }

  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape' && e.code !== 'KeyR') return;
    if (e.code === 'KeyR') {
      if (!e.repeat && result?.isOpen) retry();
      return;
    }
    // With Pointer Lock held, Esc releases it and onUnlock opens the pause panel; this covers the rest.
    if (inLevel) {
      if (!kbm?.locked && !panel.isOpen) openPause();
    } else if (levelSelect.isOpen || loadout.isOpen || (panel.isOpen && panelMode === 'menu')) {
      showTitle();
    }
  });

  // Win / fail screen. Retry restarts in place; Next plays the following level; Menu goes back.
  const result = game
    ? new ResultScreen(uiRoot, {
        onRetry: retry,
        onNext: () => {
          const next = game && nextLevelId(game.level.data.id);
          if (next) void play(next);
        },
        onMenu: () => showTitle(),
      })
    : null;
  function showResult(): void {
    const r = game?.mission.result;
    if (!game || !r || !result) return;
    const level = game.level.data;
    let reward: WinReward | null = null;
    if (r.outcome === 'won' && CAMPAIGN.some((l) => l.id === level.id)) {
      const won = recordWin(progress, level.id, r.stars, r.stats.timeS);
      setProgress(won.progress);
      reward = won.reward;
    }
    kbm?.unlock();
    intro.hide();
    game.setHudVisible(false);
    if (touchControls) touchControls.visible = false;
    result.show(r, level.guards.length, level.parTimeS, nextLevelId(level.id) !== null, reward);
    setPaused('result', true); // after show(), so the play hint sees the screen open
  }
  /** From a click or key press, so Pointer Lock can be taken straight back. */
  function retry(): void {
    if (!game) return;
    game.restart(modifiersFor(progress));
    enterLevel(false);
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
  if (flags.level) enterLevel(true);
  else showTitle();
}

boot().catch((err: unknown) => {
  console.error(err);
  const root = document.getElementById('ui-root');
  if (root) fatal(root, 'Something went wrong while starting the game. Please reload.');
});
