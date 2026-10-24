// The only module that creates the WebGLRenderer, so the backend can be swapped later (WebGPU in v1.1+).

import * as THREE from 'three';
import { TIER_SETTINGS, type QualityTier } from '../config/quality';
import { DISPLAY } from '../config/tunables';

export interface RendererContext {
  renderer: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
  tier: QualityTier;
  isMobile: boolean;
}

export function createRenderer(
  canvas: HTMLCanvasElement,
  tier: QualityTier,
  isMobile: boolean,
): RendererContext {
  const settings = TIER_SETTINGS[tier];
  // three.js r163+ is WebGL2-only; this throws if WebGL2 is unavailable.
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: settings.antialias,
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = DISPLAY.toneMappingExposure;
  // PCFSoftShadowMap was removed in r186 (it fell back to this with a warning).
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // Reset per-frame counters manually so the debug overlay sees a whole frame's draw calls.
  renderer.info.autoReset = false;

  const ctx: RendererContext = { renderer, canvas, tier, isMobile };
  applyTier(ctx, tier);
  return ctx;
}

/** Device pixel ratio for a tier, honouring the mobile cap. */
export function pixelRatioFor(tier: QualityTier, isMobile: boolean, deviceDpr: number): number {
  const cap = Math.min(TIER_SETTINGS[tier].maxDpr, isMobile ? DISPLAY.mobileMaxDpr : Infinity);
  return Math.max(1, Math.min(deviceDpr || 1, cap));
}

/**
 * Apply a tier to an existing renderer: DPR and shadow maps. Never adds/removes lights.
 * Toggling shadows forces a one-off shader recompile, so callers should mark scene materials dirty.
 */
export function applyTier(ctx: RendererContext, tier: QualityTier): void {
  ctx.tier = tier;
  ctx.renderer.shadowMap.enabled = TIER_SETTINGS[tier].shadows;
  ctx.renderer.setPixelRatio(pixelRatioFor(tier, ctx.isMobile, window.devicePixelRatio));
}

/** The player's Brightness setting scales tone-mapping exposure (a uniform: no shader recompile). */
export function setBrightness(ctx: RendererContext, brightness: number): void {
  ctx.renderer.toneMappingExposure = DISPLAY.toneMappingExposure * brightness;
}

/** Resize the drawing buffer and camera to the canvas's CSS size. */
export function resizeToCanvas(ctx: RendererContext, camera: THREE.PerspectiveCamera): void {
  const width = Math.max(1, Math.floor(ctx.canvas.clientWidth));
  const height = Math.max(1, Math.floor(ctx.canvas.clientHeight));
  ctx.renderer.setPixelRatio(pixelRatioFor(ctx.tier, ctx.isMobile, window.devicePixelRatio));
  ctx.renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

/** Calls resizeToCanvas whenever the canvas's container changes size. Returns a disposer. */
export function watchResize(ctx: RendererContext, camera: THREE.PerspectiveCamera): () => void {
  const onResize = () => resizeToCanvas(ctx, camera);
  const observer = new ResizeObserver(onResize);
  observer.observe(ctx.canvas);
  // DPR changes (moving between monitors, browser zoom) don't change CSS size.
  window.addEventListener('resize', onResize);
  onResize();
  return () => {
    observer.disconnect();
    window.removeEventListener('resize', onResize);
  };
}

/**
 * GPU name from a throwaway WebGL2 context, so the tier can be guessed before the real renderer
 * (whose MSAA setting is fixed at creation) exists. Returns null if WebGL2 is unavailable.
 */
export function queryGpu(): { name: string | null } | null {
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return null;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  gl.getExtension('WEBGL_lose_context')?.loseContext(); // free the context slot immediately
  return { name: typeof name === 'string' ? name : null };
}

export interface ContextLossHandlers {
  onLost: () => void;
  onRestored: () => void;
}

/** three.js re-uploads GPU resources itself after restore; we just stop and restart the loop. */
export function handleContextLoss(canvas: HTMLCanvasElement, handlers: ContextLossHandlers): void {
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault(); // required for the browser to attempt a restore
    handlers.onLost();
  });
  canvas.addEventListener('webglcontextrestored', () => handlers.onRestored());
}

/** Debug helper: simulate a context loss and restore it after delayMs. */
export function simulateContextLoss(renderer: THREE.WebGLRenderer, delayMs: number): void {
  const ext = renderer.getContext().getExtension('WEBGL_lose_context');
  if (!ext) return;
  ext.loseContext();
  window.setTimeout(() => ext.restoreContext(), delayMs);
}

/** After toggling shadows, materials must recompile once to pick up the change. */
export function markMaterialsDirty(scene: THREE.Object3D): void {
  scene.traverse((obj) => {
    const material = (obj as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!material) return;
    for (const m of Array.isArray(material) ? material : [material]) m.needsUpdate = true;
  });
}
