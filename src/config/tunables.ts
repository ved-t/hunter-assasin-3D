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

/** Phase 0 performance test scene, kept for perf comparisons (`?level=perf`). */
export const PERF_SCENE = {
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

/** Level geometry and greybox look. Grid column x → world +X, row y → world +Z. */
export const LEVEL = {
  /** Edge length of one grid cell (m). */
  tileSize: 2,
  wallHeight: 3,
  coverHeight: 1,
  /** Cover crates are inset from the cell edge so they read as objects, not walls (m per side). */
  coverInset: 0.1,
  /** Underside of a door lintel (m). */
  doorHeight: 2.2,
  floorColor: 0x22262d,
  wallColor: 0x3a4048,
  coverColor: 0x4a4238,
  lintelColor: 0x30353c,
  /** Floor brightness next to walls/cover (vertex-colour AO), 0..1. */
  floorAo: 0.45,
  exitColor: 0xbff4ff,
  exitEmissiveIntensity: 1.2,
  /** Exit marker floats this far above the floor to avoid z-fighting (m). */
  decalLift: 0.02,
  fogColor: 0x0b0f16,
  fogDensity: 0.05,
  ambientSkyColor: 0x5a6a80,
  ambientGroundColor: 0x0a0c10,
  ambientIntensity: 6,
  /** Fake lamp: glow sprite at this height plus an additive floor pool. */
  lampHeight: 2.6,
  lampGlowSize: 0.7,
  lampPoolRadius: 2.6,
  lampDefaultColor: 0xffc27a,
  lampDefaultIntensity: 0.5,
  debugMarkerSize: 0.3,
} as const;

/** Where level JSON files are fetched from. */
export const LEVEL_FILES = {
  /** Path relative to the page, so builds served from portal subpaths still resolve. */
  dir: 'levels/',
  defaultId: 'small',
} as const;

export const PLAYER = {
  /** Collision circle radius (m). */
  radius: 0.3,
  eyeHeight: 1.6,
  crouchEyeHeight: 1.0,
  /** Exponential rate the eye height eases toward its target (1/s). */
  eyeLerpRate: 10,
  /** Movement speeds (m/s). */
  walkSpeed: 3.2,
  sneakSpeed: 1.6,
  runSpeed: 5.0,
  crouchSpeed: 1.4,
  /** How fast velocity approaches the target while moving / stopping (m/s²). */
  acceleration: 30,
  deceleration: 40,
  /** Footstep noise radius per gait (m), used by AI hearing from Phase 2. */
  noiseRadius: { still: 0, crouch: 1, sneak: 2, walk: 6, run: 12 },
  /** Longest collision sub-step (m); must stay below radius so walls can't be tunnelled. */
  collisionSubstep: 0.15,
  /** Push-out passes per sub-step; two resolves corner cases between adjacent cells. */
  collisionIterations: 2,
} as const;

export const GUARD = {
  /** Collision circle radius (m). */
  radius: 0.35,
  height: 1.8,
  eyeHeight: 1.65,
  /** Flashlight lens: height (m), distance ahead of the body centre (m), tilt below level (deg). */
  flashlightHeight: 1.35,
  flashlightForward: 0.4,
  flashlightPitchDeg: 10,
  walkSpeed: 1.5,
  runSpeed: 4.2,
  /** Suspicious guards walk to the stimulus at this fraction of walk speed. */
  suspiciousSpeedFactor: 0.6,
  /** Turn-rate limits (deg/s), so beams sweep visibly instead of snapping. */
  turnRateDegPerS: { patrol: 110, suspicious: 150, alert: 300, search: 160 },
  /** Facing further than this from the travel direction (deg), turn on the spot before walking. */
  walkTurnGateDeg: 50,
  /** A path point counts as reached within this distance (m). */
  arriveDistM: 0.3,
  /** Suspicious: turn toward the stimulus and pause this long before walking to it (s). */
  suspiciousReactS: 0.6,
  /** Idle look-around: sweep ±arc (deg) over one period (s). */
  lookAroundArcDeg: 55,
  lookAroundPeriodS: 3.2,
  /** Suspicious: look around at the stimulus point for this long (s). */
  investigateLookS: 3,
  /** Search: look around at each search cell for this long (s). */
  searchCellLookS: 1.2,
  /** Re-plan toward a moving goal once it has moved this far (m), at most every repathS. */
  repathMoveM: 1,
  repathS: 0.4,
  /** Alert guards stop this far from a player they can see (Phase 4 shoots from here). */
  standoffM: 3,
} as const;

/** Guard flashlights: the fake beam + light pools every guard has, and the real SpotLight pool. */
export const FLASHLIGHT = {
  rangeM: 12,
  halfAngleDeg: 22,
  /** Rays cast across the cone each frame to clip the beam and place light pools. */
  rays: 7,
  color: 0xffb347,
  /** Additive beam brightness. */
  beamOpacity: 0.12,
  /** The beam fades in over this distance from the lens (m), so the apex doesn't read as a spike. */
  beamNearFadeM: 0.5,
  /** Light-pool quad size per metre of ray distance, and its minimum (m). */
  poolSizePerM: 0.4,
  poolMinSizeM: 0.7,
  /** Additive pool brightness at the lens end; falls off with distance to 0 at range. */
  poolOpacity: 0.55,
  /** Floor pools are stretched along the ray by this factor. */
  floorPoolStretch: 1.8,
  /** Floor pools sit no further along a ray than this (m). */
  floorMaxM: 9,
  /** Wall pools stand this far off the wall (m) to avoid z-fighting. */
  poolLift: 0.03,
  /** Real SpotLight: candela-like intensity, decay and penumbra (0..1). */
  spotIntensity: 60,
  spotDecay: 1.5,
  spotPenumbra: 0.45,
  spotShadowBias: -0.0005,
  spotShadowNear: 0.3,
  /** A real light only switches to another guard if it is this much closer to the camera (m). */
  spotSwitchMarginM: 2,
  /** Fade-out/in time when a real light moves to another guard (s). */
  spotFadeS: 0.15,
  /** High tier: dust particles drifting in each real-lit beam. */
  dustPerBeam: 140,
  dustSizePx: 2.5,
  dustOpacity: 0.5,
  dustDriftMPerS: 0.25,
  /** Flicker: battery dip slots per second, chance a slot dips, max dip depth, faint wobble. */
  batteryDipRate: 0.8,
  batteryDipChance: 0.5,
  batteryDipDepth: 0.75,
  batteryWobbleHz: 6,
  batteryWobbleDepth: 0.08,
  /** Alert jitter frequency (Hz) and depth. */
  alertJitterHz: 14,
  alertJitterDepth: 0.2,
} as const;

/** Player light exposure, which scales how fast guards see them. */
export const LIGHT_EXPOSURE = {
  dark: 0.25,
  lit: 1,
  /** Full exposure within this distance of a lamp (m); falls to dark at LEVEL.lampPoolRadius. */
  lampFullM: 1.2,
  /** LOS from a light is tested to this height on the player (m). */
  sampleHeight: 1,
  /** Beam exposure fades over the outer fraction of the cone angle, and of its range. */
  beamEdgeFraction: 0.25,
  beamRangeFraction: 0.2,
} as const;

export const ALERT = {
  /** An Alert guard alerts every guard within this path distance (m). */
  propagateM: 12,
} as const;

/** Guard sight. Fill rates are awareness/s before the exposure × stance × movement multipliers. */
export const VISION = {
  rangeM: 14,
  /** Full cone angle (deg), i.e. ±35° either side of the facing. */
  fovDeg: 70,
  /** Near zone: inside this distance and full angle the gauge fills faster. */
  nearRangeM: 4,
  nearFovDeg: 30,
  /** Base fill at the guard / at the edge of range, interpolated by distance. */
  fillNearPerS: 60,
  fillFarPerS: 20,
  /** Worst case (near zone, lit, standing, running): 60 × 1.43 × 1.4 ≈ 120/s. */
  nearZoneMult: 1.43,
  /** Points on the player tested for LOS (m above the floor). */
  sampleHeightsStand: [0.3, 1.0, 1.6],
  sampleHeightsCrouch: [0.25, 0.55, 0.85],
  crouchMult: 0.6,
  /** Per player gait; `crouch` is moving while crouched. */
  movementMult: { still: 0.5, crouch: 0.75, sneak: 0.75, walk: 1, run: 1.4 },
} as const;

/** Guard hearing of discrete noise events (footsteps now, impacts and bottles later). */
export const HEARING = {
  /** Awareness from one noise heard at its source, falling linearly to 0 at its radius. */
  awarenessPerNoise: 12,
} as const;

/** Guard awareness gauge (0..max). Rises fast on stimuli, holds, then drains slowly. */
export const AWARENESS = {
  max: 100,
  /** At or above this a Patrol guard becomes Suspicious. */
  suspicious: 30,
  /** Reaching this puts a guard in Alert. */
  alert: 100,
  decayPerS: 15,
  /** Seconds after the last stimulus before decay starts. */
  holdS: 1.5,
  /** Entering Search caps awareness here, so only a fresh sighting (or a shout) re-alerts. */
  searchStart: 70,
  /** After giving up a search, awareness can't drain below this for searchFloorS. */
  searchFloor: 20,
  searchFloorS: 30,
} as const;

/** Search around the LKP after losing the player. */
export const SEARCH = {
  minCells: 4,
  maxCells: 6,
  /** Candidate cells lie within this walking distance of the LKP (m). */
  radiusM: 10,
  /** Cells closer than this to the LKP aren't worth a visit (m). */
  minDistM: 3,
  /** Chosen cells keep at least this far apart (m), so the search spreads out. */
  minSpacingM: 3.5,
  /** Score = headingWeight·cos(angle to the player's last heading) + jitter·random. */
  headingWeight: 1,
  jitter: 0.6,
  giveUpS: 15,
} as const;

export const INPUT = {
  /** Radians per mouse pixel at sensitivity 1. */
  mouseRadPerPx: 0.0022,
  /** Radians per touch-drag pixel at sensitivity 1. */
  touchRadPerPx: 0.006,
  /** Touch look smoothing time constant (s); larger = smoother, laggier. */
  touchSmoothingS: 0.04,
  /** Gyro look gain at sensitivity 1 (rad of view per rad of device rotation). */
  gyroGain: 1.2,
  /** Gaps between motion samples longer than this are ignored (s), e.g. after the tab resumes. */
  gyroMaxDtS: 0.1,
  pitchLimitDeg: 85,
  /** Joystick: below deadzone = no move, < sneakMax = sneak, >= runMin = run, between = walk. */
  stickDeadzone: 0.12,
  stickSneakMax: 0.6,
  stickRunMin: 0.9,
  joystickSizePx: 110,
} as const;

export const SETTINGS_LIMITS = {
  sensitivityMin: 0.2,
  sensitivityMax: 3,
  sensitivityDefault: 1,
  sensitivityStep: 0.05,
} as const;
