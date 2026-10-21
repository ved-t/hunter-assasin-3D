// ?debug=1 stats overlay (DOM, not WebGL). Loaded via dynamic import so normal startup doesn't pay for it.

import { Vector2, type WebGLRenderer } from 'three';
import type { FrameStats } from '../core/loop';
import type { GameTime } from '../core/time';
import { PERF } from '../config/tunables';

/** Reused to avoid per-refresh allocation. */
const DRAW_SIZE = new Vector2();

export interface DebugSnapshot {
  stats: FrameStats;
  time: GameTime;
  renderer: WebGLRenderer;
  tier: string;
  tierSource: string;
  gpu: string | null;
  platform: string;
  simPaused: boolean;
}

export class DebugOverlay {
  private readonly element: HTMLDivElement;
  private sinceRefresh = Infinity;

  constructor(root: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'debug-overlay';
    root.appendChild(this.element);
  }

  /** Call once per rendered frame, after rendering (renderer.info must hold this frame's counts). */
  update(frameDt: number, s: DebugSnapshot): void {
    this.sinceRefresh += frameDt;
    if (this.sinceRefresh < PERF.debugRefreshSeconds) return;
    this.sinceRefresh = 0;

    const avg = s.stats.avgMs();
    const p95 = s.stats.percentileMs(0.95);
    const info = s.renderer.info;
    const size = s.renderer.getDrawingBufferSize(DRAW_SIZE);
    this.element.textContent = [
      `fps     ${avg > 0 ? (1000 / avg).toFixed(0) : '-'}`,
      `frame   ${avg.toFixed(1)} ms  p95 ${p95.toFixed(1)} ms`,
      `calls   ${info.render.calls}`,
      `tris    ${info.render.triangles}`,
      `tier    ${s.tier} (${s.tierSource})`,
      `dpr     ${s.renderer.getPixelRatio().toFixed(2)}  ${size.x}x${size.y}`,
      `geo/tex ${info.memory.geometries}/${info.memory.textures}  progs ${info.programs?.length ?? 0}`,
      `sim     ${s.time.simSeconds.toFixed(1)} s${s.simPaused ? ' (paused)' : ''}`,
      `gpu     ${s.gpu ?? 'unknown'}`,
      `plat    ${s.platform}`,
      `[L] simulate context loss`,
    ].join('\n');
  }
}
