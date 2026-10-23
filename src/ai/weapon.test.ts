import { describe, expect, it } from 'vitest';
import { WEAPON } from '../config/tunables';
import { Gun, hitChance, type GunEvent } from './weapon';

const DT = 1 / 60;

/** Step the gun for `seconds`, returning each event with its time. */
function run(gun: Gun, seconds: number, canShoot = true, t0 = 0): [GunEvent, number][] {
  const out: [GunEvent, number][] = [];
  for (let t = t0; t < t0 + seconds - 1e-9; t += DT) {
    const e = gun.step(DT, canShoot);
    if (e) out.push([e, t + DT]);
  }
  return out;
}

describe('Gun', () => {
  it('winds up for 0.6 s before the first shot', () => {
    const gun = new Gun();
    const events = run(gun, 1);
    expect(events[0]![0]).toBe('windup');
    expect(events[1]![0]).toBe('fire');
    expect(events[1]![1] - events[0]![1]).toBeCloseTo(WEAPON.windupS, 1);
  });

  it('keeps shots at least 1.2 s apart, wind-up included', () => {
    const gun = new Gun();
    const shots = run(gun, 6)
      .filter(([e]) => e === 'fire')
      .map(([, t]) => t);
    expect(shots.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < shots.length; i++) {
      expect(shots[i]! - shots[i - 1]!).toBeGreaterThanOrEqual(WEAPON.shotIntervalS - 1e-6);
      expect(shots[i]! - shots[i - 1]!).toBeLessThan(WEAPON.shotIntervalS + 2 * DT);
    }
  });

  it('cancels when the player breaks line of sight mid wind-up', () => {
    const gun = new Gun();
    run(gun, WEAPON.windupS / 2);
    expect(gun.phase).toBe('windup');
    expect(gun.windupFraction).toBeGreaterThan(0.3);
    expect(gun.step(DT, false)).toBe('cancel');
    expect(gun.windupFraction).toBe(0);
    expect(run(gun, 2, false)).toEqual([]);
    // Seen again: a full wind-up starts over.
    const again = run(gun, 1);
    expect(again.map(([e]) => e)).toEqual(['windup', 'fire']);
    expect(again[1]![1] - again[0]![1]).toBeCloseTo(WEAPON.windupS, 1);
  });
});

describe('hitChance', () => {
  it('falls with distance and player speed, within its bounds', () => {
    expect(hitChance(0, 0)).toBeCloseTo(WEAPON.hitChanceNear);
    expect(hitChance(10, 0)).toBeLessThan(hitChance(3, 0));
    expect(hitChance(3, 5)).toBeLessThan(hitChance(3, 0));
    expect(hitChance(1000, 0)).toBeCloseTo(WEAPON.hitChanceMin);
    expect(hitChance(1000, 1000)).toBeCloseTo(WEAPON.hitChanceMin * WEAPON.minSpeedFactor);
    expect(hitChance(-5, -5)).toBeLessThanOrEqual(WEAPON.hitChanceNear);
  });
});
