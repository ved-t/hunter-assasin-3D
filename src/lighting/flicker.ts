// Flashlight flicker as a pure function of time, so sim (exposure) and visuals agree.
// `battery` is for dropped / dying lights (later phases), `alertJitter` for a guard in Alert.

import { FLASHLIGHT } from '../config/tunables';

export type FlickerMode = 'steady' | 'battery' | 'alertJitter';

/** Deterministic hash of an integer lattice point and a seed → [0, 1). */
function hash(n: number, seed: number): number {
  const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Smooth 1D value noise in [0, 1). */
function valueNoise(t: number, seed: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  return hash(i, seed) * (1 - u) + hash(i + 1, seed) * u;
}

/** Brightness multiplier (0..1) at time t (s) for a light with the given seed. */
export function flickerIntensity(mode: FlickerMode, t: number, seed: number): number {
  switch (mode) {
    case 'steady':
      return 1;
    case 'alertJitter':
      return 1 - FLASHLIGHT.alertJitterDepth * valueNoise(t * FLASHLIGHT.alertJitterHz, seed);
    case 'battery': {
      // Time is cut into slots; some slots hold one smooth dip of random depth.
      const k = Math.floor(t * FLASHLIGHT.batteryDipRate);
      const phase = t * FLASHLIGHT.batteryDipRate - k;
      const dips = hash(k, seed) < FLASHLIGHT.batteryDipChance;
      const dip = dips
        ? FLASHLIGHT.batteryDipDepth * hash(k, seed + 1) * Math.sin(Math.PI * phase)
        : 0;
      const wobble =
        FLASHLIGHT.batteryWobbleDepth * valueNoise(t * FLASHLIGHT.batteryWobbleHz, seed + 2);
      return Math.min(1, Math.max(0, 1 - dip - wobble));
    }
  }
}
