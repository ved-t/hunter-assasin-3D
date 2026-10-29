import { describe, expect, it } from 'vitest';
import { AWARENESS } from '../config/tunables';
import { Awareness } from './awareness';

const DT = 1 / 60;

function tick(a: Awareness, seconds: number): void {
  for (let t = 0; t < seconds - 1e-9; t += DT) a.update(DT);
}

describe('Awareness', () => {
  it('rises with stimuli and clamps at max', () => {
    const a = new Awareness();
    a.stimulus(40, 1, 2);
    expect(a.value).toBe(40);
    a.stimulus(500, 1, 2);
    expect(a.value).toBe(AWARENESS.max);
  });

  it('updates the LKP and heading on every stimulus', () => {
    const a = new Awareness();
    a.stimulus(5, 1, 2, 3, 4);
    expect(a.lkp).toEqual({ x: 1, z: 2 });
    expect(a.heading.x).toBeCloseTo(0.6);
    expect(a.heading.z).toBeCloseTo(0.8);
    // A sound (no heading) moves the LKP but keeps the last known heading.
    a.stimulus(5, 7, 8);
    expect(a.lkp).toEqual({ x: 7, z: 8 });
    expect(a.heading.x).toBeCloseTo(0.6);
  });

  it('ignores non-positive stimuli', () => {
    const a = new Awareness();
    a.stimulus(0, 1, 1);
    expect(a.lkp).toBeNull();
    expect(a.sinceStimulus).toBe(Infinity);
  });

  it('holds before decaying, then drains at decayPerS', () => {
    const a = new Awareness();
    a.stimulus(60, 0, 0);
    tick(a, AWARENESS.holdS - 0.1);
    expect(a.value).toBe(60);
    tick(a, 0.1 + 2);
    expect(a.value).toBeCloseTo(60 - AWARENESS.decayPerS * 2, 0);
    tick(a, 10);
    expect(a.value).toBe(0);
  });

  it('drains at decayScale × decayPerS', () => {
    const a = new Awareness();
    a.decayScale = 0.5;
    a.stimulus(60, 0, 0);
    tick(a, AWARENESS.holdS + 2);
    expect(a.value).toBeCloseTo(60 - AWARENESS.decayPerS * 0.5 * 2, 0);
  });

  it('a new stimulus restarts the hold', () => {
    const a = new Awareness();
    a.stimulus(60, 0, 0);
    tick(a, AWARENESS.holdS + 1);
    const v = a.value;
    a.stimulus(1, 0, 0);
    tick(a, AWARENESS.holdS - 0.1);
    expect(a.value).toBeCloseTo(v + 1, 5);
  });

  it('raiseTo never lowers awareness and counts as a stimulus', () => {
    const a = new Awareness();
    a.stimulus(80, 0, 0);
    a.raiseTo(50, 3, 3);
    expect(a.value).toBe(80);
    expect(a.lkp).toEqual({ x: 3, z: 3 });
    a.raiseTo(AWARENESS.alert, 4, 4);
    expect(a.value).toBe(AWARENESS.alert);
  });

  it('respects a temporary floor, then drains to zero once it expires', () => {
    const a = new Awareness();
    a.setFloor(AWARENESS.searchFloor, AWARENESS.searchFloorS);
    expect(a.value).toBe(AWARENESS.searchFloor);
    tick(a, AWARENESS.searchFloorS - 1);
    expect(a.value).toBe(AWARENESS.searchFloor);
    tick(a, 1 + AWARENESS.searchFloor / AWARENESS.decayPerS + 0.1);
    expect(a.value).toBe(0);
  });
});
