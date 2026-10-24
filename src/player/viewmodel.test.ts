import { describe, expect, it } from 'vitest';
import { KNIFE, VIEWMODEL } from '../config/tunables';
import { stabCurve, throwCurve, ViewmodelAnimator, type ViewmodelInput } from './viewmodel';

const still: ViewmodelInput = {
  dt: 1 / 60,
  speed: 0,
  gait: 'still',
  crouched: false,
  lookYaw: 0,
  lookPitch: 0,
  stab: 0,
  threw: false,
  ready: false,
  fall: 0,
};

/** Runs `frames` frames of `input` and returns the last pose (copied). */
function run(a: ViewmodelAnimator, input: Partial<ViewmodelInput>, frames: number) {
  for (let i = 0; i < frames; i++) a.update({ ...still, ...input });
  return { ...a.pose };
}

describe('stab and throw curves', () => {
  it('stab is 0 outside the lock and peaks at the end of the thrust', () => {
    expect(stabCurve(0)).toBe(0);
    expect(stabCurve(1)).toBe(0);
    expect(stabCurve(VIEWMODEL.stabThrustFraction)).toBeCloseTo(1);
    expect(stabCurve(0.15)).toBeGreaterThan(0.5);
    expect(stabCurve(0.9)).toBeLessThan(0.2);
  });

  it('the thrust lands well inside the knife lock', () => {
    expect(VIEWMODEL.stabThrustFraction * KNIFE.lockS).toBeLessThan(KNIFE.lockS / 2);
  });

  it('throw flicks out early and settles', () => {
    expect(throwCurve(0.25)).toBeCloseTo(1);
    expect(throwCurve(0.9)).toBeLessThan(0.4);
    expect(throwCurve(1.5)).toBe(0);
  });
});

describe('ViewmodelAnimator', () => {
  it('barely moves while standing still', () => {
    const p = run(new ViewmodelAnimator(), {}, 120);
    expect(Math.abs(p.x)).toBeLessThan(1e-3);
    expect(Math.abs(p.y)).toBeLessThanOrEqual(VIEWMODEL.breatheM + 1e-6);
    expect(p.z).toBe(-0);
  });

  it('bobs more at a run than at a walk', () => {
    const range = (gait: 'walk' | 'run', speed: number) => {
      const a = new ViewmodelAnimator();
      run(a, { gait, speed }, 30);
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = 0; i < 120; i++) {
        const y = a.update({ ...still, gait, speed }).y;
        lo = Math.min(lo, y);
        hi = Math.max(hi, y);
      }
      return hi - lo;
    };
    expect(range('run', 5)).toBeGreaterThan(range('walk', 3.2) * 1.3);
  });

  it('lowers when crouched and lifts when a takedown is ready', () => {
    const crouched = run(new ViewmodelAnimator(), { crouched: true }, 60);
    const ready = run(new ViewmodelAnimator(), { ready: true }, 60);
    expect(crouched.y).toBeCloseTo(-VIEWMODEL.crouchDropM, 2);
    expect(ready.y).toBeCloseTo(VIEWMODEL.readyRaiseM, 2);
  });

  it('thrusts forward mid-stab', () => {
    const a = new ViewmodelAnimator();
    const p = a.update({ ...still, stab: VIEWMODEL.stabThrustFraction });
    expect(p.z).toBeCloseTo(-VIEWMODEL.stabReachM);
  });

  it('lags behind a turn and springs back', () => {
    const a = new ViewmodelAnimator();
    const turned = a.update({ ...still, lookYaw: 0.2 }).x;
    expect(turned).toBeLessThan(0);
    const later = run(a, {}, 60).x;
    expect(Math.abs(later)).toBeLessThan(Math.abs(turned) / 10);
  });

  it('drops out of view on death', () => {
    const p = run(new ViewmodelAnimator(), { fall: 1 }, 1);
    expect(p.y).toBeLessThan(-VIEWMODEL.fallDropM * 0.9);
  });
});
