// What the minimap is allowed to show about each guard: only what the player has perceived.
// A marker is created and moved by perception reports alone; once perception ends it freezes where
// it was last perceived and fades out over MINIMAP.fadeS.

import type { GuardState } from '../ai/guard-fsm';
import { MINIMAP } from '../config/tunables';
import type { PerceptKind } from './spotted';

export interface MinimapMarker {
  /** Drawn at all (perceived now, or still fading). */
  visible: boolean;
  /** Perceived on the latest test. */
  live: boolean;
  /** How the guard was last perceived. */
  kind: PerceptKind;
  /** Snapshot from the last perception: position, facing (yaw) and state. */
  x: number;
  z: number;
  yaw: number;
  state: GuardState;
  /** Seconds since perception was lost (0 while live). */
  lostFor: number;
  /** Marker opacity, 1 while live, falling to 0 over the fade. */
  alpha: number;
}

/** The parts of a guard a perception report snapshots. */
export interface MarkerSnapshot {
  x: number;
  z: number;
  yaw: number;
  state: GuardState;
}

export class MinimapMemory {
  readonly markers: MinimapMarker[];

  constructor(count: number) {
    this.markers = Array.from({ length: count }, () => ({
      visible: false,
      live: false,
      kind: 'direct' as PerceptKind,
      x: 0,
      z: 0,
      yaw: 0,
      state: 'patrol' as GuardState,
      lostFor: 0,
      alpha: 0,
    }));
  }

  /** The result of one perception test of guard `i`: perceived as `kind`, or not at all (null). */
  report(i: number, kind: PerceptKind | null, g: MarkerSnapshot): void {
    const m = this.markers[i];
    if (!m) return;
    if (kind === null) {
      // Freeze where he was last perceived; update() fades him out.
      m.live = false;
      return;
    }
    m.visible = m.live = true;
    m.kind = kind;
    m.x = g.x;
    m.z = g.z;
    m.yaw = g.yaw;
    m.state = g.state;
    m.lostFor = 0;
    m.alpha = 1;
  }

  /** Advance the fades of lost markers. */
  update(dt: number): void {
    for (const m of this.markers) {
      if (m.live || !m.visible) continue;
      m.lostFor += dt;
      m.alpha = Math.max(0, 1 - m.lostFor / MINIMAP.fadeS);
      if (m.alpha === 0) m.visible = false;
    }
  }
}
