import { describe, expect, it } from 'vitest';
import { GUARD, PERCEPTION, SIM } from '../config/tunables';
import { yawFromDir } from '../core/angles';
import { Grid } from '../level/grid';
import type { BeamLight } from '../lighting/light-sampling';
import { PlayerPerception, type PerceivableGuard } from './player-perception';
import { createPlayerView, type PlayerView } from './view';

const T = 2;
const c = (n: number) => (n + 0.5) * T;
const DT = 1 / SIM.hz;
const STEPS_PER_TEST = SIM.hz / PERCEPTION.hz;

// Corridor A (row 1) and corridor B (column 6) hidden from it, as in spotted.test.ts.
const ell = Grid.fromRows(
  [
    '##########', // 0
    '#........#', // 1
    '######.###', // 2
    '######.###', // 3
    '######.###', // 4
    '##########', // 5
  ],
  T,
);

const view: PlayerView = {
  ...createPlayerView(),
  x: c(1),
  y: 1.6,
  z: c(1),
  yaw: yawFromDir(1, 0),
  aspect: 16 / 9,
};

function guard(cx: number, cy: number, dirX: number, dirZ: number): PerceivableGuard {
  return {
    pos: { x: c(cx), z: c(cy) },
    yaw: yawFromDir(dirX, dirZ),
    speed: 0,
    state: 'patrol',
    dead: false,
  };
}

function beam(g: PerceivableGuard, intensity = 1): BeamLight {
  return {
    x: g.pos.x - Math.sin(g.yaw) * GUARD.flashlightForward,
    z: g.pos.z - Math.cos(g.yaw) * GUARD.flashlightForward,
    height: GUARD.flashlightHeight,
    yaw: g.yaw,
    intensity,
  };
}

describe('PlayerPerception', () => {
  it('tests each guard once per perception period', () => {
    const guards = Array.from({ length: 8 }, () => guard(7, 1, -1, 0));
    const p = new PlayerPerception(ell, guards.length);
    const beams = guards.map((g) => beam(g));
    for (let s = 0; s < STEPS_PER_TEST - 1; s++) p.step(DT, view, guards, beams);
    expect(p.memory.markers.filter((m) => m.live).length).toBeLessThan(guards.length);
    p.step(DT, view, guards, beams);
    expect(p.memory.markers.every((m) => m.live)).toBe(true);
  });

  it('never puts an unperceivable guard on the minimap', () => {
    // Dark, silent, behind walls, beam pointed into the dead end: nothing the player could notice.
    const hidden = guard(6, 4, 0, 1);
    const p = new PlayerPerception(ell, 1);
    for (let s = 0; s < SIM.hz * 5; s++) p.step(DT, view, [hidden], [beam(hidden)]);
    expect(p.memory.markers[0]!.visible).toBe(false);
  });

  it('marks a guard by his light, then freezes him when the light leaves view', () => {
    const g = guard(6, 4, 0, -1); // beam up corridor B into view
    const p = new PlayerPerception(ell, 1);
    for (let s = 0; s < STEPS_PER_TEST; s++) p.step(DT, view, [g], [beam(g)]);
    expect(p.memory.markers[0]).toMatchObject({ live: true, kind: 'light' });

    const turned = { ...g, yaw: yawFromDir(0, 1) };
    for (let s = 0; s < STEPS_PER_TEST; s++) p.step(DT, view, [turned], [beam(turned)]);
    const m = p.memory.markers[0]!;
    expect(m.live).toBe(false);
    expect(m.visible).toBe(true);
    expect(m.yaw).toBeCloseTo(g.yaw); // frozen at the last perceived facing
  });

  it('drops a dead guard from the minimap even though his flashlight is in plain view', () => {
    const g = guard(7, 1, -1, 0); // in corridor A, facing the player
    const p = new PlayerPerception(ell, 1);
    for (let s = 0; s < STEPS_PER_TEST; s++) p.step(DT, view, [g], [beam(g)]);
    expect(p.memory.markers[0]!.live).toBe(true);
    const body = { ...g, dead: true };
    for (let s = 0; s < SIM.hz; s++) p.step(DT, view, [body], [beam(body)]);
    expect(p.memory.markers[0]!.visible).toBe(false);
    expect(p.results[0]!.kind).toBeNull();
  });
});
