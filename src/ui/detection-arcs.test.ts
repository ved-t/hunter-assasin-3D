import { describe, expect, it } from 'vitest';
import type { GuardState } from '../ai/guard-fsm';
import { HUD } from '../config/tunables';
import { arcColor, createArcState, stepArc, type ArcGuard } from './detection-arcs';

const DT = 1 / 60;

function guard(value: number, state: GuardState = 'patrol', seesPlayer = false): ArcGuard {
  return { pos: { x: 0, z: 0 }, awareness: { value }, state, seesPlayer };
}

function hold(s: ReturnType<typeof createArcState>, g: ArcGuard, seconds: number): void {
  for (let t = 0; t < seconds - 1e-9; t += DT) stepArc(s, g, DT);
}

describe('stepArc', () => {
  it('stays hidden while awareness is flat or falling', () => {
    const s = createArcState();
    hold(s, guard(0), 1);
    expect(s.alpha).toBe(0);
    s.last = 50;
    hold(s, guard(40), 1);
    expect(s.alpha).toBe(0);
  });

  it('shows while awareness rises, holds, then fades out', () => {
    const s = createArcState();
    let v = 0;
    for (let i = 0; i < 30; i++) stepArc(s, guard((v += 1)), DT);
    expect(s.alpha).toBe(1);
    hold(s, guard(v), HUD.arcRiseHoldS);
    expect(s.alpha).toBeCloseTo(1);
    hold(s, guard(v), HUD.arcFadeS / 2);
    expect(s.alpha).toBeCloseTo(0.5, 1);
    hold(s, guard(v), HUD.arcFadeS / 2 + DT);
    expect(s.alpha).toBe(0);
  });

  it('stays up while an alert guard has the player in sight, even at full awareness', () => {
    const s = createArcState();
    s.last = 100;
    hold(s, guard(100, 'alert', true), 2);
    expect(s.alpha).toBe(1);
    hold(s, guard(100, 'alert', false), HUD.arcRiseHoldS + HUD.arcFadeS + DT);
    expect(s.alpha).toBe(0);
  });
});

describe('arcColor', () => {
  it('is amber when low, red in Alert', () => {
    expect(arcColor(10, 'suspicious')).toBe('rgb(255,179,71)');
    expect(arcColor(10, 'alert')).toBe('rgb(255,59,48)');
  });
});
