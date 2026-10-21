// Yaw helpers in the three.js convention used everywhere: yaw 0 faces −Z, positive yaw turns left,
// so the forward vector is (−sin yaw, −cos yaw). Compass degrees (level JSON) are 0 = −Z, 90 = +X.

/** Wrap an angle to (−π, π]. */
export function wrapAngle(a: number): number {
  a %= 2 * Math.PI;
  if (a > Math.PI) a -= 2 * Math.PI;
  else if (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}

/** Yaw that faces along (dx, dz). */
export function yawFromDir(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

export function yawFromCompassDeg(deg: number): number {
  return wrapAngle((-deg * Math.PI) / 180);
}

/** Rotate `from` toward `to` by at most `maxStep` radians, the short way round. */
export function turnToward(from: number, to: number, maxStep: number): number {
  const d = wrapAngle(to - from);
  if (Math.abs(d) <= maxStep) return wrapAngle(to);
  return wrapAngle(from + Math.sign(d) * maxStep);
}

/** Interpolate between two yaws the short way round. */
export function lerpAngle(a: number, b: number, t: number): number {
  return wrapAngle(a + wrapAngle(b - a) * t);
}
