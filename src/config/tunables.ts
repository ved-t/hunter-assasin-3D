// All gameplay and engine numbers live here. Logic modules import from this file; no magic numbers elsewhere.

export const SIM = {
  /** Fixed simulation rate (Hz). */
  hz: 60,
  /** Longest real frame delta fed to the accumulator (s); larger gaps (tab switch, hitch) are clamped. */
  maxFrameDt: 0.25,
  /** Maximum sim steps per rendered frame, to avoid the spiral of death on slow devices. */
  maxStepsPerFrame: 5,
} as const;

export const PERF = {
  /** Duration of the startup fps probe (s). */
  probeSeconds: 3,
  /** Frames ignored at probe start (shader compile / upload hitches). */
  probeWarmupFrames: 20,
  /** If the probe's median fps is below this, drop one quality tier. */
  probeDowngradeFps: 50,
  /** Debug overlay refresh interval (s). */
  debugRefreshSeconds: 0.25,
  /** Rolling window of frame times kept for stats. */
  frameStatsWindow: 120,
} as const;

export const DISPLAY = {
  /** Hard devicePixelRatio cap on mobile (CLAUDE.md performance budget). */
  mobileMaxDpr: 1.5,
  fovDeg: 70,
  near: 0.05,
  far: 80,
} as const;

export const DEFAULT_SEED = 1337;

/** Phase 0 performance test scene. Replaced by real levels in Phase 1. */
export const TEST_SCENE = {
  boxCount: 100,
  areaSize: 40,
  boxMinSize: 0.6,
  boxMaxSize: 2.4,
  floorColor: 0x1a1d22,
  boxColor: 0x3a4048,
  fogDensity: 0.045,
  fogColor: 0x0b0f16,
  ambientSkyColor: 0x5a6a80,
  ambientGroundColor: 0x0a0c10,
  ambientIntensity: 0.6,
  spotColor: 0xffb347,
  spotIntensity: 80,
  spotRange: 18,
  spotAngleDeg: 22,
  spotPenumbra: 0.5,
  spotDecay: 1.5,
  spotHeight: 1.6,
  spotSweepRadPerSec: 0.6,
  spotAimDistance: 8,
  cameraOrbitRadius: 14,
  cameraHeight: 4,
  cameraOrbitRadPerSec: 0.08,
} as const;
