import { describe, expect, it } from 'vitest';
import { FrameStats, stepAccumulator } from './loop';

const DT = 1 / 60;
const MAX_FRAME = 0.25;
const MAX_STEPS = 5;

describe('stepAccumulator', () => {
  it('runs one step for one exact sim frame', () => {
    const r = stepAccumulator(0, DT, DT, MAX_FRAME, MAX_STEPS);
    expect(r.steps).toBe(1);
    expect(r.alpha).toBeCloseTo(0, 6);
  });

  it('runs zero steps and accumulates for short frames (120 Hz display)', () => {
    const r1 = stepAccumulator(0, 1 / 120, DT, MAX_FRAME, MAX_STEPS);
    expect(r1.steps).toBe(0);
    expect(r1.alpha).toBeCloseTo(0.5, 6);
    const r2 = stepAccumulator(r1.accumulator, 1 / 120, DT, MAX_FRAME, MAX_STEPS);
    expect(r2.steps).toBe(1);
  });

  it('runs two steps for a 30 fps frame', () => {
    const r = stepAccumulator(0, 1 / 30, DT, MAX_FRAME, MAX_STEPS);
    expect(r.steps).toBe(2);
  });

  it('keeps alpha in [0, 1) and accumulator below one step', () => {
    let acc = 0;
    for (const dt of [0.001, 0.007, 0.016, 0.017, 0.033, 0.05, 0.1]) {
      const r = stepAccumulator(acc, dt, DT, MAX_FRAME, MAX_STEPS);
      expect(r.alpha).toBeGreaterThanOrEqual(0);
      expect(r.alpha).toBeLessThan(1);
      expect(r.accumulator).toBeLessThan(DT);
      acc = r.accumulator;
    }
  });

  it('caps steps and drops backlog after a long hitch', () => {
    const r = stepAccumulator(0, 10, DT, MAX_FRAME, MAX_STEPS);
    expect(r.steps).toBe(MAX_STEPS);
    expect(r.accumulator).toBeLessThan(DT);
  });

  it('ignores negative frame deltas', () => {
    const r = stepAccumulator(0, -1, DT, MAX_FRAME, MAX_STEPS);
    expect(r.steps).toBe(0);
    expect(r.accumulator).toBe(0);
  });

  it('keeps sim time in step with real time over many frames', () => {
    let acc = 0;
    let steps = 0;
    for (let i = 0; i < 600; i++) {
      const r = stepAccumulator(acc, 1 / 75, DT, MAX_FRAME, MAX_STEPS);
      acc = r.accumulator;
      steps += r.steps;
    }
    // 600 frames at 75 Hz = 8 s = 480 sim steps (±1 for float rounding).
    expect(Math.abs(steps - 480)).toBeLessThanOrEqual(1);
  });
});

describe('FrameStats', () => {
  it('computes average and percentiles over the window', () => {
    const s = new FrameStats(4);
    [10, 20, 30, 40, 50].forEach((ms) => s.push(ms)); // 10 falls out of the window
    expect(s.size).toBe(4);
    expect(s.avgMs()).toBeCloseTo(35);
    expect(s.percentileMs(0)).toBe(20);
    expect(s.percentileMs(1)).toBe(50);
  });

  it('returns 0 when empty', () => {
    expect(new FrameStats().avgMs()).toBe(0);
    expect(new FrameStats().percentileMs(0.5)).toBe(0);
  });
});
