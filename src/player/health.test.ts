import { describe, expect, it } from 'vitest';
import { HEALTH } from '../config/tunables';
import { Health } from './health';

const DT = 1 / 60;

function calm(h: Health, seconds: number, detected = false): number {
  let regens = 0;
  for (let t = 0; t < seconds; t += DT) if (h.update(DT, detected)) regens++;
  return regens;
}

describe('Health', () => {
  it('starts full and dies after maxHp hits', () => {
    const h = new Health();
    expect(h.hp).toBe(HEALTH.maxHp);
    expect(h.damaged).toBe(false);
    for (let i = 0; i < HEALTH.maxHp; i++) expect(h.damage()).toBe(true);
    expect(h.dead).toBe(true);
    expect(h.damaged).toBe(true);
    expect(h.damage()).toBe(false);
    expect(h.hp).toBe(0);
  });

  it('regenerates one HP per regen delay of calm, up to full', () => {
    const h = new Health();
    h.damage();
    h.damage();
    expect(calm(h, HEALTH.regenDelayS - 0.1)).toBe(0);
    expect(calm(h, 0.2)).toBe(1);
    expect(h.hp).toBe(HEALTH.maxHp - 1);
    expect(calm(h, HEALTH.regenDelayS + 0.1)).toBe(1);
    expect(h.full).toBe(true);
    expect(calm(h, HEALTH.regenDelayS * 3)).toBe(0);
  });

  it('a hit or a guard seeing the player restarts the clock', () => {
    const h = new Health();
    h.damage();
    calm(h, HEALTH.regenDelayS - 1);
    h.damage();
    expect(calm(h, HEALTH.regenDelayS - 1)).toBe(0);
    calm(h, 0.5, true); // spotted
    expect(calm(h, HEALTH.regenDelayS - 1)).toBe(0);
    expect(calm(h, 1.1)).toBe(1);
  });

  it('never regenerates once dead', () => {
    const h = new Health();
    for (let i = 0; i < HEALTH.maxHp; i++) h.damage();
    expect(calm(h, HEALTH.regenDelayS * 2)).toBe(0);
    expect(h.dead).toBe(true);
  });
});
