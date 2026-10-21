import { describe, expect, it } from 'vitest';
import { LIGHT_EXPOSURE } from '../config/tunables';
import { litFraction } from './visibility-meter';

describe('litFraction', () => {
  it('maps darkness to 0 and full light to 1', () => {
    expect(litFraction(LIGHT_EXPOSURE.dark)).toBe(0);
    expect(litFraction(LIGHT_EXPOSURE.lit)).toBe(1);
    expect(litFraction((LIGHT_EXPOSURE.dark + LIGHT_EXPOSURE.lit) / 2)).toBeCloseTo(0.5);
  });

  it('clamps out-of-range exposure', () => {
    expect(litFraction(0)).toBe(0);
    expect(litFraction(2)).toBe(1);
  });
});
