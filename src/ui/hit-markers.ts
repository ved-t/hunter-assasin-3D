// Directional hit markers: a red arc near the crosshair pointing toward whoever just shot the player,
// fading out. They track the shooter's position, so turning toward him swings the arc to the top.
// A fixed pool of SVG paths; no per-hit DOM creation.

import { GUARD_VISUALS, HUD } from '../config/tunables';
import { toMap, type MapPoint } from './minimap-math';

const SVG_NS = 'http://www.w3.org/2000/svg';
const ARC_POINTS = 9;
const css = (hex: number) => `#${hex.toString(16).padStart(6, '0')}`;

interface Marker {
  path: SVGPathElement;
  x: number;
  z: number;
  age: number;
  shown: boolean;
}

export class HitMarkers {
  private readonly svg: SVGSVGElement;
  private readonly markers: Marker[];
  private readonly p: MapPoint = { x: 0, y: 0 };
  private next = 0;
  private width = 0;
  private height = 0;

  constructor(private readonly root: HTMLElement) {
    this.svg = document.createElementNS(SVG_NS, 'svg');
    this.svg.setAttribute('class', 'hit-markers');
    this.svg.setAttribute('aria-hidden', 'true');
    root.appendChild(this.svg);
    this.markers = Array.from({ length: HUD.hitMarkers }, () => {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('stroke-width', String(HUD.hitMarkerWidthPx));
      path.style.stroke = css(GUARD_VISUALS.alertColor);
      path.style.display = 'none';
      this.svg.appendChild(path);
      return { path, x: 0, z: 0, age: Infinity, shown: false };
    });
  }

  /** A hit from a shooter standing at (x, z). */
  add(x: number, z: number): void {
    const m = this.markers[this.next] as Marker;
    this.next = (this.next + 1) % this.markers.length;
    m.x = x;
    m.z = z;
    m.age = 0;
  }

  reset(): void {
    for (const m of this.markers) {
      m.age = Infinity;
      m.shown = false;
      m.path.style.display = 'none';
    }
  }

  /** (x, z) and `yaw` are the player's. */
  update(dt: number, x: number, z: number, yaw: number): void {
    this.resize();
    const cx = this.width / 2;
    const cy = this.height / 2;
    const r = Math.min(cx, cy) * HUD.hitMarkerRadius;
    const span = (HUD.hitMarkerSpanDeg * Math.PI) / 180;
    for (const m of this.markers) {
      m.age += dt;
      const show = m.age < HUD.hitMarkerS;
      if (show !== m.shown) {
        m.shown = show;
        m.path.style.display = show ? '' : 'none';
      }
      if (!show) continue;
      const p = toMap(yaw, m.x - x, m.z - z, this.p);
      const a = Math.atan2(p.y, p.x);
      let d = '';
      for (let k = 0; k < ARC_POINTS; k++) {
        const t = a - span / 2 + (span * k) / (ARC_POINTS - 1);
        d += `${k === 0 ? 'M' : 'L'}${(cx + Math.cos(t) * r).toFixed(1)},${(cy + Math.sin(t) * r).toFixed(1)}`;
      }
      m.path.setAttribute('d', d);
      m.path.style.opacity = (1 - m.age / HUD.hitMarkerS).toFixed(3);
    }
  }

  private resize(): void {
    const w = this.root.clientWidth;
    const h = this.root.clientHeight;
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  }
}
