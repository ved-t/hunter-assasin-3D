// In-game HUD (DOM over the canvas): minimap, crosshair + light gem, health pips, detection arcs,
// hit markers and damage vignette, the objective line and the context prompt.

import type { Grid } from '../level/grid';
import type { MinimapMarker } from '../perception/minimap-memory';
import { DamageVignette } from './damage-vignette';
import { DetectionArcs, type ArcGuard } from './detection-arcs';
import { HealthPips } from './health-pips';
import { HitMarkers } from './hit-markers';
import { Minimap, type MinimapBody, type MinimapPose } from './minimap';
import type { MinimapMode } from './minimap-math';
import { MissionBar } from './mission-bar';
import { VisibilityMeter } from './visibility-meter';

/** Everything the HUD shows, gathered once per rendered frame. */
export interface HudFrame {
  /** The interpolated camera pose. */
  pose: MinimapPose;
  exposure: number;
  markers: readonly MinimapMarker[];
  guards: readonly (ArcGuard & MinimapBody)[];
  hp: number;
  objective: string;
  bottles: string;
  /** Context prompt under the crosshair, or null. */
  prompt: string | null;
}

export class Hud {
  private readonly minimap: Minimap;
  private readonly meter: VisibilityMeter;
  private readonly arcs: DetectionArcs;
  private readonly vignette: DamageVignette;
  private readonly hits: HitMarkers;
  private readonly pips: HealthPips;
  private readonly bar: MissionBar;

  /** `guardCapacity`: the most guards any level has (one detection arc each). */
  constructor(root: HTMLElement, grid: Grid, guardCapacity: number) {
    this.vignette = new DamageVignette(root);
    this.arcs = new DetectionArcs(root, guardCapacity);
    this.hits = new HitMarkers(root);
    this.meter = new VisibilityMeter(root);
    this.pips = new HealthPips(root);
    this.bar = new MissionBar(root);
    this.minimap = new Minimap(root, grid);
  }

  set minimapMode(mode: MinimapMode) {
    this.minimap.mode = mode;
  }

  /** Hidden behind the result screen. */
  set visible(v: boolean) {
    this.minimap.visible = this.meter.visible = this.arcs.visible = v;
    this.pips.visible = this.bar.visible = v;
  }

  /** A new level: the minimap shows its layout. Call reset() too. */
  setGrid(grid: Grid): void {
    this.minimap.setGrid(grid);
  }

  /** A restart: drop everything that belonged to the previous attempt. */
  reset(): void {
    this.minimap.reset();
    this.arcs.reset();
    this.hits.reset();
    this.vignette.reset();
  }

  /** A player footstep (m of noise radius), for the minimap's noise ring. */
  noise(x: number, z: number, radius: number): void {
    this.minimap.noise(x, z, radius);
  }

  /** The player was shot by someone standing at (x, z). */
  hit(x: number, z: number): void {
    this.vignette.hit();
    this.hits.add(x, z);
  }

  update(dt: number, f: HudFrame): void {
    const { pose } = f;
    this.minimap.update(dt, pose, f.markers, f.guards);
    this.meter.update(dt, f.exposure);
    this.arcs.update(dt, pose.x, pose.z, pose.yaw, f.guards);
    this.hits.update(dt, pose.x, pose.z, pose.yaw);
    this.vignette.update(dt, f.hp);
    this.pips.update(f.hp);
    this.bar.update(f.objective, f.bottles, f.prompt);
  }
}
