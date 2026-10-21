# PLAN.md — Shadow Hunter build plan

Seven phases. Each one ends with something playable and a stop for a playtest.
Don't start the next phase until the current phase's acceptance checks pass and the owner has played it.
All numbers below are **starting values** for `config/tunables.ts`, not final balance.

---

## Phase 0 — Scaffold and performance harness
**Goal:** an empty, fast, measurable foundation.
- Vite + TS (strict) + three.js + Vitest. ESLint + Prettier.
- Renderer module with quality tiers `low | medium | high`, picked automatically (GPU tier guess + a 3-second fps probe) and overridable in settings.
- Fixed-step game loop (60 Hz sim, interpolated render). Seeded RNG.
- `?debug=1` overlay: fps, frame ms, draw calls, triangles, tier.
- Responsive canvas (`dvh`), landscape overlay on portrait phones, context-loss handling.
- `Platform` interface with a `dev` implementation (no-op ads, localStorage save).

**Acceptance:** the test scene (100 instanced boxes, fog, one SpotLight) holds 60 fps on desktop and runs on an Android phone over `--host`. Build < 1 MB JS gzipped.

## Phase 1 — Level grid and first-person controller
**Goal:** walk around a dark greybox level on desktop and phone.
- Level JSON schema: grid size, tile size (2 m), tile types (floor, wall, low cover, door, exit), player spawn, guard spawns + patrol waypoints, lamp positions, objective.
  Include a JSON Schema file and a validator that runs in tests.
- Level mesh builder: InstancedMesh per tile type, merged floor. Two greybox levels (small and medium).
- Player controller: walk 3.2 m/s, sneak 1.6 m/s, run 5.0 m/s, crouch (lower camera, slower, quieter). Grid collision with sliding along walls.
- Desktop input: Pointer Lock with `unadjustedMovement` (fall back to a plain lock), WASD, Shift run, C/Ctrl crouch.
- Touch input: nipplejs dynamic joystick on the left half (push < 60% = sneak, ≥ 90% = run), custom drag-to-look on the right half with smoothing, crouch and context buttons.
- Optional gyro look (off by default; the toggle requests iOS permission).
- Settings: look sensitivity, invert Y, gyro on/off, quality tier.

**Acceptance:** move and look comfortably with mouse and with touch only. No getting stuck on corners. Two-finger use (move + look) works on Android Chrome and iOS Safari.

## Phase 2 — Guards, flashlights and AI
**Goal:** guards patrol with convincing flashlights and can detect and hunt the player.
- Guard entity: capsule placeholder, walks patrol waypoints with A* between them. Turn rate is limited so the beam sweeps visibly.
- **Flashlight visuals** (`lighting/`):
  - Beam: open cone mesh (range 12 m, half-angle 22°), additive, soft-edged via a view-angle and length fade shader, dust particles on the high tier.
  - Light pool: cast 7 grid rays across the cone; place additive quads where rays hit walls or the floor, fading with distance. This is what lets light spill around corners.
  - Real-light pool: N SpotLights (low 2 / medium 3 / high 4) assigned each frame to the guards nearest the camera; never created or destroyed at runtime.
  - Flicker modes for later features (dying battery, Alert jitter).
- **Perception** (`ai/perception.ts`):
  - Vision cone 70° / 14 m. Near zone (< 4 m, centre 30°) fills fast. Sample the player at 3 heights with grid DDA LOS.
  - Fill rate × player light exposure (0.25 in darkness up to 1.0 inside a beam or lamp pool) × stance (crouch 0.6) × movement (still 0.5, run 1.4).
  - Hearing: footstep/impact noises emitted with a loudness radius; reach is measured by BFS path distance on the grid, not straight line.
- **Awareness** (`ai/awareness.ts`): 0–100, rise ~120/s at worst case, decay 15/s after a 1.5 s hold; update the LKP on every stimulus. Thresholds: Suspicious ≥ 30, Alert = 100.
- **FSM** (`ai/guard-fsm.ts`):
  - Patrol: waypoints and idle look-arounds.
  - Suspicious (?): stop, turn the beam toward the stimulus, walk to it at 0.6× speed.
  - Alert (!): chase the LKP at run speed, alert guards within 12 m path distance, shoot on sight (Phase 4).
  - Search: go to the LKP, then visit 4–6 reachable cells around it biased along the player's last heading. Give up after 15 s and return to Patrol (awareness floor 20 for 30 s).
- In-world "?" / "!" icons above guards.
- Unit tests: LOS, BFS hearing through doors vs walls, awareness rise/decay, every FSM transition.

**Acceptance:** with `?debug=1`, cones, awareness and LKPs are visible and behave as specified. Eight guards in the medium level stay at ≥ 50 fps on the Android test phone (low tier).

## Phase 3 — Player-side perception, minimap and HUD
**Goal:** the core idea — you track guards by their light.
- **Light-spotted test** (`perception/`), run at 10 Hz per guard:
  1. If the guard himself is in the camera frustum with grid LOS → perceived (direct).
  2. Else, if any light-pool sample point or beam midpoint is in the frustum with LOS from the camera → perceived (light).
  3. Else, if guard footsteps are within hearing range by BFS distance (8 m walk, 14 m run) → perceived (sound).
- **Minimap** (DOM canvas, top-right, ~22% of the short side): level layout, player arrow, and perceived-guard markers with a facing arrow and state colour.
  When perception ends, the marker freezes at the last position and fades over 4 s.
  Marker types: solid (direct), outlined (light), ripple (sound).
- **Visibility meter** (light-gem style, near the crosshair): the player's current light exposure.
- **Detection arcs:** screen-edge arcs pointing toward any guard whose awareness of you is rising; arc fill = awareness.
- 3D positional audio: guard footsteps, radio chatter barks, and the player's own footsteps (surface-dependent loudness).
- Player noise ring on the minimap when running.

**Acceptance:** in a blind playtest, a new player can locate a guard behind a corner by his light alone. The minimap never shows a guard the player could not have perceived (unit-test the rules).

## Phase 4 — Combat, health, objectives
**Goal:** a complete loop: sneak, kill, survive, exit.
- Knife: the context prompt appears when within 1.6 m, in the guard's rear 220° arc, and the guard is not in Alert. Kill = 0.4 s animation lock, small noise (radius 3 m).
- Guard shooting: Alert only, needs LOS; 0.6 s wind-up with a muzzle flash tell and audio cue; 1 damage per hit; 1.2 s between shots; accuracy falls with distance and player speed.
- Health: 3 HP, damage vignette and directional hit marker; regenerate 1 HP after 8 s without damage or detection.
- Dropped flashlight: stays on at the body. Other guards' perception treats a stray beam as a weak stimulus; a beam landing on a body sets awareness to 100 and starts a search around the body.
- Throwable distraction (bottle): limited count per level; noise radius 10 m; guards become Suspicious toward it.
- Objectives: eliminate all targets, or reach the exit after collecting an item. Win/fail screens with time and kill count. 1–3 star rating: no detection, no damage, under par time.

**Acceptance:** both greybox levels are completable start to finish on desktop and phone. Failing and restarting takes < 2 s.

## Phase 5 — Art, content, progression
**Goal:** looks and feels like a finished game.
- Apply the "graphic noir" art direction from CLAUDE.md: modular environment kit (warehouse, office, mansion), Mixamo guards with walk/run/idle/turn/shoot/death animations (GPU-skinned, shared skeleton), first-person hands and knife viewmodel.
- Baked AO/lightmaps for static props; asset pipeline script with `gltf-transform` (meshopt + KTX2) and a size report.
- 12 hand-made levels across 3 themes with a difficulty curve. Introduce mechanics one at a time: light, sound, bodies, distraction, more guards.
- Progression: gems from levels → unlock skins and a few perks (quieter steps, faster regen). Main menu, level select, settings, pause.
- Audio pass: ambience per theme, music low in the mix, all SFX compressed.

**Acceptance:** initial download (first playable level) ≤ 20 MB, total ≤ 50 MB. 60 fps desktop, ≥ 45 fps on the Android test phone (medium tier).

## Phase 6 — Platforms and release
**Goal:** ship to CrazyGames, Playgama and Google Play.
- `Platform` interface: `init`, `loadingStart/Stop`, `gameplayStart/Stop`, `showInterstitial`, `showRewarded`, `storage get/set`, `getUser`, `onPause/onResume`, `isMobile`.
- `playgama.ts`: Playgama Bridge SDK (game-ready message, interstitials between levels respecting the minimum delay, rewarded "extra HP" or "revive", cloud/local storage, audio and pause handling).
- `crazygames.ts`: CrazyGames HTML5 SDK v3 directly for Full Launch (loading and gameplay events, ads through the SDK only, username/avatar, auto-login, data module).
  Basic Launch can ship with the SDK events only.
- `android.ts`: Capacitor app; AdMob via the community Capacitor plugin; immersive fullscreen; locked landscape; back button = pause; save to Preferences.
  Test on low-end and mid-range devices early, because Android WebView can be slower than Chrome.
- Build targets: `npm run build:crazygames`, `build:playgama`, `build:android`, each with its own entry/config and a zip step.
- Release checklist: size report, file count, content rating (PEGI 12: no gore; deaths are a stylised fall with no blood), privacy notice if collecting data beyond SDKs, mute on ads and on tab blur, works with only mouse / only keyboard+mouse / only touch.

**Acceptance:** builds pass each portal's preview/QA tool, and the Android release APK/AAB installs and plays on two physical devices.

## Later (v1.1+)
- Hunter Sense: occupancy-map overlay showing where guards plan to search.
- Flashlight disguise (pick up a guard's light), breaker boxes, dying-battery guards.
- Optional WebGPU renderer path with WebGL2 fallback.

## Reference
Research doc with sources (stealth UX precedents, lighting performance, AI patterns, touch controls):
https://claude.ai/code/artifact/8d47075f-83e2-431d-98ab-4f3ea1291407
