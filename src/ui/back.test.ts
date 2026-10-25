import { describe, expect, it } from 'vitest';
import { backAction, type BackState } from './back';

const state = (patch: Partial<BackState>): BackState => ({
  busy: false,
  inLevel: false,
  pauseOpen: false,
  resultOpen: false,
  titleSubscreenOpen: false,
  ...patch,
});

describe('backAction', () => {
  it('pauses a running level from either source', () => {
    expect(backAction(state({ inLevel: true }), 'back')).toBe('pause');
    expect(backAction(state({ inLevel: true }), 'escape')).toBe('pause');
  });

  it('resumes from pause and leaves the result screen on back only', () => {
    expect(backAction(state({ inLevel: true, pauseOpen: true }), 'back')).toBe('resume');
    expect(backAction(state({ inLevel: true, pauseOpen: true }), 'escape')).toBe('none');
    expect(backAction(state({ inLevel: true, resultOpen: true }), 'back')).toBe('menu');
    expect(backAction(state({ inLevel: true, resultOpen: true }), 'escape')).toBe('none');
  });

  it('returns to the title from its sub-screens', () => {
    expect(backAction(state({ titleSubscreenOpen: true }), 'back')).toBe('title');
    expect(backAction(state({ titleSubscreenOpen: true }), 'escape')).toBe('title');
  });

  it('ignores back while a level loads or an ad is up', () => {
    expect(backAction(state({ busy: true }), 'back')).toBe('none');
    expect(backAction(state({ busy: true, inLevel: true }), 'back')).toBe('none');
  });

  it('quits only from the title, and only on back', () => {
    expect(backAction(state({}), 'back')).toBe('quit');
    expect(backAction(state({}), 'escape')).toBe('none');
  });
});
