# CLAUDE.md — Shadow Hunter (working title)

A first-person 3D stealth game for web and Android, inspired by the mobile game *Hunter Assassin*.
The player is an assassin with a knife in dark levels patrolled by armed guards carrying flashlights.
The player can't see through walls, so **guard flashlights are the main way to locate guards**: beams,
light pools on walls and floors, and footsteps reveal them, and a minimap records only what the player has perceived.

Read `PLAN.md` for the phased build plan. Work one phase at a time and stop at the end of each phase for a playtest.

## Targets
- **Web portals:** CrazyGames and Playgama (via Playgama Bridge SDK). Must run in Chrome/Edge/Safari on desktop and mobile.
- **Native Android:** the same web build wrapped with Capacitor.
- One codebase. Platform differences live only in `src/platform/`.

## Hard constraints
- **Initial download ≤ 20 MB** (CrazyGames mobile homepage limit); total ≤ 50 MB; ≤ 1,500 files.
  Lazy-load later levels and audio. Report bundle + asset sizes at the end of every phase.
- **Performance budget:** 60 fps target on desktop and a mid-range Android phone (e.g. 2021 Snapdragon 7-series); 30 fps floor on low-end.
  ≤ 100 draw calls per frame. Cap devicePixelRatio at 1.5 on mobile.
- **Lighting rule:** never add or remove `THREE.Light` objects at runtime (it forces shader recompiles).
  Create a fixed pool of real SpotLights at load (2 on low/mobile, 4 on high) and reassign them to the nearest guards.
  All other flashlights are faked: an additive beam cone mesh plus a light-pool decal or mesh. No shadow maps on the low tier.
- **Input:** must work with mouse+keyboard and with touch only. Never require gyro.
- **iPhone Safari:** has no Fullscreen API and no orientation lock. Size the canvas with `dvh`, show a "rotate to landscape" overlay, and keep UI out of the bottom ~24 px.
- iOS gyro permission (`DeviceOrientationEvent.requestPermission`) must be requested from a real tap, such as the Settings toggle.
- Handle `webglcontextlost` / `webglcontextrestored`.

## Stack
- TypeScript (strict) + Vite.
- three.js with `WebGLRenderer` (WebGL2). No WebGPU in v1. Keep renderer creation in one module so it can be swapped later.
- No physics engine: levels are a 2D tile grid, with grid-based collision, line-of-sight and pathfinding.
- `nipplejs` for the touch move-joystick only. The look-drag area is custom pointer-event code.
- Assets: glTF/GLB with meshopt compression and KTX2 textures (`gltf-transform`). Audio: OGG + M4A fallback, small mono SFX.
- Tests: Vitest for pure logic (grid, LOS, A*, awareness, state machine, damage). No tests for rendering.

## Architecture
```
src/
  main.ts              boot: platform init → load → menu
  core/                game loop (fixed 60 Hz sim step + render interpolation), events, time, rng (seeded)
  config/              tunables.ts (ALL gameplay numbers live here), quality tiers
  level/               level JSON schema, loader, grid, mesh builder (instanced tiles)
  nav/                 A*, BFS sound flood, grid DDA line-of-sight
  player/              controller, health, visibility meter, actions (kill, throw)
  input/               InputState abstraction; keyboard-mouse.ts, touch.ts, gyro.ts
  ai/                  perception.ts, awareness.ts, guard-fsm.ts, search.ts, guard.ts
  lighting/            flashlight visuals (beam, pool), real-light pool manager, light sampling
  perception/          player-side: which guards the player has perceived → minimap memory
  mission/             one attempt as pure sim (player, guards, objectives, stats, stars); restart = new Mission
  render/              renderer setup, materials, post (high tier only), quality scaling
  ui/                  HUD (DOM overlay, not WebGL): minimap canvas, meters, prompts, menus
  audio/               WebAudio manager, positional SFX, footsteps
  platform/            Platform interface + playgama.ts, crazygames.ts, android.ts, dev.ts
  save/                progress + settings via Platform storage
public/levels/*.json   hand-authored levels
```
- Simulation is independent of rendering: AI and perception operate on the grid and plain data, never on meshes.
- All tunable numbers come from `config/tunables.ts`; no magic numbers in logic.
- `?debug=1` URL flag shows: fps, draw calls, triangles, guard cones, awareness values, LKP markers, nav grid, and a light-sampling overlay.

## Gameplay rules (source of truth; details in PLAN.md)
- Player has **3 HP**. Each guard hit = 1 HP. Regenerate 1 HP after 8 s without taking damage or being detected. 0 HP = mission failed.
- Knife kill = instant, from any angle while the guard is not in Alert, within 1.6 m. Living guards block the player; bodies don't.
- Guards: Patrol → Suspicious → Alert → Search → Patrol, driven by a 0–100 awareness gauge that rises fast and drains slowly, with a last-known position (LKP).
- Guards shoot only in Alert, after a 0.6 s wind-up with a visible muzzle tell, so hits are avoidable.
- **Minimap shows only what the player perceived:** a guard appears when the player sees his beam, his light pool or the guard himself, or hears his footsteps within range.
  The marker shows a facing arrow, then freezes and fades over 4 s after the player loses perception. Walls/layout are always shown.
- A dead guard drops his flashlight, which stays on. Other guards investigate stray beams, and a beam landing on a body sets awareness to 100.

## Art direction: "graphic noir"
Not low-poly. Use smooth-shaded mid-detail models with realistic proportions and simple painted/PBR-lite textures from trim sheets.
- Environments are near-black with a cool desaturated moonlight ambient (blue-grey). **Warm flashlight cones are the dominant colour** and the thing the eye reads first.
- Colour language: warm amber = guard light (danger), cyan-white = player-relevant interactables, red = Alert/damage.
- Heavy distance fog. Baked lightmaps or vertex-colour AO for static scenery. Light dust particles inside beams.
- High tier only: vignette, subtle film grain and bloom. On low tier, fake glow with additive sprites.
- Characters: Mixamo-rigged humanoid guards. The first-person gloved hand and knife viewmodel is built in code with procedural animation (Mixamo has no first-person arms). Environments: Poly Haven CC0 textures and modular kits built from simple meshes. Keep a `CREDITS.md` with every asset's licence.

## Working agreements
- Before each phase: read PLAN.md for that phase, use plan mode, and list files you'll touch.
- After each phase: run `npm run build`, report bundle size, run tests, and list how to playtest it on desktop and a phone (`npm run dev -- --host`).
- Keep commits small, one feature each, with messages like `ai: add awareness gauge decay`.
- Don't add dependencies without saying why. Prefer small, focused libraries.
- If a requirement here conflicts with something you find, stop and ask rather than silently changing the design.
