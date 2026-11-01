# Shadow Hunter — Project Context & Guidelines

## Overview
**Shadow Hunter** (working title, repo `hunter_assasin_3d`) is a first-person 3D stealth action game designed for Web portals (CrazyGames, Playgama) and native Android (via Capacitor). It is inspired by the top-down mobile hit *Hunter Assassin*, reimagined as an atmospheric, immersive first-person 3D experience with a "graphic noir" aesthetic.

The player is an assassin armed with a combat knife operating inside dimly lit industrial warehouses, corporate offices, and luxury mansions patrolled by armed guards. Because the player cannot see through walls, **guard flashlights and auditory cues are the primary method of tracking enemy positions**—volumetric light beams, light pools cast against walls/floors, and echoing footsteps reveal guard patrols.

---

## Core Gameplay & Mechanics
- **Player Stance & Health**:
  - 3 HP. Each guard bullet hit deals 1 HP.
  - Health regenerates (1 HP) after 8 seconds without taking damage or being detected.
  - Movement modes: Sneak (1.6 m/s, quieter, lower visibility), Walk (3.2 m/s), Run (5.0 m/s, creates audible sound ring), Crouch (lowers camera and visibility).
- **Assassination / Combat**:
  - Instant knife takedown when within 1.6 m behind/beside guards (0.4 s animation lock, localized noise radius 3 m).
  - Living guards have physical collision blocking player passage; dead bodies do not.
  - Distraction throwable (bottles) emit a 10 m noise radius attracting guards to investigate.
- **Enemy AI & Flashlights**:
  - Guards cycle through states: **Patrol** -> **Suspicious (?)** -> **Alert (!)** -> **Search** -> **Patrol**.
  - Awareness gauge: 0–100. Rises quickly when exposed to light or LOS, decays slowly with a last-known-position (LKP) marker.
  - Flashlight visual system: Additive volumetric beam cone mesh + real-time light pool decals spilling around corners + a fixed pool of real SpotLights reassigned dynamically to the closest guards.
  - Dead guards drop flashlights that remain lit on the floor; other guards will investigate stray beams and trigger alert if light touches a corpse.
  - In Alert, guards shoot after a visible 0.6 s wind-up tell (muzzle flash & audio telegraph).
- **Perception & Minimap**:
  - The minimap only displays what the player has actually perceived (direct sight, reflected flashlight beams/pools, or audible footsteps).
  - Unperceived guards fade over 4 seconds into a frozen ghost icon.

---

## Art Direction: "Graphic Noir"
- **Color Language**:
  - Near-black shadows with desaturated cool blue-grey ambient moonlight.
  - Warm amber cones for enemy flashlights (primary visual focus and danger cue).
  - Cyan-white accents for player-relevant interactables and objectives.
  - Crimson red for Alert states, muzzle tells, and damage indicators.
- **Aesthetic**:
  - Smooth-shaded mid-detail models, trim sheets (Poly Haven CC0 textures).
  - First-person gloved hands and knife viewmodel with procedural animations.
  - Heavy distance fog, dust motes dancing inside flashlight beams.

---

## Tech Stack & Architecture
- **Language & Engine**: TypeScript (strict mode), Three.js (WebGLRenderer WebGL2), Vite.
- **Grid-Based Sim**: No heavy physics engine. Levels run on a 2D tile grid (2m tiles) with grid DDA line-of-sight, BFS sound propagation, and A* pathfinding.
- **Controls**:
  - Desktop: Pointer Lock, WASD, Shift (run), Q (sneak hold), C (crouch toggle), Left-Click / E (knife / context).
  - Mobile: `nipplejs` dynamic virtual joystick (left), custom drag-to-look (right), touch action buttons.
- **Target Platforms**:
  - Web: CrazyGames HTML5 SDK & Playgama Bridge SDK.
  - Mobile: Android via Capacitor (`android/` project folder).
- **Performance Budgets**:
  - Initial load ≤ 20 MB; total build ≤ 50 MB; ≤ 100 draw calls per frame; 60 fps target on mid-range devices.
  - NEVER dynamically add/remove `THREE.Light` objects at runtime (forces expensive shader recompiles); use the fixed real-light pool manager.
  - All gameplay tuning numbers live centrally in `src/config/tunables.ts`.

---

## Workspace Structure
```
hunter_assasin_3d/
├── .claude/             # Claude agent configs and skills
├── android/             # Android Capacitor project (Gradle, manifest, res)
├── art-src/             # Raw art, Mixamo FBX animations, high-res icons & branding
│   ├── anims/           # Mixamo guard animations
│   ├── audio/           # Raw CC0 audio files
│   └── README.md        # Asset source documentation
├── docs/                # Design docs (asset-list.md, guard-animation-plan.md)
├── platform-config/     # Configurations for CrazyGames, Playgama, Android
├── public/              # Static files served directly
│   ├── assets/          # Processed runtime assets (GLB models, KTX2, audio, manifest)
│   └── levels/          # Level JSON schemas and layouts
├── release/             # Built release packages & Play Console assets
├── scripts/             # Asset build & compression pipelines (Sharp, gltf-transform, etc.)
├── src/                 # TypeScript source code
│   ├── ai/              # Guard FSM, awareness, perception, search
│   ├── audio/           # WebAudio positional audio manager
│   ├── config/          # tunables.ts, quality profiles
│   ├── core/            # Fixed-step game loop (60Hz sim)
│   ├── input/           # Desktop & touch input abstractions
│   ├── level/           # Grid parsing, level loader, instanced mesh builder
│   ├── lighting/        # Real-light pool, volumetric flashlight cones, light pools
│   ├── mission/         # Mission simulator, objectives, star rating
│   ├── nav/             # A* navigation, BFS sound propagation, DDA LOS
│   ├── perception/      # Player perceived-only vision & minimap memory
│   ├── platform/        # Platform interfaces (Playgama, CrazyGames, Android, Dev)
│   ├── player/          # Controller, movement, health, combat actions
│   ├── render/          # Three.js renderer, materials, post-processing
│   ├── save/            # Progress and settings storage
│   └── ui/              # DOM HUD, minimap, main menu, level select, loadout
├── PLAN.md              # Phased master development roadmap
└── CREDITS.md           # Third-party licenses & CC0 attributions
```

