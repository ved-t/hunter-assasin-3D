// Optional gyro look (off by default, never required). Integrates devicemotion rotationRate, which has
// no angle wrap-around or gimbal issues, and maps device axes to screen axes for the current orientation.
// iOS requires DeviceMotionEvent.requestPermission() from a real tap; call requestGyroPermission() there.

import { INPUT } from '../config/tunables';
import type { InputState } from './input-state';

const DEG = Math.PI / 180;

type PermissionFn = () => Promise<'granted' | 'denied'>;

/** Must be called synchronously inside a click/change handler (iOS user-activation rule). */
export async function requestGyroPermission(): Promise<boolean> {
  if (typeof DeviceMotionEvent === 'undefined') return false;
  const request = (DeviceMotionEvent as unknown as { requestPermission?: PermissionFn })
    .requestPermission;
  if (typeof request !== 'function') return true; // Android / desktop: no prompt needed
  try {
    return (await request.call(DeviceMotionEvent)) === 'granted';
  } catch {
    return false;
  }
}

function screenAngle(): number {
  const a = screen.orientation?.angle;
  if (typeof a === 'number') return a;
  const legacy = (window as Window & { orientation?: number }).orientation; // old iOS Safari
  return typeof legacy === 'number' ? legacy : 0;
}

/**
 * Device rotation rates (deg/s around device x = portrait-right, y = portrait-up) to view rates:
 * yaw = turn right, pitch = look down (screen convention, matching InputState.addLook).
 */
export function deviceRatesToLook(
  beta: number,
  gamma: number,
  angle: number,
): { yaw: number; pitch: number } {
  // Screen "up" and "right" axes expressed on the device's x/y axes for each orientation.
  switch (((angle % 360) + 360) % 360) {
    case 90: // landscape, device top to the left: up = +x, right = −y
      return { yaw: -beta, pitch: gamma };
    case 270: // landscape, device top to the right: up = −x, right = +y
      return { yaw: beta, pitch: -gamma };
    case 180:
      return { yaw: gamma, pitch: beta };
    default: // portrait: up = +y, right = +x
      return { yaw: -gamma, pitch: -beta };
  }
}

export class GyroLook {
  sensitivity = 1;
  private enabled = false;
  private lastMs: number | null = null;

  constructor(private readonly state: InputState) {}

  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.enabled = on;
    this.lastMs = null;
    if (on) window.addEventListener('devicemotion', this.onMotion);
    else window.removeEventListener('devicemotion', this.onMotion);
  }

  private readonly onMotion = (e: DeviceMotionEvent): void => {
    const r = e.rotationRate;
    const now = e.timeStamp;
    const last = this.lastMs;
    this.lastMs = now;
    if (!r || last === null) return;
    const dt = (now - last) / 1000;
    if (dt <= 0 || dt > INPUT.gyroMaxDtS) return;
    const look = deviceRatesToLook(r.beta ?? 0, r.gamma ?? 0, screenAngle());
    const k = INPUT.gyroGain * this.sensitivity * DEG * dt;
    this.state.addLook(look.yaw * k, look.pitch * k);
  };
}
