import { describe, expect, it } from 'vitest';
import { GUARD_ANIM } from '../config/tunables';
import {
  deathClipFor,
  pickClip,
  resolveClip,
  type ClipChoice,
  type ClipInput,
  type GuardClip,
} from './guard-anim';

const base: ClipInput = {
  dead: false,
  death: 'deathBack',
  state: 'patrol',
  speed: 0,
  aiming: false,
};
const pick = (i: Partial<ClipInput>) =>
  pickClip({ ...base, ...i }, { clip: 'idle', timeScale: 1 } as ClipChoice);

describe('pickClip', () => {
  it('idles on patrol and looks around when suspicious or searching', () => {
    expect(pick({}).clip).toBe('idle');
    expect(pick({ state: 'suspicious' }).clip).toBe('look');
    expect(pick({ state: 'search' }).clip).toBe('look');
  });

  it('walks and runs, with the stride matched to his speed', () => {
    const walk = pick({ speed: GUARD_ANIM.walkClipMps * 0.6 });
    expect(walk.clip).toBe('walk');
    expect(walk.timeScale).toBeCloseTo(0.6);
    const run = pick({ speed: GUARD_ANIM.runClipMps });
    expect(run.clip).toBe('run');
    expect(run.timeScale).toBeCloseTo(1);
  });

  it('clamps playback for very slow or fast movement', () => {
    expect(pick({ speed: GUARD_ANIM.walkFromMps }).timeScale).toBe(GUARD_ANIM.minTimeScale);
    expect(pick({ speed: 50 }).timeScale).toBe(GUARD_ANIM.maxTimeScale);
  });

  it('aims over everything but death', () => {
    expect(pick({ aiming: true, speed: 3, state: 'alert' }).clip).toBe('shoot');
    expect(pick({ aiming: true, dead: true, death: 'deathFront' }).clip).toBe('deathFront');
  });
});

describe('resolveClip', () => {
  const model =
    (...clips: GuardClip[]) =>
    (c: GuardClip) =>
      clips.includes(c);

  it('plays the clip asked for when the model has it', () => {
    expect(resolveClip('walk', model('idle', 'walk'))).toBe('walk');
  });

  it('stands in idle for a missing clip, so asking again changes nothing', () => {
    const has = model('idle', 'walk');
    expect(resolveClip('shoot', has)).toBe('idle');
    expect(resolveClip('shoot', has)).toBe(resolveClip('idle', has));
  });

  it('falls back to any clip without idle, and to none without clips', () => {
    expect(resolveClip('shoot', model('run', 'walk'))).toBe('walk');
    expect(resolveClip('idle', model())).toBeNull();
  });
});

describe('deathClipFor', () => {
  // Facing −Z (yaw 0): behind him is +Z.
  it('is thrown forward when knifed from behind', () => {
    expect(deathClipFor(0, 0, 0, 0, 1)).toBe('deathBack');
    expect(deathClipFor(0, 0, 0, 0.3, 1)).toBe('deathBack');
  });

  it('doubles over when knifed from the side', () => {
    expect(deathClipFor(0, 0, 0, 1, 0)).toBe('deathFront');
    expect(deathClipFor(0, 0, 0, -1, 0.2)).toBe('deathFront');
  });

  it('follows his facing', () => {
    // Facing +X (yaw −90°): behind him is −X.
    expect(deathClipFor(-Math.PI / 2, 0, 0, -1, 0)).toBe('deathBack');
  });
});
