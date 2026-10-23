// A thrown distraction bottle: a simple ballistic arc stepped with the sim, stopped by walls, by low
// cover below its top, by door lintels above the doorway, or by the floor. Pure, no three.js.

import { BOTTLE, LEVEL } from '../config/tunables';
import type { Grid } from '../level/grid';
import { Tile } from '../level/types';

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** Does anything solid fill the point (x, y, z)? */
function blocked(grid: Grid, x: number, y: number, z: number): boolean {
  const { cx, cy } = grid.worldToCell(x, z);
  switch (grid.get(cx, cy)) {
    case Tile.Wall:
      return true;
    case Tile.Cover:
      return y < LEVEL.coverHeight;
    case Tile.Door:
      return y > LEVEL.doorHeight;
    default:
      return false;
  }
}

export class Bottle {
  readonly pos: Point3 = { x: 0, y: 0, z: 0 };
  readonly prevPos: Point3 = { x: 0, y: 0, z: 0 };
  readonly vel: Point3 = { x: 0, y: 0, z: 0 };
  flying = false;
  private age = 0;

  /** Throw from (x, y, z) along a camera yaw/pitch (three.js convention), lofted a little. */
  launch(x: number, y: number, z: number, yaw: number, pitch: number): void {
    const p = pitch + (BOTTLE.loftDeg * Math.PI) / 180;
    const cp = Math.cos(p);
    this.pos.x = this.prevPos.x = x;
    this.pos.y = this.prevPos.y = y;
    this.pos.z = this.prevPos.z = z;
    this.vel.x = -Math.sin(yaw) * cp * BOTTLE.speedMps;
    this.vel.y = Math.sin(p) * BOTTLE.speedMps;
    this.vel.z = -Math.cos(yaw) * cp * BOTTLE.speedMps;
    this.flying = true;
    this.age = 0;
  }

  /** Advance the flight. Returns true on the step it lands; `pos` is then the impact point. */
  step(dt: number, grid: Grid): boolean {
    if (!this.flying) return false;
    const { pos, prevPos, vel } = this;
    prevPos.x = pos.x;
    prevPos.y = pos.y;
    prevPos.z = pos.z;
    this.age += dt;
    vel.y -= BOTTLE.gravity * dt;
    // Sub-step so a fast bottle can't skip through a corner of a cell.
    const travel = Math.hypot(vel.x, vel.y, vel.z) * dt;
    const n = Math.max(1, Math.ceil(travel / BOTTLE.substepM));
    for (let i = 0; i < n; i++) {
      const x = pos.x + (vel.x * dt) / n;
      const y = pos.y + (vel.y * dt) / n;
      const z = pos.z + (vel.z * dt) / n;
      if (y <= 0) {
        pos.x = x;
        pos.y = 0;
        pos.z = z;
        return this.land();
      }
      if (blocked(grid, x, y, z)) return this.land(); // shatters where it was, against the face
      pos.x = x;
      pos.y = y;
      pos.z = z;
    }
    return this.age >= BOTTLE.maxFlightS ? this.land() : false;
  }

  private land(): boolean {
    this.flying = false;
    return true;
  }
}
