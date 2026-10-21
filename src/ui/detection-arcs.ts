// Screen-edge arcs pointing toward each guard whose awareness of the player is rising; the arc's fill
// is that awareness. They show direction only, never position, so they're shown for every guard, not
// just perceived ones. One SVG with a fixed pair of paths per guard, so no per-frame DOM creation.

import type { GuardState } from '../ai/guard-fsm';
import { AWARENESS, GUARD_VISUALS, HUD } from '../config/tunables';
import { toMap, type MapPoint } from './minimap-math';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Points along each arc's ellipse segment. */
const ARC_POINTS = 9;
/** Awareness must climb at least this much between updates to count as rising. */
const RISE_EPSILON = 1e-3;

/** What an arc reads from a guard (Guard satisfies this). */
export interface ArcGuard {
  readonly pos: { x: number; z: number };
  readonly awareness: { readonly value: number };
  readonly state: GuardState;
  readonly seesPlayer: boolean;
}

export interface ArcState {
  /** Awareness at the previous update. */
  last: number;
  /** Seconds since awareness last rose (or the guard last had the player in sight while alert). */
  sinceRise: number;
  /** 0..1 opacity. */
  alpha: number;
}

export function createArcState(): ArcState {
  return { last: 0, sinceRise: Infinity, alpha: 0 };
}

/** Advance one guard's arc: up while awareness rises (or he's alert with eyes on you), then fade. */
export function stepArc(s: ArcState, g: ArcGuard, dt: number): ArcState {
  const v = g.awareness.value;
  if (v > s.last + RISE_EPSILON || (g.state === 'alert' && g.seesPlayer)) s.sinceRise = 0;
  else s.sinceRise += dt;
  s.last = v;
  const t = s.sinceRise - HUD.arcRiseHoldS;
  s.alpha = t <= 0 ? 1 : Math.max(0, 1 - t / HUD.arcFadeS);
  return s;
}

const amber = hexRgb(GUARD_VISUALS.suspiciousColor);
const red = hexRgb(GUARD_VISUALS.alertColor);

function hexRgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

/** Amber, tinting to red as awareness nears Alert (red in Alert). */
export function arcColor(awareness: number, state: GuardState): string {
  const span = AWARENESS.alert - HUD.arcRedFrom;
  const k = state === 'alert' ? 1 : Math.min(1, Math.max(0, (awareness - HUD.arcRedFrom) / span));
  const c = amber.map((a, i) => Math.round(a + ((red[i] as number) - a) * k));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

interface Arc {
  state: ArcState;
  track: SVGPathElement;
  fill: SVGPathElement;
  shown: boolean;
}

export class DetectionArcs {
  private readonly svg: SVGSVGElement;
  private readonly arcs: Arc[];
  private readonly p: MapPoint = { x: 0, y: 0 };
  private width = 0;
  private height = 0;

  constructor(
    private readonly root: HTMLElement,
    count: number,
  ) {
    this.svg = document.createElementNS(SVG_NS, 'svg');
    this.svg.setAttribute('class', 'detection-arcs');
    this.svg.setAttribute('aria-hidden', 'true');
    root.appendChild(this.svg);
    const path = (cls: string) => {
      const el = document.createElementNS(SVG_NS, 'path');
      el.setAttribute('class', cls);
      el.setAttribute('pathLength', '1');
      el.setAttribute('stroke-width', String(HUD.arcWidthPx));
      el.style.display = 'none';
      this.svg.appendChild(el);
      return el;
    };
    this.arcs = Array.from({ length: count }, () => ({
      state: createArcState(),
      track: path('arc-track'),
      fill: path('arc-fill'),
      shown: false,
    }));
  }

  set visible(v: boolean) {
    this.svg.style.display = v ? '' : 'none';
  }

  /** `yaw` is the camera's; (x, z) the player's position. */
  update(dt: number, x: number, z: number, yaw: number, guards: readonly ArcGuard[]): void {
    this.resize();
    const cx = this.width / 2;
    const cy = this.height / 2;
    const rx = cx * HUD.arcInset;
    const ry = cy * HUD.arcInset;
    const span = (HUD.arcSpanDeg * Math.PI) / 180;
    for (let i = 0; i < this.arcs.length; i++) {
      const arc = this.arcs[i] as Arc;
      const g = guards[i];
      if (!g) continue;
      const s = stepArc(arc.state, g, dt);
      const show = s.alpha > 0;
      if (show !== arc.shown) {
        arc.shown = show;
        arc.track.style.display = arc.fill.style.display = show ? '' : 'none';
      }
      if (!show) continue;
      // Bearing on screen: the view direction is up, as on a rotating minimap.
      const p = toMap(yaw, g.pos.x - x, g.pos.z - z, this.p);
      const a = Math.atan2(p.y, p.x);
      let d = '';
      for (let k = 0; k < ARC_POINTS; k++) {
        const t = a - span / 2 + (span * k) / (ARC_POINTS - 1);
        d += `${k === 0 ? 'M' : 'L'}${(cx + Math.cos(t) * rx).toFixed(1)},${(cy + Math.sin(t) * ry).toFixed(1)}`;
      }
      const color = arcColor(g.awareness.value, g.state);
      const fill = Math.min(1, g.awareness.value / AWARENESS.max);
      arc.track.setAttribute('d', d);
      arc.fill.setAttribute('d', d);
      arc.track.style.opacity = String(s.alpha * 0.35);
      arc.fill.style.opacity = String(s.alpha);
      arc.track.style.stroke = arc.fill.style.stroke = color;
      // Fill grows from the middle of the arc outward.
      arc.fill.style.strokeDasharray = `${fill.toFixed(3)} 1`;
      arc.fill.style.strokeDashoffset = ((fill - 1) / 2).toFixed(3);
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
