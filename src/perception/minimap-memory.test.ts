import { describe, expect, it } from 'vitest';
import { MINIMAP } from '../config/tunables';
import { MinimapMemory, type MarkerSnapshot } from './minimap-memory';

const at = (x: number, z: number): MarkerSnapshot => ({ x, z, yaw: 0.5, state: 'patrol' });
const DT = 1 / 60;

function run(mem: MinimapMemory, seconds: number): void {
  for (let t = 0; t < seconds - 1e-9; t += DT) mem.update(DT);
}

describe('MinimapMemory', () => {
  it('shows nothing until a guard is perceived', () => {
    const mem = new MinimapMemory(2);
    mem.report(0, null, at(1, 1));
    run(mem, 1);
    expect(mem.markers.every((m) => !m.visible)).toBe(true);
  });

  it('snapshots position, facing, state and kind while perceived', () => {
    const mem = new MinimapMemory(1);
    mem.report(0, 'light', { x: 3, z: 4, yaw: 1, state: 'suspicious' });
    const m = mem.markers[0]!;
    expect(m).toMatchObject({ visible: true, live: true, kind: 'light', x: 3, z: 4, yaw: 1 });
    expect(m.state).toBe('suspicious');
    expect(m.alpha).toBe(1);
  });

  it('freezes at the last perceived position once lost', () => {
    const mem = new MinimapMemory(1);
    mem.report(0, 'direct', at(3, 4));
    mem.report(0, null, at(9, 9)); // he walked on, unseen
    run(mem, 1);
    const m = mem.markers[0]!;
    expect(m.live).toBe(false);
    expect(m.visible).toBe(true);
    expect([m.x, m.z]).toEqual([3, 4]);
  });

  it('fades out over MINIMAP.fadeS, then hides', () => {
    const mem = new MinimapMemory(1);
    mem.report(0, 'sound', at(3, 4));
    mem.report(0, null, at(3, 4));
    run(mem, MINIMAP.fadeS / 2);
    expect(mem.markers[0]!.alpha).toBeCloseTo(0.5, 1);
    run(mem, MINIMAP.fadeS / 2 + 0.05);
    expect(mem.markers[0]!.alpha).toBe(0);
    expect(mem.markers[0]!.visible).toBe(false);
  });

  it('comes back at full strength when perceived again', () => {
    const mem = new MinimapMemory(1);
    mem.report(0, 'direct', at(3, 4));
    mem.report(0, null, at(3, 4));
    run(mem, MINIMAP.fadeS - 1);
    mem.report(0, 'light', at(5, 6));
    run(mem, 1);
    expect(mem.markers[0]).toMatchObject({ live: true, alpha: 1, x: 5, kind: 'light' });
  });
});
