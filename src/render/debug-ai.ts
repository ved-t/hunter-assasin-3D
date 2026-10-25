// ?debug=1 AI view (dynamically imported): vision cones (70° / 14 m plus the near zone), the rear arc a
// knife takedown works from (cyan), current paths, LKP and search-cell markers, per-guard
// state/awareness labels, the point each guard was last perceived through (cyan), and a floor heatmap
// of player light exposure, toggled with N.

import * as THREE from 'three';
import type { Guard } from '../ai/guard';
import type { GuardState } from '../ai/guard-fsm';
import { KNIFE, LIGHT_EXPOSURE, SEARCH, VISION } from '../config/tunables';
import type { Vec2 } from '../level/collision';
import type { Grid } from '../level/grid';
import { Tile } from '../level/types';
import { lightExposure, type BeamLight } from '../lighting/light-sampling';
import type { SpotResult } from '../perception/spotted';

const ARC_SEGMENTS = 10;
const NEAR_ARC_SEGMENTS = 4;
/** Path segments drawn per guard. */
const MAX_PATH = 16;
const KNIFE_ARC_SEGMENTS = 16;
const SEGMENTS_PER_GUARD =
  2 + ARC_SEGMENTS + 2 + NEAR_ARC_SEGMENTS + 2 + KNIFE_ARC_SEGMENTS + MAX_PATH;
/** Takedown arc and dead guards' labels. */
const KNIFE_COLOR = 0xbff4ff;
const DEAD_COLOR = 0x7c838c;
const LINE_Y = 0.06;
const LABEL_Y = 2.7;
const HEATMAP_REFRESH_S = 0.25;
const HEATMAP_Y = 0.04;
const MARKER_SIZE = 0.25;
/** Perceived-point markers use the player-relevant cyan. */
const PERCEPT_COLOR = 0xbff4ff;
const PERCEPT_SIZE = 0.12;

const STATE_COLOR: Record<GuardState, number> = {
  patrol: 0x6fdc8c,
  suspicious: 0xffb347,
  alert: 0xff3b30,
  search: 0xc98a3a,
};

export class DebugAi {
  private readonly group = new THREE.Group();
  private readonly lines: THREE.LineSegments;
  private readonly linePos: Float32Array;
  private readonly lineCol: Float32Array;
  private readonly lkps: THREE.InstancedMesh;
  private readonly cells: THREE.InstancedMesh;
  private readonly percepts: THREE.InstancedMesh;
  private readonly heatmap: THREE.InstancedMesh;
  private readonly heatCells: { cx: number; cy: number }[] = [];
  private readonly labels: HTMLDivElement[] = [];
  private readonly labelRoot: HTMLDivElement;
  private heatTimer = Infinity;
  private readonly c = new THREE.Color();
  private readonly knifeColor = new THREE.Color(KNIFE_COLOR);
  private readonly m = new THREE.Matrix4();
  private readonly v = new THREE.Vector3();
  private readonly abort = new AbortController();

  constructor(
    scene: THREE.Scene,
    private readonly grid: Grid,
    private guards: readonly Guard[],
    private readonly lamps: readonly Vec2[],
    uiRoot: HTMLElement,
  ) {
    this.group.name = 'debug-ai';
    const verts = guards.length * SEGMENTS_PER_GUARD * 2;
    this.linePos = new Float32Array(verts * 3);
    this.lineCol = new Float32Array(verts * 3);
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.linePos, 3).setUsage(THREE.DynamicDrawUsage),
    );
    lineGeo.setAttribute(
      'color',
      new THREE.BufferAttribute(this.lineCol, 3).setUsage(THREE.DynamicDrawUsage),
    );
    this.lines = new THREE.LineSegments(
      lineGeo,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        fog: false,
        depthTest: false,
        transparent: true,
      }),
    );
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 10;

    const marker = new THREE.OctahedronGeometry(MARKER_SIZE);
    const markerMat = (color: number) => new THREE.MeshBasicMaterial({ color, fog: false });
    this.lkps = new THREE.InstancedMesh(
      marker,
      markerMat(STATE_COLOR.alert),
      Math.max(1, guards.length),
    );
    this.cells = new THREE.InstancedMesh(
      marker,
      markerMat(STATE_COLOR.search),
      Math.max(1, guards.length * SEARCH.maxCells),
    );
    this.percepts = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(PERCEPT_SIZE),
      new THREE.MeshBasicMaterial({ color: PERCEPT_COLOR, fog: false, depthTest: false }),
      Math.max(1, guards.length),
    );
    this.percepts.renderOrder = 11;
    for (const mesh of [this.lkps, this.cells, this.percepts]) {
      mesh.frustumCulled = false;
      mesh.count = 0;
    }

    for (let cy = 0; cy < grid.height; cy++) {
      for (let cx = 0; cx < grid.width; cx++) {
        const t = grid.get(cx, cy);
        if (t !== Tile.Wall) this.heatCells.push({ cx, cy });
      }
    }
    const tile = new THREE.PlaneGeometry(grid.tileSize * 0.94, grid.tileSize * 0.94).rotateX(
      -Math.PI / 2,
    );
    this.heatmap = new THREE.InstancedMesh(
      tile,
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        fog: false,
      }),
      Math.max(1, this.heatCells.length),
    );
    this.heatCells.forEach(({ cx, cy }, i) => {
      const p = grid.cellCenter(cx, cy);
      this.heatmap.setMatrixAt(i, this.m.makeTranslation(p.x, HEATMAP_Y, p.z));
      this.heatmap.setColorAt(i, this.c.setRGB(0, 0, 0));
    });
    this.heatmap.visible = false;

    this.group.add(this.lines, this.lkps, this.cells, this.percepts, this.heatmap);
    scene.add(this.group);

    this.labelRoot = document.createElement('div');
    this.labelRoot.className = 'debug-ai-labels';
    uiRoot.appendChild(this.labelRoot);
    for (let i = 0; i < guards.length; i++) {
      const el = document.createElement('div');
      el.className = 'debug-ai-label';
      this.labelRoot.appendChild(el);
      this.labels.push(el);
    }

    window.addEventListener(
      'keydown',
      (e) => {
        if (e.code === 'KeyN') {
          this.heatmap.visible = !this.heatmap.visible;
          this.heatTimer = Infinity;
        }
      },
      { signal: this.abort.signal },
    );
  }

  get heatmapVisible(): boolean {
    return this.heatmap.visible;
  }

  /** A restart brings a new set of guards (same level, so the same count). */
  setGuards(guards: readonly Guard[]): void {
    this.guards = guards;
  }

  update(
    alpha: number,
    frameDt: number,
    camera: THREE.PerspectiveCamera,
    beams: readonly BeamLight[],
    percepts: readonly SpotResult[],
  ): void {
    this.updateLines(alpha);
    this.updateMarkers(percepts);
    this.updateLabels(alpha, camera, percepts);
    if (this.heatmap.visible) {
      this.heatTimer += frameDt;
      if (this.heatTimer >= HEATMAP_REFRESH_S) {
        this.heatTimer = 0;
        this.updateHeatmap(beams);
      }
    }
  }

  private updateLines(alpha: number): void {
    let v = 0;
    const pos = this.linePos;
    const col = this.lineCol;
    const seg = (ax: number, az: number, bx: number, bz: number, color: THREE.Color) => {
      pos.set([ax, LINE_Y, az, bx, LINE_Y, bz], v * 3);
      col.set([color.r, color.g, color.b, color.r, color.g, color.b], v * 3);
      v += 2;
    };
    const half = (VISION.fovDeg * Math.PI) / 360;
    const nearHalf = (VISION.nearFovDeg * Math.PI) / 360;
    for (const g of this.guards) {
      if (g.dead) continue;
      const x = g.prevPos.x + (g.pos.x - g.prevPos.x) * alpha;
      const z = g.prevPos.z + (g.pos.z - g.prevPos.z) * alpha;
      const color = this.c.set(STATE_COLOR[g.state]);
      const at = (yawOff: number, r: number): [number, number] => {
        const a = g.yaw + yawOff;
        return [x - Math.sin(a) * r, z - Math.cos(a) * r];
      };
      /** A wedge of half-angle h and radius r, centred `centre` rad off his facing. */
      const fan = (h: number, r: number, segments: number, c = color, centre = 0) => {
        const [lx, lz] = at(centre + h, r);
        const [rx, rz] = at(centre - h, r);
        seg(x, z, lx, lz, c);
        seg(x, z, rx, rz, c);
        for (let i = 0; i < segments; i++) {
          const [ax, az] = at(centre + h - (2 * h * i) / segments, r);
          const [bx, bz] = at(centre + h - (2 * h * (i + 1)) / segments, r);
          seg(ax, az, bx, bz, c);
        }
      };
      fan(half, VISION.rangeM, ARC_SEGMENTS);
      fan(nearHalf, VISION.nearRangeM, NEAR_ARC_SEGMENTS);
      fan(Math.PI, KNIFE.rangeM, KNIFE_ARC_SEGMENTS, this.knifeColor);
      // Path from the guard through its remaining waypoints.
      let px = x;
      let pz = z;
      for (let i = 0; i < Math.min(g.path.length, MAX_PATH); i++) {
        const p = g.path[i] as Vec2;
        seg(px, pz, p.x, p.z, color);
        px = p.x;
        pz = p.z;
      }
    }
    const geo = this.lines.geometry;
    geo.setDrawRange(0, v);
    (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  private updateMarkers(percepts: readonly SpotResult[]): void {
    let nl = 0;
    let nc = 0;
    let np = 0;
    for (const p of percepts) {
      if (p.kind === 'direct' || p.kind === 'light') {
        this.percepts.setMatrixAt(np++, this.m.makeTranslation(p.x, p.y, p.z));
      }
    }
    this.percepts.count = np;
    this.percepts.instanceMatrix.needsUpdate = true;
    for (const g of this.guards) {
      const lkp = g.awareness.lkp;
      if (lkp && g.state !== 'patrol' && !g.dead) {
        this.lkps.setMatrixAt(nl++, this.m.makeTranslation(lkp.x, MARKER_SIZE * 2, lkp.z));
      }
      for (const p of g.searchCells) {
        if (nc >= this.cells.instanceMatrix.count) break;
        this.cells.setMatrixAt(nc++, this.m.makeTranslation(p.x, MARKER_SIZE, p.z));
      }
    }
    this.lkps.count = nl;
    this.cells.count = nc;
    this.lkps.instanceMatrix.needsUpdate = this.cells.instanceMatrix.needsUpdate = true;
  }

  private updateLabels(
    alpha: number,
    camera: THREE.PerspectiveCamera,
    percepts: readonly SpotResult[],
  ): void {
    const w = this.labelRoot.clientWidth;
    const h = this.labelRoot.clientHeight;
    this.guards.forEach((g, i) => {
      const el = this.labels[i] as HTMLDivElement;
      const x = g.prevPos.x + (g.pos.x - g.prevPos.x) * alpha;
      const z = g.prevPos.z + (g.pos.z - g.prevPos.z) * alpha;
      this.v.set(x, LABEL_Y, z).project(camera);
      const visible = this.v.z < 1 && Math.abs(this.v.x) < 1.1 && Math.abs(this.v.y) < 1.1;
      el.style.display = visible ? '' : 'none';
      if (!visible) return;
      el.style.transform = `translate(${((this.v.x + 1) / 2) * w}px, ${((1 - this.v.y) / 2) * h}px) translate(-50%, -100%)`;
      const hex = g.dead ? DEAD_COLOR : STATE_COLOR[g.state];
      el.style.color = `#${hex.toString(16).padStart(6, '0')}`;
      const percept = percepts[i]?.kind;
      el.textContent = g.dead
        ? `g${g.id} dead`
        : `g${g.id} ${g.state} ${g.awareness.value.toFixed(0)}${g.seesPlayer ? ' 👁' : ''}${percept ? ` [${percept}]` : ''}`;
    });
  }

  private updateHeatmap(beams: readonly BeamLight[]): void {
    const span = LIGHT_EXPOSURE.lit - LIGHT_EXPOSURE.dark;
    this.heatCells.forEach(({ cx, cy }, i) => {
      if (this.grid.get(cx, cy) === Tile.Cover) {
        this.heatmap.setColorAt(i, this.c.setRGB(0.5, 0.05, 0.05));
        return;
      }
      const p = this.grid.cellCenter(cx, cy);
      const e =
        (lightExposure(this.grid, p.x, p.z, this.lamps, beams) - LIGHT_EXPOSURE.dark) / span;
      // Dark blue → amber with exposure.
      this.heatmap.setColorAt(i, this.c.setRGB(0.1 + 0.9 * e, 0.15 + 0.55 * e, 0.4 - 0.3 * e));
    });
    if (this.heatmap.instanceColor) this.heatmap.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.abort.abort();
    this.labelRoot.remove();
    this.group.removeFromParent();
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }
}
