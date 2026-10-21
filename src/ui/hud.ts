// In-game HUD (DOM over the canvas): minimap, crosshair + light gem, and detection arcs.

import type { Grid } from '../level/grid';
import type { MinimapMarker } from '../perception/minimap-memory';
import { DetectionArcs, type ArcGuard } from './detection-arcs';
import { Minimap, type MinimapPose } from './minimap';
import type { MinimapMode } from './minimap-math';
import { VisibilityMeter } from './visibility-meter';

export class Hud {
  private readonly minimap: Minimap;
  private readonly meter: VisibilityMeter;
  private readonly arcs: DetectionArcs;

  constructor(root: HTMLElement, grid: Grid, guardCount: number) {
    this.arcs = new DetectionArcs(root, guardCount);
    this.meter = new VisibilityMeter(root);
    this.minimap = new Minimap(root, grid);
  }

  set minimapMode(mode: MinimapMode) {
    this.minimap.mode = mode;
  }

  /** A player footstep (m of noise radius), for the minimap's noise ring. */
  noise(x: number, z: number, radius: number): void {
    this.minimap.noise(x, z, radius);
  }

  /** Once per rendered frame. `player` is the interpolated camera pose. */
  update(
    dt: number,
    player: MinimapPose,
    exposure: number,
    markers: readonly MinimapMarker[],
    guards: readonly ArcGuard[],
  ): void {
    this.minimap.update(dt, player, markers);
    this.meter.update(dt, exposure);
    this.arcs.update(dt, player.x, player.z, player.yaw, guards);
  }
}
