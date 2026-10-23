// HUD minimap: a round DOM canvas in the top-right. The level layout is always shown; guards appear only
// through MinimapMemory, so the map never shows a guard the player couldn't have perceived.
// Marker styles: solid = seen directly, outlined = seen by his light, ripple = heard.

import { MINIMAP as M } from '../config/tunables';
import type { Grid } from '../level/grid';
import { Tile } from '../level/types';
import type { MinimapMarker } from '../perception/minimap-memory';
import { mapRotation, toMap, yawOnMap, type MapPoint, type MinimapMode } from './minimap-math';

export interface MinimapPose {
  x: number;
  z: number;
  yaw: number;
}

/** What the minimap reads from a guard to draw his body (Guard satisfies this). */
export interface MinimapBody {
  readonly pos: { x: number; z: number };
  readonly dead: boolean;
}

interface NoiseRing {
  x: number;
  z: number;
  radius: number;
  age: number;
}

const css = (hex: number) => `#${hex.toString(16).padStart(6, '0')}`;

const TILE_COLORS: Partial<Record<Tile, string>> = {
  [Tile.Floor]: css(M.floorColor),
  [Tile.Wall]: css(M.wallColor),
  [Tile.Cover]: css(M.coverColor),
  [Tile.Door]: css(M.doorColor),
  [Tile.Exit]: css(M.playerColor),
};

/** Draws the whole level once at M.layoutPxPerM. */
function drawLayout(grid: Grid): HTMLCanvasElement {
  const px = grid.tileSize * M.layoutPxPerM;
  const canvas = document.createElement('canvas');
  canvas.width = grid.width * px;
  canvas.height = grid.height * px;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  for (let cy = 0; cy < grid.height; cy++) {
    for (let cx = 0; cx < grid.width; cx++) {
      const color = TILE_COLORS[grid.get(cx, cy)];
      if (!color) continue;
      ctx.fillStyle = color;
      const inset = grid.get(cx, cy) === Tile.Cover ? px * 0.15 : 0;
      ctx.fillRect(cx * px + inset, cy * px + inset, px - 2 * inset, px - 2 * inset);
    }
  }
  return canvas;
}

export class Minimap {
  readonly canvas: HTMLCanvasElement;
  mode: MinimapMode = 'rotating';
  private readonly ctx: CanvasRenderingContext2D;
  private layout: HTMLCanvasElement;
  private readonly rings: NoiseRing[] = [];
  private readonly p: MapPoint = { x: 0, y: 0 };
  private sizeCss = 0;
  private dpr = 1;
  private time = 0;

  constructor(root: HTMLElement, grid: Grid) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'minimap';
    root.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
    this.layout = drawLayout(grid);
  }

  set visible(v: boolean) {
    this.canvas.hidden = !v;
  }

  /** A new level: redraw the layout. */
  setGrid(grid: Grid): void {
    this.layout = drawLayout(grid);
    this.reset();
  }

  reset(): void {
    this.rings.length = 0;
  }

  /** A player footstep of the given noise radius (m); loud ones draw a ring. */
  noise(x: number, z: number, radius: number): void {
    if (radius < M.noiseRingMinRadiusM) return;
    if (this.rings.length >= M.noiseRings) this.rings.shift();
    this.rings.push({ x, z, radius, age: 0 });
  }

  /** `bodies`: where the guards the player has killed lie (the player knows; no perception needed). */
  update(
    dt: number,
    player: MinimapPose,
    markers: readonly MinimapMarker[],
    bodies: readonly MinimapBody[],
  ): void {
    this.time += dt;
    this.resize();
    const { ctx } = this;
    const s = this.sizeCss;
    const half = s / 2;
    const scale = half / M.viewRadiusM; // css px per metre
    const rot = mapRotation(this.mode, player.yaw);
    const r = Math.max(2, s * M.markerSizeFraction);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, s, s);
    ctx.save();
    ctx.beginPath();
    ctx.arc(half, half, half - 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.globalAlpha = M.backgroundAlpha;
    ctx.fillStyle = css(M.backgroundColor);
    ctx.fillRect(0, 0, s, s);
    ctx.globalAlpha = 1;

    // Layout: centre on the player, turn the world onto the map, scale metres to pixels.
    ctx.save();
    ctx.translate(half, half);
    ctx.rotate(rot);
    ctx.scale(scale, scale);
    ctx.translate(-player.x, -player.z);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      this.layout,
      0,
      0,
      this.layout.width / M.layoutPxPerM,
      this.layout.height / M.layoutPxPerM,
    );
    ctx.restore();

    this.drawRings(dt, player, rot, scale, half);
    for (const b of bodies) {
      if (b.dead) this.drawBody(b.pos.x - player.x, b.pos.z - player.z, rot, scale, half, r);
    }
    for (const m of markers) {
      if (m.visible) this.drawMarker(m, player, rot, scale, half, r);
    }
    this.drawArrow(half, half, yawOnMap(rot, player.yaw), r * 1.3, css(M.playerColor), 1);
    ctx.restore();

    ctx.beginPath();
    ctx.arc(half, half, half - 1, 0, Math.PI * 2);
    ctx.strokeStyle = css(M.rimColor);
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private drawRings(dt: number, player: MinimapPose, rot: number, scale: number, half: number) {
    const { ctx } = this;
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i] as NoiseRing;
      ring.age += dt;
      const t = ring.age / M.noiseRingS;
      if (t >= 1) {
        this.rings.splice(i, 1);
        continue;
      }
      const p = toMap(rot, ring.x - player.x, ring.z - player.z, this.p);
      ctx.beginPath();
      ctx.arc(half + p.x * scale, half + p.y * scale, ring.radius * scale * t, 0, Math.PI * 2);
      ctx.strokeStyle = css(M.playerColor);
      ctx.globalAlpha = 0.5 * (1 - t);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private drawMarker(
    m: MinimapMarker,
    player: MinimapPose,
    rot: number,
    scale: number,
    half: number,
    r: number,
  ): void {
    const { ctx } = this;
    const p = toMap(rot, m.x - player.x, m.z - player.z, this.p);
    let x = p.x * scale;
    let y = p.y * scale;
    // Off the edge: pin to the rim so the player still knows which way the guard is.
    const maxR = half - r * 1.5;
    const d = Math.hypot(x, y);
    if (d > maxR) {
      x *= maxR / d;
      y *= maxR / d;
    }
    x += half;
    y += half;
    const color = css(M.stateColors[m.state]);
    ctx.globalAlpha = m.alpha;
    ctx.strokeStyle = ctx.fillStyle = color;
    ctx.lineWidth = Math.max(1.5, r * 0.35);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (m.kind === 'direct') {
      ctx.fill();
    } else if (m.kind === 'light') {
      ctx.stroke();
    } else {
      ctx.fill();
      // Ripple: two rings expanding out of the dot while it is still live.
      if (m.live) {
        for (let k = 0; k < 2; k++) {
          const t = (this.time * M.rippleHz + k / 2) % 1;
          ctx.globalAlpha = m.alpha * (1 - t);
          ctx.beginPath();
          ctx.arc(x, y, r * (1 + (M.rippleScale - 1) * t), 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
    this.drawArrow(x, y, yawOnMap(rot, m.yaw), r, color, m.alpha, r * 0.9);
    ctx.globalAlpha = 1;
  }

  private drawBody(dx: number, dz: number, rot: number, scale: number, half: number, r: number) {
    const { ctx } = this;
    const p = toMap(rot, dx, dz, this.p);
    const x = half + p.x * scale;
    const y = half + p.y * scale;
    const k = r * 0.7;
    ctx.strokeStyle = css(M.bodyColor);
    ctx.lineWidth = Math.max(1.5, r * 0.35);
    ctx.beginPath();
    ctx.moveTo(x - k, y - k);
    ctx.lineTo(x + k, y + k);
    ctx.moveTo(x + k, y - k);
    ctx.lineTo(x - k, y + k);
    ctx.stroke();
  }

  /** A triangle pointing along `angle`; with `offset` it sits outside a marker of that radius. */
  private drawArrow(
    x: number,
    y: number,
    angle: number,
    size: number,
    color: string,
    alpha: number,
    offset = 0,
  ): void {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    if (offset > 0) {
      ctx.moveTo(offset + size * 0.9, 0);
      ctx.lineTo(offset, -size * 0.55);
      ctx.lineTo(offset, size * 0.55);
    } else {
      ctx.moveTo(size, 0);
      ctx.lineTo(-size * 0.7, -size * 0.7);
      ctx.lineTo(-size * 0.3, 0);
      ctx.lineTo(-size * 0.7, size * 0.7);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** Match the canvas to the screen's short side and the pixel ratio; cheap when nothing changed. */
  private resize(): void {
    const short = Math.min(window.innerWidth, window.innerHeight);
    const size = Math.round(short * M.sizeFraction);
    const dpr = Math.min(window.devicePixelRatio || 1, M.maxDpr);
    if (size === this.sizeCss && dpr === this.dpr) return;
    this.sizeCss = size;
    this.dpr = dpr;
    this.canvas.style.width = this.canvas.style.height = `${size}px`;
    this.canvas.width = this.canvas.height = Math.round(size * dpr);
  }
}
