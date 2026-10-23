import { describe, expect, it } from 'vitest';
import { formatTime } from './result-screen';

describe('formatTime', () => {
  it('formats m:ss, flooring and clamping', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(9.9)).toBe('0:09');
    expect(formatTime(90)).toBe('1:30');
    expect(formatTime(605)).toBe('10:05');
    expect(formatTime(-3)).toBe('0:00');
  });
});
