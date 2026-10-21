import { describe, expect, it } from 'vitest';
import { PLAYER } from '../config/tunables';
import { moveCircle, type Vec2 } from './collision';
import { Grid } from './grid';

const R = PLAYER.radius;
const T = 2;

// Open room x∈[2,12], z∈[2,12] with a pillar at cell (3,3) → box [6,8]×[6,8].
const room = Grid.fromRows(
  ['#######', '#.....#', '#.....#', '#..#..#', '#.....#', '#.....#', '#######'],
  T,
);

function run(grid: Grid, start: Vec2, vx: number, vz: number, steps: number, dt = 1 / 60): Vec2 {
  const pos = { ...start };
  for (let i = 0; i < steps; i++) moveCircle(grid, pos, vx * dt, vz * dt, R);
  return pos;
}

describe('moveCircle', () => {
  it('moves freely in open space', () => {
    const p = moveCircle(room, { x: 4, z: 4 }, 0.5, 0.25, R);
    expect(p.x).toBeCloseTo(4.5);
    expect(p.z).toBeCloseTo(4.25);
  });

  it('stops head-on against a wall at exactly the radius', () => {
    const p = run(room, { x: 4, z: 4 }, -PLAYER.runSpeed, 0, 120);
    expect(p.x).toBeCloseTo(T + R, 5);
    expect(p.z).toBeCloseTo(4, 5);
  });

  it('slides along a wall, keeping the tangential component', () => {
    const v = PLAYER.walkSpeed / Math.SQRT2;
    const p = run(room, { x: 2.5, z: 4 }, -v, v, 30); // 0.5 s
    expect(p.x).toBeCloseTo(T + R, 5);
    expect(p.z).toBeCloseTo(4 + v * 0.5, 5);
  });

  it('slides around a convex corner instead of sticking', () => {
    // Walk straight at the pillar's corner, slightly off-centre: should deflect and pass it.
    const start = { x: 5.9, z: 4 };
    const p = run(room, start, 0, PLAYER.walkSpeed, 120);
    expect(p.z).toBeGreaterThan(9); // made it past the pillar (z ∈ [6, 8])
    expect(p.x).toBeLessThanOrEqual(6 - R + 1e-6);
  });

  it('rests in an inner corner without jitter', () => {
    const v = PLAYER.runSpeed;
    const p = run(room, { x: 4, z: 4 }, -v, -v, 60);
    const settled = { ...p };
    const q = run(room, settled, -v, -v, 120);
    expect(p.x).toBeCloseTo(T + R, 5);
    expect(p.z).toBeCloseTo(T + R, 5);
    expect(q.x).toBeCloseTo(p.x, 9);
    expect(q.z).toBeCloseTo(p.z, 9);
  });

  it('never tunnels through a one-cell wall, even with a huge frame', () => {
    const wall = Grid.fromRows(['#####', '#.#.#', '#####'], T);
    const p = moveCircle(wall, { x: 3, z: 3 }, 10, 0, R);
    expect(p.x).toBeLessThanOrEqual(4 - R + 1e-9);
  });

  it('passes through a one-cell doorway when aligned', () => {
    const door = Grid.fromRows(['#####', '#...#', '##D##', '#...#', '#####'], T);
    const p = run(door, { x: 5, z: 3 }, 0, PLAYER.walkSpeed, 90);
    expect(p.z).toBeGreaterThan(7);
  });

  it('squeezes past a doorway when approaching slightly off-axis', () => {
    const door = Grid.fromRows(['#####', '#...#', '##D##', '#...#', '#####'], T);
    const p = run(door, { x: 4.15, z: 3 }, 0, PLAYER.walkSpeed, 90);
    expect(p.z).toBeGreaterThan(7);
  });
});
