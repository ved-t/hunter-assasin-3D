import { describe, expect, it } from 'vitest';
import { PauseHolds } from './base';

describe('PauseHolds', () => {
  it('pauses on the first hold and resumes only when the last one lifts', () => {
    const changes: boolean[] = [];
    const h = new PauseHolds((p) => changes.push(p));
    h.set('ad', true);
    h.set('hidden', true); // tab hidden during the ad
    h.set('ad', false); // ad ends: still hidden, no resume
    expect(changes).toEqual([true]);
    expect(h.paused).toBe(true);
    h.set('hidden', false);
    expect(changes).toEqual([true, false]);
  });

  it('ignores repeats of the same hold', () => {
    const changes: boolean[] = [];
    const h = new PauseHolds((p) => changes.push(p));
    h.set('blur', true);
    h.set('blur', true);
    h.set('blur', false);
    h.set('blur', false);
    expect(changes).toEqual([true, false]);
  });
});
