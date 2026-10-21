// World → minimap mapping. Rotating mode keeps the player's view direction pointing up; fixed mode keeps
// north (−Z) up. Offsets are in metres from the player, +x right and +y down on screen. Pure.

export const MINIMAP_MODES = ['rotating', 'fixed'] as const;
export type MinimapMode = (typeof MINIMAP_MODES)[number];

export function isMinimapMode(value: unknown): value is MinimapMode {
  return typeof value === 'string' && (MINIMAP_MODES as readonly string[]).includes(value);
}

export interface MapPoint {
  x: number;
  y: number;
}

/**
 * The map's rotation (rad, canvas convention) for a player yaw: applying it to a world offset
 * (dx, dz) gives the screen offset. Rotating mode turns by the yaw; fixed mode doesn't turn.
 */
export function mapRotation(mode: MinimapMode, playerYaw: number): number {
  return mode === 'rotating' ? playerYaw : 0;
}

/** Rotate a world offset (dx, dz) onto the map. Writes into and returns `out`. */
export function toMap(rotation: number, dx: number, dz: number, out: MapPoint): MapPoint {
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  out.x = dx * c - dz * s;
  out.y = dx * s + dz * c;
  return out;
}

/** Screen angle (rad, canvas convention: 0 = right, +π/2 = down) of a world yaw on the map. */
export function yawOnMap(rotation: number, yaw: number): number {
  const p = toMap(rotation, -Math.sin(yaw), -Math.cos(yaw), scratch);
  return Math.atan2(p.y, p.x);
}

const scratch: MapPoint = { x: 0, y: 0 };
