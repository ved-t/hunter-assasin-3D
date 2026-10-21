import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { TIER_SETTINGS } from '../config/quality';
import { FLASHLIGHT } from '../config/tunables';
import { assignSlots, SpotPool, type SpotCandidate, type SpotPose } from './spot-pool';

const M = 2; // hysteresis margin (m)

function at(id: number, x: number): SpotCandidate {
  return { id, x, z: 0 };
}

function slotsOf(n: number): Int32Array {
  return new Int32Array(n).fill(-1);
}

describe('assignSlots', () => {
  it('gives the lights to the nearest candidates', () => {
    const s = slotsOf(2);
    assignSlots([at(0, 30), at(1, 5), at(2, 10), at(3, 1)], 0, 0, s, 0, M);
    expect([...s].sort()).toEqual([1, 3]);
  });

  it('leaves spare slots free', () => {
    const s = slotsOf(3);
    assignSlots([at(7, 4)], 0, 0, s, 0, M);
    expect([...s]).toEqual([7, -1, -1]);
  });

  it('puts the nearest in the shadow slots', () => {
    const s = slotsOf(3);
    assignSlots([at(0, 9), at(1, 3), at(2, 6)], 0, 0, s, 1, M);
    expect(s[0]).toBe(1);
    expect([...s.slice(1)].sort()).toEqual([0, 2]);
  });

  it('keeps a holder unless a rival is closer by the margin', () => {
    const s = slotsOf(1);
    assignSlots([at(0, 5), at(1, 6)], 0, 0, s, 0, M);
    expect(s[0]).toBe(0);
    assignSlots([at(0, 6.5), at(1, 5)], 0, 0, s, 0, M); // rival only 1.5 m closer
    expect(s[0]).toBe(0);
    assignSlots([at(0, 7.5), at(1, 5)], 0, 0, s, 0, M); // now 2.5 m closer
    expect(s[0]).toBe(1);
  });

  it('holders stay in their slot as others come and go', () => {
    const s = slotsOf(3);
    assignSlots([at(0, 1), at(1, 2), at(2, 3)], 0, 0, s, 0, M);
    const slotOf2 = s.indexOf(2);
    assignSlots([at(1, 2), at(2, 3), at(3, 4)], 0, 0, s, 0, M);
    expect(s.indexOf(2)).toBe(slotOf2);
    expect([...s].sort()).toEqual([1, 2, 3]);
  });
});

describe('SpotPool', () => {
  const pose = (id: number, x: number): SpotPose => ({
    id,
    x,
    y: 1.35,
    z: 0,
    dx: 1,
    dy: 0,
    dz: 0,
    intensity: 1,
  });
  const lightCount = (scene: THREE.Scene) => {
    let n = 0;
    scene.traverse((o) => {
      if ((o as THREE.Light).isLight) n++;
    });
    return n;
  };

  it('never adds or removes lights while updating', () => {
    const scene = new THREE.Scene();
    const pool = new SpotPool(scene, 'medium');
    const n = TIER_SETTINGS.medium.realSpotLights;
    expect(lightCount(scene)).toBe(n);
    for (let frame = 0; frame < 200; frame++) {
      const poses = Array.from({ length: frame % 7 }, (_, i) =>
        pose(i, ((i * 7 + frame) % 23) - 11),
      );
      pool.update(poses, 0, 0, 1 / 60);
      expect(lightCount(scene)).toBe(n);
    }
  });

  it('fades a light in on its holder and parks spares at zero', () => {
    const scene = new THREE.Scene();
    const pool = new SpotPool(scene, 'low');
    for (let i = 0; i < 30; i++) pool.update([pose(4, 3)], 0, 0, 1 / 60);
    expect(pool.weightOf(4)).toBe(1);
    const lights: THREE.SpotLight[] = [];
    scene.traverse((o) => o instanceof THREE.SpotLight && lights.push(o));
    const lit = lights.filter((l) => l.intensity > 0);
    expect(lit).toHaveLength(1);
    expect(lit[0]!.intensity).toBeCloseTo(FLASHLIGHT.spotIntensity);
    expect(lights.every((l) => l.visible)).toBe(true);
  });

  it('only the shadow slots cast shadows, per tier', () => {
    for (const tier of ['low', 'medium', 'high'] as const) {
      const scene = new THREE.Scene();
      new SpotPool(scene, tier);
      let casters = 0;
      scene.traverse((o) => o instanceof THREE.SpotLight && o.castShadow && casters++);
      expect(casters).toBe(TIER_SETTINGS[tier].shadows ? TIER_SETTINGS[tier].shadowSpotLights : 0);
    }
  });

  it('rebuild resizes the pool for a new tier', () => {
    const scene = new THREE.Scene();
    const pool = new SpotPool(scene, 'high');
    pool.rebuild('low');
    expect(lightCount(scene)).toBe(TIER_SETTINGS.low.realSpotLights);
    expect(pool.size).toBe(TIER_SETTINGS.low.realSpotLights);
  });
});
