import { describe, expect, it } from 'vitest';
import { INPUT } from '../config/tunables';
import { deviceRatesToLook } from './gyro';
import { InputState, gaitFromStick, smoothingFactor } from './input-state';

describe('gaitFromStick', () => {
  it('ignores pushes inside the deadzone', () => {
    expect(gaitFromStick(0)).toBeNull();
    expect(gaitFromStick(INPUT.stickDeadzone - 0.01)).toBeNull();
  });

  it('maps push depth to sneak / walk / run at the plan thresholds', () => {
    expect(gaitFromStick(INPUT.stickDeadzone)).toBe('sneak');
    expect(gaitFromStick(0.59)).toBe('sneak');
    expect(gaitFromStick(0.6)).toBe('walk');
    expect(gaitFromStick(0.89)).toBe('walk');
    expect(gaitFromStick(0.9)).toBe('run');
    expect(gaitFromStick(1)).toBe('run');
  });
});

describe('InputState', () => {
  it('accumulates look until consumed', () => {
    const s = new InputState();
    s.addLook(0.1, -0.2);
    s.addLook(0.05, 0.1);
    const out = s.consumeLook({ yaw: 0, pitch: 0 });
    expect(out.yaw).toBeCloseTo(0.15);
    expect(out.pitch).toBeCloseTo(-0.1);
    expect(s.consumeLook({ yaw: 9, pitch: 9 })).toEqual({ yaw: 0, pitch: 0 });
  });

  it('clears edges and held input on reset', () => {
    const s = new InputState();
    s.moveY = 1;
    s.gait = 'run';
    s.crouchToggle = true;
    s.reset();
    expect([s.moveY, s.gait, s.crouchToggle]).toEqual([0, 'walk', false]);
  });
});

describe('touch look smoothing', () => {
  it('applies all pending look over time and nothing is lost', () => {
    let pending = 100;
    let applied = 0;
    for (let i = 0; i < 60; i++) {
      const d = pending * smoothingFactor(1 / 60, INPUT.touchSmoothingS);
      pending -= d;
      applied += d;
    }
    expect(applied + pending).toBeCloseTo(100, 9);
    expect(pending).toBeLessThan(0.01);
  });

  it('is instant with zero smoothing', () => {
    expect(smoothingFactor(1 / 60, 0)).toBe(1);
  });
});

describe('deviceRatesToLook', () => {
  it('turning the phone right in landscape turns the view right in both landscapes', () => {
    // Landscape 90 (top to the left): turning right = negative rotation about screen-up (+x).
    expect(deviceRatesToLook(-10, 0, 90).yaw).toBeGreaterThan(0);
    // Landscape 270 (top to the right): screen-up is −x, so the sign flips.
    expect(deviceRatesToLook(10, 0, 270).yaw).toBeGreaterThan(0);
  });

  it('tilting the top of the phone away looks up in landscape', () => {
    // Look up = positive rotation about screen-right; −y in landscape 90, +y in 270. pitch<0 = up.
    expect(deviceRatesToLook(0, -10, 90).pitch).toBeLessThan(0);
    expect(deviceRatesToLook(0, 10, 270).pitch).toBeLessThan(0);
  });
});
