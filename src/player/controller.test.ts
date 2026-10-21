import { describe, expect, it } from 'vitest';
import { INPUT, PLAYER } from '../config/tunables';
import { InputState, type Gait } from '../input/input-state';
import { Grid } from '../level/grid';
import { PlayerController } from './controller';

const DT = 1 / 60;
// Big open room: walls only on the border, interior x,z ∈ [2, 38].
const open = Grid.fromRows(
  Array.from({ length: 20 }, (_, y) =>
    y === 0 || y === 19 ? '#'.repeat(20) : `#${'.'.repeat(18)}#`,
  ),
  2,
);

function input(moveX: number, moveY: number, gait: Gait = 'walk'): InputState {
  const s = new InputState();
  s.moveX = moveX;
  s.moveY = moveY;
  s.gait = gait;
  return s;
}

function settle(p: PlayerController, s: InputState, steps = 60): void {
  for (let i = 0; i < steps; i++) p.step(DT, s, open);
}

const spawn = () => new PlayerController({ x: 20, z: 20, yawDeg: 0 });

describe('PlayerController movement', () => {
  const cases: [Gait, number][] = [
    ['sneak', PLAYER.sneakSpeed],
    ['walk', PLAYER.walkSpeed],
    ['run', PLAYER.runSpeed],
  ];
  for (const [gait, speed] of cases) {
    it(`reaches ${gait} speed (${speed} m/s) and reports the gait`, () => {
      const p = spawn();
      settle(p, input(0, 1, gait));
      expect(p.speed).toBeCloseTo(speed, 6);
      expect(p.gait).toBe(gait);
      expect(p.noiseRadius).toBe(PLAYER.noiseRadius[gait]);
    });
  }

  it('moves forward along −Z at yaw 0 and +X when facing east', () => {
    const p = spawn();
    settle(p, input(0, 1));
    expect(p.pos.z).toBeLessThan(20);
    expect(p.pos.x).toBeCloseTo(20, 6);
    const east = new PlayerController({ x: 20, z: 20, yawDeg: 90 });
    settle(east, input(0, 1));
    expect(east.pos.x).toBeGreaterThan(20);
    expect(east.pos.z).toBeCloseTo(20, 6);
  });

  it('strafes right along +X at yaw 0', () => {
    const p = spawn();
    settle(p, input(1, 0));
    expect(p.pos.x).toBeGreaterThan(20);
  });

  it('is not faster diagonally', () => {
    const p = spawn();
    settle(p, input(Math.SQRT1_2, Math.SQRT1_2, 'run'));
    expect(p.speed).toBeCloseTo(PLAYER.runSpeed, 6);
  });

  it('crouch toggles, lowers the eye and overrides run', () => {
    const p = spawn();
    const s = input(0, 1, 'run');
    s.crouchToggle = true;
    p.step(DT, s, open);
    expect(p.crouched).toBe(true);
    expect(s.crouchToggle).toBe(false); // edge consumed
    settle(p, s);
    expect(p.speed).toBeCloseTo(PLAYER.crouchSpeed, 6);
    expect(p.gait).toBe('crouch');
    expect(p.eyeHeight).toBeCloseTo(PLAYER.crouchEyeHeight, 2);
    s.crouchToggle = true;
    settle(p, s);
    expect(p.crouched).toBe(false);
    expect(p.speed).toBeCloseTo(PLAYER.runSpeed, 6);
  });

  it('stops and reports still with no input', () => {
    const p = spawn();
    settle(p, input(0, 1));
    settle(p, input(0, 0));
    expect(p.speed).toBe(0);
    expect(p.gait).toBe('still');
    expect(p.noiseRadius).toBe(0);
  });

  it('does not build up speed while pushing into a wall', () => {
    const p = new PlayerController({ x: 3, z: 20, yawDeg: -90 }); // facing west, wall at x = 2
    settle(p, input(0, 1, 'run'));
    expect(p.pos.x).toBeCloseTo(2 + PLAYER.radius, 6);
    expect(p.speed).toBeCloseTo(0, 6);
  });
});

describe('PlayerController look', () => {
  const limit = (INPUT.pitchLimitDeg * Math.PI) / 180;

  it('turns right on +yaw and looks down on +pitch', () => {
    const p = spawn();
    p.applyLook(0.2, 0.1);
    expect(p.yaw).toBeCloseTo(-0.2);
    expect(p.pitch).toBeCloseTo(-0.1);
  });

  it('clamps pitch', () => {
    const p = spawn();
    p.applyLook(0, -10);
    expect(p.pitch).toBeCloseTo(limit);
    p.applyLook(0, 20);
    expect(p.pitch).toBeCloseTo(-limit);
  });

  it('inverts Y when asked', () => {
    const p = spawn();
    p.invertY = true;
    p.applyLook(0, 0.1);
    expect(p.pitch).toBeCloseTo(0.1);
  });

  it('keeps yaw within ±π', () => {
    const p = spawn();
    for (let i = 0; i < 100; i++) p.applyLook(0.5, 0);
    expect(Math.abs(p.yaw)).toBeLessThanOrEqual(Math.PI);
  });
});
