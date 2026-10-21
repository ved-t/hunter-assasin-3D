// Boot: platform init → settings → tier → renderer → scene → loop → fps probe. Menu arrives in Phase 5.

import './styles.css';
import type { QualityTier } from './config/quality';
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
import { loadSettings } from './save/settings';
import type { DebugOverlay } from './ui/debug-overlay';
import { createOverlay } from './ui/overlay';
import { setupRotateOverlay } from './ui/rotate-overlay';

type TierSource = 'url' | 'settings' | 'guess' | 'probe';

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
  const settings = await loadSettings(platform.storage);

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
  const world = createTestScene(new Rng(flags.seed), tier);
  watchResize(ctx, world.camera);

  let debugOverlay: DebugOverlay | null = null;
  if (flags.debug) {
    const { DebugOverlay } = await import('./ui/debug-overlay');
    debugOverlay = new DebugOverlay(uiRoot);
  }

  const probe = tierSource === 'guess' ? new FpsProbe() : null;

  const loop = new GameLoop({
    update: (dt) => world.update(dt),
    render: (alpha, frameDt) => {
      world.render(alpha);
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
      });
    },
  });

  // Pausing: host pause (tab hidden / ads) stops the loop; the rotate prompt only freezes the sim.
  let hostPaused = false;
  let contextLost = false;
  const resumeIfAllowed = () => {
    if (!hostPaused && !contextLost) loop.start();
  };
  platform.onPause(() => {
    hostPaused = true;
    loop.stop();
  });
  platform.onResume(() => {
    hostPaused = false;
    resumeIfAllowed();
  });
  loop.simPaused = setupRotateOverlay(uiRoot, (blocked) => (loop.simPaused = blocked));

  const lostOverlay = createOverlay(
    uiRoot,
    'context-lost-overlay',
    '<div>Restoring graphics…</div>',
  );
  handleContextLoss(canvas, {
    onLost: () => {
      contextLost = true;
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
