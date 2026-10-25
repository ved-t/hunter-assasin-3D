import { describe, expect, it } from 'vitest';
import { GUARD_AIM } from '../config/tunables';
import { aimTarget, recoilKick, settleAim } from './guard-aim';

const idle = { phase: 'idle' as const, windupFraction: 0, sinceShot: Infinity };
const windup = (f: number) => ({ phase: 'windup' as const, windupFraction: f, sinceShot: 9 });

describe('aimTarget', () => {
  it('is lowered when he has not shot', () => {
    expect(aimTarget(idle)).toBe(0);
  });

  it('rises over the wind-up, front-loaded', () => {
    expect(aimTarget(windup(0))).toBe(0);
    expect(aimTarget(windup(0.5))).toBeGreaterThan(0.5);
    expect(aimTarget(windup(1))).toBe(1);
    const steps = [0, 0.25, 0.5, 0.75, 1].map((f) => aimTarget(windup(f)));
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1] as number);
  });

  it('stays raised for the hold after a shot, then drops', () => {
    expect(aimTarget({ ...idle, sinceShot: 0 })).toBe(1);
    expect(aimTarget({ ...idle, sinceShot: GUARD_AIM.holdS * 0.9 })).toBe(1);
    expect(aimTarget({ ...idle, sinceShot: GUARD_AIM.holdS })).toBe(0);
  });
});

describe('settleAim', () => {
  it('rises with the target at once', () => {
    expect(settleAim(0.2, 0.7, 1 / 60)).toBe(0.7);
  });

  it('lowers at a capped rate, so a cancelled wind-up does not snap down', () => {
    let w = 1;
    let t = 0;
    const dt = 1 / 60;
    w = settleAim(w, 0, dt);
    expect(w).toBeCloseTo(1 - dt / GUARD_AIM.lowerS);
    while (w > 0) {
      w = settleAim(w, 0, dt);
      t += dt;
    }
    expect(t).toBeCloseTo(GUARD_AIM.lowerS - dt, 1);
  });

  it('never lowers past the target', () => {
    expect(settleAim(0.5, 0.49, 1)).toBe(0.49);
  });
});

describe('recoilKick', () => {
  it('peaks at the shot and is gone after kickS', () => {
    expect(recoilKick(0)).toBe(1);
    expect(recoilKick(GUARD_AIM.kickS / 2)).toBeCloseTo(0.25);
    expect(recoilKick(GUARD_AIM.kickS)).toBe(0);
    expect(recoilKick(Infinity)).toBe(0);
  });
});
