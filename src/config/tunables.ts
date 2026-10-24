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

/** Level geometry, fog and moonlight. Grid column x → world +X, row y → world +Z. */
export const LEVEL = {
  /** Edge length of one grid cell (m). */
  tileSize: 2,
  wallHeight: 3,
  coverHeight: 1,
  /** Cover props stay this far inside their cell's edges, so they read as objects, not walls (m). */
  coverInset: 0.1,
  /** Underside of a door lintel (m). */
  doorHeight: 2.2,
  /** Floor brightness next to walls/cover (vertex-colour AO), 0..1. */
  floorAo: 0.45,
  exitColor: 0xbff4ff,
  exitEmissiveIntensity: 1.2,
  /** Exit marker colour while the objective item is still to be collected. */
  exitLockedColor: 0x2a3236,
  /** Exit marker floats this far above the floor to avoid z-fighting (m). */
  decalLift: 0.02,
  fogColor: 0x0b0f16,
  fogDensity: 0.05,
  ambientSkyColor: 0x5a6a80,
  ambientGroundColor: 0x0a0c10,
  ambientIntensity: 6,
  /** Lamp bulb height and glow size; the light itself is baked (KIT.lampBake*). */
  lampHeight: 2.6,
  lampGlowSize: 0.7,
  /** Radius of the lit zone around a lamp that raises the player's exposure (m). */
  lampPoolRadius: 2.6,
  lampDefaultColor: 0xffc27a,
  lampDefaultIntensity: 0.5,
  debugMarkerSize: 0.3,
} as const;

/**
 * Environment kit (render only): mesh density, the vertex-colour AO and the lamp bake computed at load.
 * AO terms are darkening amounts (0..1) that fade out over a distance (m).
 */
export const KIT = {
  /** Floor and ceiling quads per cell edge; finer grids carry smoother AO and lamp light. */
  floorSubdiv: 4,
  ceilingSubdiv: 2,
  /**
   * Wall faces are split into this many columns, and rows no taller than wallRowM (m), plus a thin row
   * of wallEdgeRowM at the floor and at the ceiling where the AO changes fastest.
   */
  wallColumns: 4,
  wallRowM: 1,
  wallEdgeRowM: 0.35,
  /** Floor and ceiling darken toward walls and cover. */
  floorAoRadiusM: 0.8,
  ceilingAo: 0.35,
  /** Walls darken at their base, under the ceiling and into inside corners. */
  wallBaseAo: 0.4,
  wallBaseAoM: 0.6,
  wallTopAo: 0.3,
  wallTopAoM: 0.5,
  cornerAo: 0.35,
  cornerAoM: 0.7,
  /** Props darken toward the floor. */
  propBaseAo: 0.45,
  propBaseAoM: 0.35,
  /**
   * Lamp bake: warm light added to surfaces in a lamp's line of sight, by horizontal distance like
   * LIGHT_EXPOSURE: full within fullM (= lampFullM) and fading out a little past LEVEL.lampPoolRadius,
   * so what looks lit is what lights the player.
   */
  lampBakeRadiusM: 3,
  lampBakeFullM: 1.2,
  lampBakeGain: 7,
  /** Wrap lighting: how much light reaches surfaces facing away from the lamp (0 = Lambert). */
  lampBakeWrap: 0.35,
  /** Shaded fixtures throw little light upward: down-facing surfaces (ceilings) get this fraction. */
  lampBakeCeiling: 0.35,
  /** Shade inside lamp fixtures glows with this fraction of the lamp's light. */
  fixtureGlow: 0.6,
  /** Surface points are pushed this far off the surface before the lamp's LOS test (m). */
  bakeNormalOffsetM: 0.05,
} as const;

/** High-tier post: half-resolution bloom, then a vignette and film grain pass. */
export const POST = {
  bloomStrength: 0.55,
  bloomRadius: 0.5,
  /** Linear HDR luminance above which pixels bloom (lens glows, lamps, the exit). */
  bloomThreshold: 0.8,
  vignette: 0.45,
  /** Vignette starts this far from the centre (0 = centre, 1 = corner). */
  vignetteStart: 0.35,
  grain: 0.045,
  /** MSAA samples for the post render target when the tier has antialiasing. */
  msaaSamples: 4,
} as const;

/** Where level JSON files are fetched from. */
export const LEVEL_FILES = {
  /** Path relative to the page, so builds served from portal subpaths still resolve. */
  dir: 'levels/',
} as const;

/** Where lazily-loaded art is fetched from (relative to the page, like LEVEL_FILES). */
export const ASSET_FILES = {
  /** One folder per theme: albedo/normal/orm.ktx2 trim sheets and sheet.json. */
  themesDir: 'assets/themes/',
  /** bank.json and one folder per sound pack (scripts/assets/build-audio.mjs). */
  audioDir: 'assets/audio/',
  /** The skinned guard (scripts/assets/build-characters.mjs); capsules stand in when it is missing. */
  guardModel: 'assets/characters/guard.glb',
} as const;

/** Limits every level must respect, so one long-lived scene can host any of them. */
export const LEVEL_LIMITS = {
  /**
   * Most guards in a level. Flashlight and guard meshes are sized for this once, so switching levels
   * never resizes buffers or changes the scene's light count.
   */
  maxGuards: 10,
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
  /** Footstep noise radius per gait (m), heard by guards by path distance. */
  noiseRadius: { still: 0, crouch: 1, sneak: 2, walk: 6, run: 12 },
  /** Seconds between footsteps per moving gait; each footstep is one noise event. */
  footstepIntervalS: { crouch: 0.75, sneak: 0.65, walk: 0.5, run: 0.34 },
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
  /** Gait from ground speed (m/s): below movingSpeed is still, at or above runSpeed is running. */
  gaitMovingSpeed: 0.2,
  gaitRunSpeed: 2.5,
  /** Seconds between footsteps per gait. */
  footstepIntervalS: { walk: 0.55, run: 0.34 },
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

/** First-person camera motion until the Phase 5 viewmodel: knife lunge and the death fall. */
export const CAMERA_FX = {
  lungeM: 0.18,
  lungeDipRad: 0.08,
  /** The view drops to this eye height (m) and rolls this far (rad) as the player falls. */
  fallEyeHeight: 0.35,
  fallRollRad: 0.5,
} as const;

/** Mission prop look: the thrown bottle and the objective item. */
export const PROPS = {
  bottleRadius: 0.04,
  bottleLength: 0.26,
  bottleColor: 0x2f4a36,
  bottleSpinRadPerS: 14,
  /** Item: floating cyan-white octahedron (player-relevant colour), bobbing and turning. */
  itemSize: 0.18,
  itemColor: 0xbff4ff,
  itemHeight: 0.9,
  itemBobM: 0.08,
  itemBobHz: 0.6,
  itemSpinRadPerS: 1.6,
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

/** Placeholder guard look: capsule body, lens glow, and the in-world state icons. */
export const GUARD_VISUALS = {
  bodyColor: 0x2b323c,
  bodyRadius: 0.28,
  /** Lens glow sprite size (m); seen only when the guard faces the camera. */
  lensGlowSize: 0.35,
  /** Sharpness of the lens glow's falloff as the guard turns away (power of the facing cosine). */
  lensGlowFalloff: 4,
  iconHeight: 2.25,
  iconSize: 0.45,
  /** A killed guard tips over onto the floor over this long (s): a stylised fall, no blood. */
  fallS: 0.4,
  /** Gun muzzle relative to the body centre (m): ahead, to his right, height. */
  muzzleForward: 0.5,
  muzzleRight: 0.22,
  muzzleHeight: 1.3,
  /** Wind-up tell: a red glint growing from min to max size (m) as the shot nears. */
  tellSizeMin: 0.12,
  tellSizeMax: 0.45,
  /** Muzzle flash: shown this long after a shot (s), this size (m) and colour. */
  muzzleFlashS: 0.07,
  muzzleFlashSize: 0.7,
  muzzleFlashColor: 0xfff1c8,
  /** Amber "?" (Suspicious, Search) and red "!" (Alert). */
  suspiciousColor: 0xffb347,
  searchColor: 0xc98a3a,
  alertColor: 0xff3b30,
} as const;

export const ALERT = {
  /** An Alert guard alerts every guard within this path distance (m). */
  propagateM: 12,
} as const;

/** Player health. */
export const HEALTH = {
  maxHp: 3,
  /** One HP comes back after this long with no hit and no guard seeing the player (s). */
  regenDelayS: 8,
} as const;

/** Guard sidearm. Alert guards only, with a readable wind-up so every hit is avoidable. */
export const WEAPON = {
  /** Shoots only within this distance (m) of a player in sight. */
  rangeM: 14,
  /** Muzzle tell before the shot (s); breaking line of sight during it cancels the shot. */
  windupS: 0.6,
  /** Shortest time between two shots (s), wind-up included. */
  shotIntervalS: 1.2,
  damage: 1,
  /** Hit chance at point blank, minus this much per metre, never below the minimum. */
  hitChanceNear: 0.9,
  hitFalloffPerM: 0.045,
  hitChanceMin: 0.2,
  /** Hit chance × (1 − penalty × player speed in m/s), never below minSpeedFactor. */
  speedPenaltyPerMps: 0.1,
  minSpeedFactor: 0.45,
  /** A shot alerts other guards within this path distance (m), sharing the shooter's LKP. */
  shotAlertM: 20,
} as const;

/** Knife takedown. */
export const KNIFE = {
  /** Reach, guard centre to player centre (m). */
  rangeM: 1.6,
  /** The player must be inside the guard's rear arc this wide (deg); his front 140° is safe. */
  rearArcDeg: 220,
  /** The kill locks player movement this long (s); look stays free. */
  lockS: 0.4,
  /** The kill itself makes this much noise (m of radius). */
  noiseRadiusM: 3,
} as const;

/** Mission flow: objectives and the end of a run. */
export const MISSION = {
  /** Walking within this distance (m) of the objective item picks it up. */
  itemPickupM: 0.9,
  /** After the killing hit, the death fall plays this long before the fail screen (s). */
  failDelayS: 1.2,
  /** After winning, a short beat before the result screen (s). */
  winDelayS: 0.6,
} as const;

/** Gems: earned by beating your best on a level, spent in the loadout (config/unlocks.ts). */
export const PROGRESSION = {
  /** For each star above the level's previous best. */
  gemsPerNewStar: 10,
  /** On top, the first time a level is won. */
  gemsFirstClear: 10,
} as const;

/** What each perk changes; one perk can be equipped at a time. */
export const PERKS = {
  /** Quieter steps: footstep noise radius ×. */
  quietStepsNoiseScale: 0.8,
  /** Faster regen: seconds of calm per hit point back (HEALTH.regenDelayS without it). */
  fastRegenDelayS: 6,
  /** Extra bottle: bottles on top of the level's count. */
  extraBottles: 1,
} as const;

/** Thrown distraction bottle. */
export const BOTTLE = {
  /** Bottles per level when the level JSON doesn't say. */
  defaultCount: 3,
  /** Launch speed (m/s) and extra upward angle over the camera pitch (deg). */
  speedMps: 11,
  loftDeg: 10,
  gravity: 9.8,
  /** Released this far below the eye and ahead of the player (m). */
  releaseDropM: 0.25,
  releaseForwardM: 0.35,
  /** Longest collision sub-step (m) and the longest flight before it counts as landed (s). */
  substepM: 0.25,
  maxFlightS: 4,
  /** Guards within this path distance (m) of the impact become Suspicious toward it. */
  noiseRadiusM: 10,
} as const;

/** Dead guards: the body, and the flashlight he drops, which stays on. */
export const BODIES = {
  /** The flashlight lands this far ahead of the body (m), lens this high off the floor (m). */
  dropForwardM: 0.6,
  dropLensHeight: 0.12,
  /** Tilt of the dropped beam below level (deg); small, so it rakes along the floor. */
  dropLensPitchDeg: 1.5,
  /** The dropped beam points along the guard's last facing ± this much (deg). */
  dropYawJitterDeg: 25,
  /** A beam must reach this point on a body lying on the floor (m), so low cover can hide it. */
  bodySampleHeight: 0.3,
  /** Each living guard checks for bodies and stray light this often (Hz), staggered across steps. */
  checkHz: 10,
  /** A stray light (lens or pool) is noticed within this distance (m) inside the vision cone. */
  strayLightRangeM: 20,
  /** Seeing a stray light adds this much awareness per second (a weak stimulus)... */
  strayLightPerS: 12,
  /** ...but never lifts awareness above this: light alone makes a guard curious, not Alert. */
  strayLightCap: 60,
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

/** Player-side perception: which guards the player could have noticed, which feeds the minimap. */
export const PERCEPTION = {
  /** Each guard is re-tested this often (Hz); guards are staggered across sim steps. */
  hz: 10,
} as const;

/** What the player can see. Tests use the camera frustum and grid LOS, never the rendered image. */
export const PLAYER_SIGHT = {
  /** Points must lie inside this fraction of the frustum's half-angles to count as on screen. */
  frustumScale: 0.95,
  /** A guard's dark body reads up to this far (m); fog hides it beyond. */
  directMaxM: 20,
  /** Bright additive light (beams, pools) reads this far (m). */
  lightMaxM: 30,
  /** Points on the guard's body tested for LOS (m above the floor). */
  bodySampleHeights: [0.9, 1.6],
  /** A flashlight dimmer than this (0..1) doesn't count as visible light. */
  minLightIntensity: 0.15,
  /** Wall pool points are pulled this far off the wall before the LOS test (m). */
  pointInsetM: 0.1,
} as const;

/** What the player can hear of guards: their footsteps, by path distance through the grid. */
export const PLAYER_HEARING = {
  walkRangeM: 8,
  runRangeM: 14,
} as const;

/** HUD minimap (DOM canvas, top-right). Shows the layout, the player and only perceived guards. */
export const MINIMAP = {
  /** A lost guard's marker freezes, then fades out over this long (s). */
  fadeS: 4,
  /** Diameter as a fraction of the screen's short side. */
  sizeFraction: 0.22,
  /** World radius shown around the player (m). */
  viewRadiusM: 14,
  /** Resolution of the pre-drawn level layout (px per m). */
  layoutPxPerM: 8,
  maxDpr: 2,
  backgroundColor: 0x05070a,
  backgroundAlpha: 0.7,
  floorColor: 0x1c222a,
  wallColor: 0x56606c,
  coverColor: 0x5e5040,
  doorColor: 0x2c333c,
  rimColor: 0x8a96a4,
  playerColor: 0xbff4ff,
  /** Marker colour per guard state (Patrol pale amber, then the in-world icon colours). */
  stateColors: {
    patrol: 0xe8cf9a,
    suspicious: GUARD_VISUALS.suspiciousColor,
    search: GUARD_VISUALS.searchColor,
    alert: GUARD_VISUALS.alertColor,
  },
  /** Bodies of guards the player has killed: a grey cross. */
  bodyColor: 0x7c838c,
  /** Marker and player-arrow radius as a fraction of the minimap diameter. */
  markerSizeFraction: 0.035,
  /** Sound markers ripple outward at this rate (Hz) to this multiple of the marker size. */
  rippleHz: 1.4,
  rippleScale: 2.4,
  /** Player footsteps at least this loud (m of noise radius) draw an expanding ring. */
  noiseRingMinRadiusM: PLAYER.noiseRadius.run,
  noiseRingS: 0.7,
  noiseRings: 4,
} as const;

/** HUD overlays near the crosshair and on the screen edges (DOM, not WebGL). */
export const HUD = {
  /** Light gem: eases toward the player's exposure with this time constant (s). */
  meterSmoothingS: 0.12,
  /** Detection arcs: an arc stays up this long after the guard's awareness last rose (s). */
  arcRiseHoldS: 0.6,
  /** ...then fades out over this long (s). */
  arcFadeS: 0.5,
  /** Arcs sit on an ellipse this far in from the screen edges (fraction of each half-size). */
  arcInset: 0.82,
  /** Angular length of an arc (deg) and its stroke width (px). */
  arcSpanDeg: 26,
  arcWidthPx: 5,
  /** Awareness from this up to Alert tints the arc from amber to red (0..100). */
  arcRedFrom: 60,
  /** Damage vignette: a hit's red flash fades over this long (s); it pulses at or below lowHp. */
  hitFlashS: 0.6,
  lowHp: 1,
  /** Hit markers: pool size, ring radius (fraction of the short half-side), arc span, width, life. */
  hitMarkers: 4,
  hitMarkerRadius: 0.3,
  hitMarkerSpanDeg: 40,
  hitMarkerWidthPx: 6,
  hitMarkerS: 1.2,
  /** Level intro card (name + tip): on screen this long once play starts (s), the last part fading. */
  introCardS: 6,
  introFadeS: 0.8,
} as const;

/** Sound: recorded samples with the procedural synth as fallback. Gains are linear, 0..1. */
export const AUDIO = {
  masterGain: 0.8,
  /** Simultaneous one-shot voices; a louder new sound steals the quietest. */
  maxVoices: 12,
  /** Fade when a voice is stolen or the context suspends (s). */
  stealFadeS: 0.03,
  /** Guard footsteps at the source; heard by path distance within PLAYER_HEARING ranges. */
  guardStepGain: { walk: 0.35, run: 0.6 },
  /** The player's own footsteps (not positional). */
  playerStepGain: { crouch: 0.04, sneak: 0.08, walk: 0.16, run: 0.28 },
  /** Radio barks: gain at the source and how far they carry by path distance (m). */
  barkGain: 0.45,
  barkRangeM: 20,
  /** Idle radio chatter on patrol: seconds between barks per guard, min..max. */
  chatterIntervalS: [10, 24],
  /** Lowpass cutoff (Hz) with a clear line of sight to the source, and through walls. */
  openCutoffHz: 9000,
  occludedCutoffHz: 900,
  /** Ear and source heights for the occlusion LOS test (m). */
  earHeight: 1.6,
  sourceHeight: 1.2,
  /** Combat one-shots: loudness at the source... */
  sfxGain: {
    knife: 0.5,
    windup: 0.55,
    shot: 0.9,
    whiz: 0.35,
    hurt: 0.6,
    throw: 0.25,
    shatter: 0.6,
    pickup: 0.35,
    win: 0.4,
    fail: 0.4,
  },
  /** ...and, for those that come from a place, how far they carry by path distance (m). */
  sfxRangeM: { windup: 16, shot: 45, shatter: 22 },
  /** Recorded one-shots play at 1 ± this rate (pitch) so repeats don't sound copied. */
  sampleRateJitter: 0.06,
  /** Recorded footsteps play this much faster (higher, snappier) at a run. */
  runStepRate: 1.08,
  /** Music bed gain on the music bus: the menu track, and the in-level track (low under the game). */
  musicGain: { menu: 0.5, level: 0.18 },
  /** Theme ambience loop gain on the effects bus. */
  ambienceGain: 0.3,
  /** Procedural room tone standing in for a missing ambience: gain and lowpass cutoff (Hz). */
  roomToneGain: 0.05,
  roomToneCutoffHz: 260,
  /** Crossfade time when the music or ambience bed changes (s). */
  loopFadeS: 1.5,
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
  /** Volume sliders, 0..1. */
  volumeDefault: 1,
  volumeStep: 0.05,
} as const;
