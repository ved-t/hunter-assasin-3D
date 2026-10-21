import { describe, expect, it } from 'vitest';
import { barkFor } from './game-audio';

describe('barkFor', () => {
  it('barks on entering Suspicious, Alert and Search', () => {
    expect(barkFor('patrol', 'suspicious')).toBe('suspicious');
    expect(barkFor('suspicious', 'alert')).toBe('alert');
    expect(barkFor('patrol', 'alert')).toBe('alert');
    expect(barkFor('alert', 'search')).toBe('search');
  });

  it('gives up out loud only when a search ends', () => {
    expect(barkFor('search', 'patrol')).toBe('giveUp');
    expect(barkFor('suspicious', 'patrol')).toBeNull();
  });
});
