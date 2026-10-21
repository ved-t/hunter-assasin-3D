import { describe, expect, it } from 'vitest';
import { yawFromDir } from '../core/angles';
import { createPlayerView, inView, type PlayerView } from './view';

function view(over: Partial<PlayerView> = {}): PlayerView {
  return { ...createPlayerView(), x: 0, y: 1.6, z: 0, aspect: 16 / 9, ...over };
}

describe('inView', () => {
  it('sees a point straight ahead (yaw 0 looks −Z)', () => {
    expect(inView(view(), 0, 1.6, -5)).toBe(true);
  });

  it('does not see behind the camera', () => {
    expect(inView(view(), 0, 1.6, 5)).toBe(false);
  });

  it('follows yaw', () => {
    const east = view({ yaw: yawFromDir(1, 0) });
    expect(inView(east, 5, 1.6, 0)).toBe(true);
    expect(inView(east, 0, 1.6, -5)).toBe(false);
  });

  it('is wider than it is tall', () => {
    const v = view();
    const halfV = v.vFov / 2;
    // Just outside the vertical edge, but the same offset sideways is inside the wider horizontal edge.
    const off = Math.tan(halfV) * 10 * 1.05;
    expect(inView(v, 0, 1.6 + off, -10)).toBe(false);
    expect(inView(v, off, 1.6, -10)).toBe(true);
    expect(inView(v, Math.tan(halfV) * v.aspect * 10 * 1.05, 1.6, -10)).toBe(false);
  });

  it('pitch moves the vertical bound', () => {
    // A point on the floor 2 m ahead is below a level view but inside one looking down.
    expect(inView(view(), 0, 0, -2)).toBe(false);
    expect(inView(view({ pitch: -0.6 }), 0, 0, -2)).toBe(true);
    expect(inView(view({ pitch: 0.6 }), 0, 0, -2)).toBe(false);
  });

  it('ignores points closer than the near plane', () => {
    expect(inView(view(), 0, 1.6, -0.01)).toBe(false);
  });
});
