import { describe, expect, it } from 'vitest';
import { GUARD, PLAYER_HEARING } from '../config/tunables';
import { yawFromDir } from '../core/angles';
import { Grid } from '../level/grid';
import { createSoundField } from '../nav/sound';
import { spotGuard, type SpotSubject } from './spotted';
import { createPlayerView, type PlayerView } from './view';

const T = 2;
const c = (n: number) => (n + 0.5) * T;
const PITCH = (GUARD.flashlightPitchDeg * Math.PI) / 180;

function eye(cx: number, cy: number, dirX: number, dirZ: number): PlayerView {
  return {
    ...createPlayerView(),
    x: c(cx),
    y: 1.6,
    z: c(cy),
    yaw: yawFromDir(dirX, dirZ),
    aspect: 16 / 9,
  };
}

function guard(
  cx: number,
  cy: number,
  dirX: number,
  dirZ: number,
  over: Partial<SpotSubject> = {},
): SpotSubject {
  const yaw = yawFromDir(dirX, dirZ);
  const x = c(cx);
  const z = c(cy);
  return {
    x,
    z,
    speed: 0,
    yaw,
    intensity: 1,
    lens: {
      x: x - Math.sin(yaw) * GUARD.flashlightForward,
      y: GUARD.flashlightHeight,
      z: z - Math.cos(yaw) * GUARD.flashlightForward,
      pitch: PITCH,
    },
    ...over,
  };
}

// Corridor A runs east along row 1; corridor B runs south from (6,1). Walls hide B from A.
const ell = Grid.fromRows(
  ['##########', '#........#', '######.###', '######.###', '######.###', '##########'],
  T,
);

describe('spotGuard: sight and light', () => {
  const lookingEast = eye(1, 1, 1, 0);

  it('sees a guard on screen with LOS directly', () => {
    expect(spotGuard(ell, lookingEast, guard(7, 1, -1, 0), Infinity).kind).toBe('direct');
  });

  it('does not see a guard behind a wall directly', () => {
    const r = spotGuard(ell, lookingEast, guard(6, 4, 0, 1, { intensity: 0 }), Infinity);
    expect(r.kind).toBeNull();
  });

  it('spots a guard round the corner by the light his beam throws into view', () => {
    // He faces north up corridor B: his beam lands on the far wall of corridor A, which the player sees.
    const r = spotGuard(ell, lookingEast, guard(6, 4, 0, -1), Infinity);
    expect(r.kind).toBe('light');
    expect(r.z).toBeLessThan(2 * T); // the perceived light is in corridor A, not B
  });

  it('does not spot him when his beam stays out of view', () => {
    // Facing south into the dead end, every pool and the beam midpoint stay inside corridor B.
    expect(spotGuard(ell, lookingEast, guard(6, 4, 0, 1), Infinity).kind).toBeNull();
  });

  it('does not spot light the player is looking away from', () => {
    expect(spotGuard(ell, eye(1, 1, -1, 0), guard(6, 4, 0, -1), Infinity).kind).toBeNull();
  });

  it('ignores a flashlight too dim to see', () => {
    expect(
      spotGuard(ell, lookingEast, guard(6, 4, 0, -1, { intensity: 0.05 }), Infinity).kind,
    ).toBeNull();
  });

  it('prefers direct over light', () => {
    // On screen and his beam lights the corridor in front of the player too.
    expect(spotGuard(ell, lookingEast, guard(7, 1, -1, 0), 0).kind).toBe('direct');
  });
});

// Two rooms joined by a doorway at (4,2); `sealed` is the same with the doorway walled up.
const rooms = Grid.fromRows(['#########', '#...#...#', '#...D...#', '#...#...#', '#########'], T);
const sealed = Grid.fromRows(['#########', '#...#...#', '#...#...#', '#...#...#', '#########'], T);

function soundDist(grid: Grid, from: SpotSubject, toX: number, toZ: number): number {
  return createSoundField(grid).pathDistance(toX, toZ, from.x, from.z, PLAYER_HEARING.runRangeM);
}

describe('spotGuard: hearing', () => {
  // Facing away from the doorway so sight never counts; flashlight off so light never counts.
  const view = eye(2, 2, -1, 0);
  const walking = PLAYER_HEARING.runSpeed - 1;
  const running = PLAYER_HEARING.runSpeed + 1;

  it('hears a walking guard through a doorway within walk range', () => {
    const g = guard(5, 2, 0, 1, { speed: walking, intensity: 0 });
    const d = soundDist(rooms, g, view.x, view.z);
    expect(d).toBeLessThanOrEqual(PLAYER_HEARING.walkRangeM);
    expect(spotGuard(rooms, view, g, d).kind).toBe('sound');
  });

  it('does not hear through a wall', () => {
    const g = guard(5, 2, 0, 1, { speed: running, intensity: 0 });
    const d = soundDist(sealed, g, view.x, view.z);
    expect(d).toBe(Infinity);
    expect(spotGuard(sealed, view, g, d).kind).toBeNull();
  });

  it('hears running further than walking', () => {
    const far = eye(1, 2, -1, 0);
    const walker = guard(7, 2, 0, 1, { speed: walking, intensity: 0 });
    const d = soundDist(rooms, walker, far.x, far.z);
    expect(d).toBeGreaterThan(PLAYER_HEARING.walkRangeM);
    expect(d).toBeLessThanOrEqual(PLAYER_HEARING.runRangeM);
    expect(spotGuard(rooms, far, walker, d).kind).toBeNull();
    expect(spotGuard(rooms, far, { ...walker, speed: running }, d).kind).toBe('sound');
  });

  it('does not hear a guard standing still', () => {
    const g = guard(5, 2, 0, 1, { speed: 0, intensity: 0 });
    expect(spotGuard(rooms, view, g, soundDist(rooms, g, view.x, view.z)).kind).toBeNull();
  });

  it('prefers light over sound', () => {
    // Running up corridor B, hidden but within earshot, with his beam lighting corridor A.
    const lookingEast = eye(1, 1, 1, 0);
    const g = guard(6, 2, 0, -1, { speed: running });
    const d = soundDist(ell, g, lookingEast.x, lookingEast.z);
    expect(d).toBeLessThanOrEqual(PLAYER_HEARING.runRangeM);
    expect(spotGuard(ell, lookingEast, g, d).kind).toBe('light');
    expect(spotGuard(ell, lookingEast, { ...g, intensity: 0 }, d).kind).toBe('sound');
  });
});
