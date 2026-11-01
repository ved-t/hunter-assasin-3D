# Shadow Hunter — Image Asset Generation Master Plan & Requirements

**Date:** 2026-10-29  
**Status:** Ready for Image Generation Pipeline  
**Target Game:** Shadow Hunter (`hunter_assasin_3d`)  
**Reference Asset Pack:** `C:\Users\Desktop\Desktop\asset_pck`  
**Master Asset Status Reference:** `docs/asset-list.md`

---

## 1. Executive Summary & Comparative Analysis

### 1.1 Analysis of Previous Asset Pack (`asset_pck`)
The asset pack in `C:\Users\Desktop\Desktop\asset_pck` contains **377 assets** (350 raster images, 18 3D models, 9 audio tracks) built for two prior games: **Pickleball Smash** and **Stickman Runner**.

* **Strengths & Usable Patterns in `asset_pck`:**
  1. **Multi-Density Icon & Store Hierarchy:** `asset_pck/branding_and_marketing/app_store_resources` provides standard dimensions: master 1024×1024 adaptive icons (`icon-background.png`, `icon-foreground.png`, `icon-only.png`), 512×512 store icons, 192×192 PWA icons, 180×180 Apple Touch icons, and 32×32 / 48×48 favicons.
  2. **Standard Store Promotional Aspect Ratios:** 16:9 landscape banners (1920×1080 / 1672×941), 9:16 portrait covers (1080×1920 / 1024×1536), 1:1 square tiles (1254×1254 / 800×800), and Google Play feature graphics (1024×500).
  3. **Batch Generation Spritesheets:** `asset_pck/ui_and_gameplay_icons/raw_source_packs` uses composite prompt sheets (e.g. `menu_ui_icons.jpg`, `hazard_combat_icons.jpg`, `world_biome_icons.jpg`) generated in AI tools, then sliced into transparent 128×128 or 256×256 PNGs. This maintains unified lighting and visual coherence across dozens of buttons.
  4. **Strict Metadata & Tagging:** Every asset had clear tags, target dimensions, alpha channel flags, and generation prompts.

* **Incompatibility with Shadow Hunter:**
  - **Aesthetic Mismatch:** `asset_pck` is bright, saturated, casual arcade (neon lime-green, yellow tennis balls, cartoon stickmen, fantasy demons/dragons).
  - **Shadow Hunter Tone:** A tense, atmospheric, first-person 3D stealth action game inspired by *Hunter Assassin* reimagined with a **"Graphic Noir"** art style.
  - **Conclusion:** None of the raster textures or icons from `asset_pck` can be directly transferred without breaking immersion. However, its **generation workflow, composite sheet layouts, resolution specifications, and slicing automation** serve as the blueprint for our image generation campaign.

---

### 1.2 Art Direction: The "Graphic Noir" Style Guide for AI Image Generation
To ensure all generated images fit seamlessly into Three.js WebGL2 rendering and CSS UI overlays, all generation prompts must strictly follow these rules:

* **Color Palette & Lighting:**
  - **Base & Background:** Near-black shadows (`#05070a` to `#10161e`), desaturated cool blue-grey tones (`#2b323c`, `#c9d2dc`).
  - **Danger / Enemy Focus:** Warm amber flashlight cones (`#ffb347`, `#c98a3a`).
  - **Player Stealth / Interactables:** Cyan-white luminescence (`#bff4ff`, `#7ee2ff`).
  - **Alert / Damage / Tell:** Crimson red (`#ff3b30`, `#d12b22`).
* **Visual Style:**
  - Hard-edged chiaroscuro, heavy contrast, rim lighting, gritty industrial textures (scratched gunmetal, distressed concrete, brushed steel, Kevlar weave).
  - Modern graphic comic-book noir / conceptual concept art (tactical stealth action, *John Wick*, *Splinter Cell*, *Sin City* high-contrast aesthetic).
* **Negative Prompt Template (Universal for all prompts):**
  > `cartoonish, hypercasual, oversaturated rainbow colors, playful, cute, fantasy magic, anime, pastel, blurry, low resolution, watermarks, bad anatomy, flat lighting, daylight`

---

## 2. Master Image Asset Generation Matrix

| ID | Asset Name | Category | Recommended Resolution | Format & Alpha | Generation Strategy | Engine Integration Target |
|---|---|---|---|---|---|---|
| **BR-01** | Game Logo & Wordmark Cutout | Branding | 1376×768 (cutout ~900×400) | PNG (Transparent) | Standalone generation + cutout | `art-src/logo.png`, `index.html`, Main Menu |
| **BR-02** | Master App Icon (Square) | Store / App | 1024×1024 | PNG (Opaque) | Standalone generation | `art-src/icon.png` (feeds Android build script) |
| **BR-03** | Adaptive Icon Foreground | Store / App | 1024×1024 (Art in 66% circle) | PNG (Transparent) | Standalone generation | `android/.../ic_launcher_foreground.png` |
| **BR-04** | Adaptive Icon Background | Store / App | 1024×1024 | PNG (Opaque) | Standalone generation | `android/.../ic_launcher_background` |
| **BR-05** | Google Play Feature Graphic | Store | 1024×500 | PNG / JPG (Opaque) | Standalone banner | `release/google-play-feature-graphic.png` |
| **BR-06** | CrazyGames Landscape Cover | Store | 1200×675 (16:9) | PNG / JPG (Opaque) | Standalone cover | CrazyGames Portal Asset Pack |
| **BR-07** | CrazyGames Square Cover | Store | 800×800 (1:1) | PNG / JPG (Opaque) | Standalone cover | CrazyGames Portal Asset Pack |
| **BR-08** | Playgama Landscape Cover | Store | 1920×1080 (16:9) | PNG / JPG (Opaque) | Standalone cover | Playgama Portal Asset Pack |
| **BR-09** | Playgama Portrait Cover | Store | 600×900 (2:3) | PNG / JPG (Opaque) | Standalone cover | Playgama Portal Asset Pack |
| **BR-10** | Mobile Startup Splash Screen | Platform | 2732×2732 | PNG (Opaque) | Standalone splash | `android/app/.../drawable/splash.png` |
| **HUD-01** | Health Pip States (3 HP) | In-Game HUD | 256×256 (3 icons: Full/Dmg/Empty) | PNG (Transparent) | Generated on Sheet HUD-A | `src/ui/health-pips.ts` |
| **HUD-02** | Visibility Meter (Light Gem) | In-Game HUD | 256×256 (3 states: Dark/Lit/Alert) | PNG (Transparent) | Generated on Sheet HUD-A | `src/ui/visibility-meter.ts` |
| **HUD-03** | Stealth Crosshairs & Strike Tell | In-Game HUD | 256×256 (2 states: Rest / In-Range) | PNG (Transparent) | Generated on Sheet HUD-A | `src/styles.css`, `hud.ts` |
| **HUD-04** | Combat Damage Screen Vignette | In-Game HUD | 1920×1080 | PNG (Transparent edge mask) | Standalone screen mask | `src/ui/damage-vignette.ts` |
| **HUD-05** | Directional Detection Arcs | In-Game HUD | 256×256 (Arc gradient & tell) | PNG (Transparent) | Generated on Sheet HUD-A | `src/ui/detection-arcs.ts` |
| **HUD-06** | Minimap Tactical Markers Set | In-Game HUD | 512×512 (9 icons: Player/Guards/Loot) | PNG (Transparent) | Generated on Sheet HUD-B | `src/ui/minimap.ts` |
| **HUD-07** | Mission Bar Objective Icons | In-Game HUD | 256×256 (3 icons: Kill/Intel/Exit) | PNG (Transparent) | Generated on Sheet HUD-B | `src/ui/mission-bar.ts` |
| **HUD-08** | Touch Controls Button Suite | Mobile HUD | 1024×1024 (6 buttons: Pad/Kill/Crouch) | PNG (Transparent) | Generated on Sheet HUD-C | `src/ui/touch-controls.ts` |
| **HUD-09** | Guard In-World State Billboard | 3D Billboard | 512×256 (Atlas: Glow, "?", "!") | PNG (Transparent) | Generated Billboard Atlas | `src/render/guard-visuals.ts` |
| **MN-01** | Main Menu Key Art Background | Menu UI | 2560×1440 / 1920×1080 | JPG / WebP (Opaque) | Standalone concept art | `src/ui/main-menu.ts`, `styles.css` |
| **MN-02** | Campaign Theme Cards | Menu UI | 1376×768 (3 cards: Warehouse/Office/Mansion) | JPG / PNG | Generated on Sheet MENU-A | `src/ui/level-select.ts` |
| **MN-03** | 12 Level Select Thumbnails | Menu UI | 1024×1024 (12 mini-vignettes) | JPG / PNG | Generated on Sheet MENU-B & C | `src/ui/level-select.ts` |
| **MN-04** | Star Rating Icons | Menu UI | 256×256 (Filled / Empty) | PNG (Transparent) | Generated on Sheet MENU-A | `src/ui/result-screen.ts`, `main-menu.ts` |
| **MN-05** | Currency Gem Icon | Menu UI | 256×256 | PNG (Transparent) | Generated on Sheet MENU-A | `src/ui/loadout.ts`, `main-menu.ts` |
| **MN-06** | Knife Loadout Icons | Menu UI | 512×512 (4 knives: Steel/Black/Brass/Damascus) | PNG (Transparent) | Generated on Sheet LOADOUT-A | `src/ui/loadout.ts`, `config/unlocks.ts` |
| **MN-07** | Glove Loadout Icons | Menu UI | 512×512 (3 gloves: Leather/Tan/Olive) | PNG (Transparent) | Generated on Sheet LOADOUT-A | `src/ui/loadout.ts`, `config/unlocks.ts` |
| **MN-08** | Tactical Perk Icons | Menu UI | 512×512 (3 perks: Quiet/Regen/Bottles) | PNG (Transparent) | Generated on Sheet LOADOUT-A | `src/ui/loadout.ts`, `config/unlocks.ts` |
| **MN-09** | Result Screen Badges & Stats | Menu UI | 512×512 (Win/Fail ribbon, Time/Kills/Ghost) | PNG (Transparent) | Generated on Sheet MENU-A | `src/ui/result-screen.ts` |
| **MN-10** | Settings Category Glyphs | Menu UI | 512×512 (6 icons: Audio/SFX/Sens/Gyro/Quality) | PNG (Transparent) | Generated on Sheet MENU-A | `src/ui/settings-panel.ts` |
| **MN-11** | Rotate Device Landscape Graphic | Overlay UI | 512×512 | PNG (Transparent) | Standalone icon | `src/ui/rotate-overlay.ts` |
| **TX-01** | First-Person Viewmodel Damascus | 3D Texture | 1024×1024 Seamless Tile | PNG / KTX2 (Albedo + Roughness) | Standalone seamless texture | `src/render/viewmodel-mesh.ts` |
| **TX-02** | First-Person Glove Detail Map | 3D Texture | 1024×1024 Seamless Tile | PNG / KTX2 (Normal + Roughness) | Standalone seamless texture | `src/render/viewmodel-mesh.ts` |
| **TX-03** | Guard Texture: Urban SWAT | 3D Character | 1024×1024 Character Texture | PNG / KTX2 (Albedo) | Standalone texture mod | `art-src/anims/guard.fbm/`, `guard.glb` |
| **TX-04** | Guard Texture: Warehouse Thug | 3D Character | 1024×1024 Character Texture | PNG / KTX2 (Albedo) | Standalone texture mod | Guard theme variant |
| **TX-05** | Guard Texture: Office Security | 3D Character | 1024×1024 Character Texture | PNG / KTX2 (Albedo) | Standalone texture mod | Guard theme variant |
| **TX-06** | Guard Texture: Mansion Bodyguard| 3D Character | 1024×1024 Character Texture | PNG / KTX2 (Albedo) | Standalone texture mod | Guard theme variant |
| **DC-01** | Floor Decals: Blood Pools & Splatter | 3D Decal | 1024×1024 (4 variations) | PNG (Transparent) | Generated on Sheet DECAL-A | Floor decal quad rendering |
| **DC-02** | Floor Decals: Industrial Grime & Hazard | 3D Decal | 1024×1024 (Oil/Cracks/Stripes) | PNG (Transparent) | Generated on Sheet DECAL-A | Floor decal quad rendering |
| **DC-03** | Wall Decals: Warning & Security Notices | 3D Decal | 1024×1024 (4 posters/plates) | PNG (Transparent) | Generated on Sheet DECAL-B | Wall face decal quad rendering |
| **ENV-01** | Skyline Night Backdrop (Window Plate) | 3D Sky | 2048×1024 (Panoramic) | JPG / WebP (Opaque) | Standalone panoramic plate | Window geometry backdrop |
| **VFX-01** | Impact Blood & Knife Splashes | VFX Sprite | 1024×1024 (4-frame sequence) | PNG (Transparent) | Generated on Sheet VFX-A | Particle system / Billboard |
| **VFX-02** | Bottle Shatter Shards & Splash | VFX Sprite | 1024×1024 (Glass shards/liquid) | PNG (Transparent) | Generated on Sheet VFX-A | Particle system / Billboard |
| **VFX-03** | Muzzle Flash & Gun Tell Glint | VFX Sprite | 512×512 (Star burst tell + flash) | PNG (Transparent) | Generated on Sheet VFX-A | `src/render/guard-visuals.ts` |

---

## 3. Detailed Specifications & Generation Prompts

### Section 1: Branding, App Stores & Platform Publishing

#### 1.1 Game Logo & Wordmark Cutout (`BR-01`)
* **File Target:** `art-src/logo.png` & `public/assets/branding/logo.webp`
* **Size:** 1376×768 px (text centered with margins for clean alpha masking)
* **Format:** PNG with transparent alpha background
* **Visual Style:** Sharp, menacing tactical typography reading **"SHADOW HUNTER"**. Chiseled blackened titanium font with a razor-sharp combat knife edge slash splitting the word horizontally. Cold blue rim-light on top bevels, warm amber under-glow. High contrast, grit, subtle scratches on metal.
* **Prompt:**
  > `Professional game title logo typography for "SHADOW HUNTER", sharp chiseled blackened steel letters with razor knife slice cut through the font, cold cyan rim light, subtle amber flashlight backlight reflection, distressed tactical metal finish, clean transparent isolated background, vector grade clarity, AAA game branding, dramatic graphic noir style, 8k resolution, centered composition`
* **Negative Prompt:** `colorful, casual, 3D bubbly, cartoon, sports, handwritten font, clutter, background scene`

---

#### 1.2 Master App Icon (1024×1024 Source) (`BR-02`, `BR-03`, `BR-04`)
* **File Target:** `art-src/icon.png` (feeds `scripts/assets/build-android-icons.mjs` which auto-generates Android mipmap densities and `release/play-icon-512.png`).
* **Size:** 1024×1024 px full-bleed square.
* **Format:** PNG (Opaque source), plus extracted transparent foreground.
* **Composition Requirements:** Crucial rule from `build-android-icons.mjs`: **Key focal art must reside inside the central 66% circle (676×676 px safe zone)** to prevent clipping on Android circular masks.
* **Visual Description:** Close-up iconic shot: A lethal stealth assassin wearing a black balaclava hood and tactical turtleneck, face half-cloaked in pitch-black shadow. One piercing cyan eye glints in the dark. In the foreground, a curved tactical combat knife reflects the warm amber cone of an unseen guard's flashlight cutting across the darkness.
* **Prompt:**
  > `Master game app icon 1024x1024, graphic noir stealth assassin close-up, hooded tactical operative partially hidden in deep shadows, sharp tactical combat knife held in stealth combat grip in foreground, knife blade catching a warm amber flashlight beam reflection, cold cyan eye glint, dramatic chiaroscuro contrast, dark industrial steel background, circular safe-zone composition, AAA mobile game icon, bold silhouette, unreal engine 5 render`
* **Layer Splitting:**
  - `icon-background.png`: Dark navy/black moody industrial concrete wall with faint angled amber beam spill.
  - `icon-foreground.png`: Assassin figure and glinting knife with alpha channel transparency.

---

#### 1.3 Google Play Feature Graphic (`BR-05`)
* **File Target:** `release/google-play-feature-graphic.png`
* **Size:** 1024×500 px (exact Google Play Store requirements)
* **Format:** PNG / JPG
* **Composition:** Assassin in tactical stance on the left third stalking through an industrial warehouse aisle; in the right background, an armed SWAT guard in silhouette shines a volumetric amber flashlight down the corridor. Title logo "SHADOW HUNTER" placed prominently in the top right / center with ample margin padding (15% safe boundary).
* **Prompt:**
  > `1024x500 widescreen Google Play store feature graphic banner, graphic noir 3D stealth action game, first-person perspective framing, tactical assassin with knife stalking in foreground shadows on left, armed patrol guard in distance sweeping a volumetric amber flashlight cone through heavy industrial warehouse mist, dark cold blue-grey atmospheric environment, bold high-contrast cinematic lighting, official game promotional key art, ultra detailed`

---

#### 1.4 Web Portals Promotional Cover Suite (CrazyGames & Playgama) (`BR-06` – `BR-09`)
* **Sizes Required:**
  - CrazyGames Landscape: `1200×675` px (16:9)
  - CrazyGames Square: `800×800` px (1:1)
  - Playgama Landscape: `1920×1080` px (16:9)
  - Playgama Portrait: `600×900` px (2:3)
* **Prompt (Widescreen 16:9):**
  > `16:9 cinematic game banner for "SHADOW HUNTER", stealth assassin taking down an armed guard from behind in a high-tech corporate office at midnight, city rain outside floor-to-ceiling glass windows, warm amber flashlight dropped on the marble floor shining light pools against office walls, intense noir atmosphere, deep blues and rich blacks, high dynamic range, dramatic action pose`
* **Prompt (Portrait 9:16 & 2:3):**
  > `Vertical mobile store banner, high-angle dramatic shot of a dark warehouse floor, an assassin's shadow holding a combat knife lurking behind shipping containers, an enemy patrol guard walking into a trap illuminated only by his own conical flashlight beam, cold blue moonlight filtering from skylights above, tension and suspense, graphic noir`

---

#### 1.5 Android Startup Splash Screen (`BR-10`)
* **File Target:** `android/app/src/main/res/drawable/splash.png`
* **Size:** 2732×2732 px (square oversized to fit tablet and portrait/landscape phones)
* **Format:** PNG
* **Description:** Minimalist high-impact noir artwork: Centered silhouette of the assassin emerging from darkness with the cyan-glowing "SHADOW HUNTER" emblem below, surrounded by heavy vignette fading to `#05070a`.

---

### Section 2: In-Mission HUD & Tactical Perception UI

All in-mission HUD elements must read instantly at small sizes against changing 3D backgrounds. They will be generated in 3 composite sheets and then sliced into transparent PNG assets.

#### 2.1 Composite Sheet: HUD Elements & Gauges (`Sheet HUD-A`)
* **Size:** 1024×1024 px (Grid of 4 quadrants, 512×512 each, transparent background)
* **Master Prompt:**
  > `UI sprite sheet of sci-fi tactical graphic noir HUD icons on clean transparent background: (Quadrant 1) 3 Health pip icons: full tactical chevron shield in cyan-white, cracked damaged shield in flickering amber, empty broken shield outline in dim steel. (Quadrant 2) Stealth visibility light-gem meter in 3 states: dark unlit black faceted gem with cold blue rim, glowing warm amber illuminated gem, radiant pulsating crimson alert gem. (Quadrant 3) Minimalist tactical crosshair reticle: subtle cyan circular dot with precision bracket ticks, and an alternate active takedown reticle with red strike chevrons. (Quadrant 4) Directional detection arc indicators: 90-degree curved HUD warning arc in gradient amber and red. High contrast, vector precision, clean edges, isolated transparent background`

* **Extracted Individual Files:**
  1. `public/assets/ui/hud/hp-full.png` (128×128)
  2. `public/assets/ui/hud/hp-damaged.png` (128×128)
  3. `public/assets/ui/hud/hp-empty.png` (128×128)
  4. `public/assets/ui/hud/vis-dark.png` (128×128)
  5. `public/assets/ui/hud/vis-exposed.png` (128×128)
  6. `public/assets/ui/hud/vis-alert.png` (128×128)
  7. `public/assets/ui/hud/reticle-idle.png` (128×128)
  8. `public/assets/ui/hud/reticle-kill.png` (128×128)
  9. `public/assets/ui/hud/detect-arc-amber.png` (256×256)
  10. `public/assets/ui/hud/detect-arc-red.png` (256×256)

---

#### 2.2 Composite Sheet: Minimap & Tactical Objective Icons (`Sheet HUD-B`)
* **Size:** 1024×1024 px (Grid of 3×3, 340×340 each, transparent background)
* **Master Prompt:**
  > `High contrast tactical radar minimap icon set on transparent background, graphic noir stealth aesthetic: (1) Player position marker: cyan glowing arrowhead chevron with knife motif. (2) Guard patrol marker: pale amber directional triangle. (3) Guard suspicious marker: amber triangle with question mark. (4) Guard alert marker: crimson red triangle with exclamation point. (5) Neutralized guard marker: dim grey skull icon. (6) Dropped flashlight marker: miniature flashlight casing casting a small light fan. (7) Objective dossier intel folder: cyan holographic document icon. (8) Exit door extraction marker: cyan running man doorway beacon. (9) Acoustic sound ripple ring: three concentric dashed sonic soundwave circles. Ultra crisp iconography, clean silhouette, flat graphic design, transparent PNG`

* **Extracted Files for `src/ui/minimap.ts` & `src/ui/mission-bar.ts`:**
  1. `public/assets/ui/minimap/marker-player.png`
  2. `public/assets/ui/minimap/marker-guard-patrol.png`
  3. `public/assets/ui/minimap/marker-guard-suspicious.png`
  4. `public/assets/ui/minimap/marker-guard-alert.png`
  5. `public/assets/ui/minimap/marker-dead-guard.png`
  6. `public/assets/ui/minimap/marker-flashlight.png`
  7. `public/assets/ui/minimap/marker-intel.png`
  8. `public/assets/ui/minimap/marker-exit.png`
  9. `public/assets/ui/minimap/icon-bottle-count.png`
  10. `public/assets/ui/minimap/icon-kill-count.png`

---

#### 2.3 Composite Sheet: Mobile Touch Controls (`Sheet HUD-C`)
* **File Target:** `src/ui/touch-controls.ts`
* **Size:** 1024×1024 px (6 buttons, 400×400 each, transparent background)
* **Master Prompt:**
  > `Tactical touch screen mobile game button set, dark brushed metal bezels with glowing accents, graphic noir style: (1) Virtual joystick base ring: dark circular disc with subtle cyan degree notches and concentric bevel. (2) Virtual joystick thumbstick knob: round tactile rubber grip with central glowing cyan cross. (3) Takedown context button: circular button with combat knife silhouette, state 1 dim disabled grey, state 2 glowing crimson strike alert. (4) Distraction bottle throw button: glass bottle silhouette with number counter circle badge. (5) Crouch toggle button: silhouette of stealth operative crouching. (6) Settings gear cog: clean industrial gear icon. Clean transparent background, isolated game UI assets`

* **Extracted Files:**
  1. `public/assets/ui/touch/joystick-base.png` (256×256)
  2. `public/assets/ui/touch/joystick-knob.png` (128×128)
  3. `public/assets/ui/touch/btn-takedown-active.png` (160×160)
  4. `public/assets/ui/touch/btn-takedown-disabled.png` (160×160)
  5. `public/assets/ui/touch/btn-bottle.png` (160×160)
  6. `public/assets/ui/touch/btn-crouch.png` (160×160)
  7. `public/assets/ui/touch/btn-pause.png` (120×120)

---

#### 2.4 Guard In-World Billboard Atlas (`HUD-09`)
* **File Target:** `public/assets/textures/billboards-atlas.png` (replaces runtime canvas drawing in `src/render/guard-visuals.ts`)
* **Size:** 512×128 px (3 horizontal cells of 128×128, transparent PNG)
* **Cells:**
  - Cell 0 (Glow): Soft white/amber radial lens glow flare.
  - Cell 1 (Question `?`): Stylized distressed amber stencil question mark with ambient glow.
  - Cell 2 (Exclamation `!`): Sharp aggressive crimson combat exclamation mark with alert pulse.
* **Prompt:**
  > `Horizontal sprite atlas with 3 equal square cells side-by-side on pure black background: Cell 1 is a smooth circular radial lens glow with soft falloff; Cell 2 is a bold glowing amber yellow question mark in distressed tactical stencil font; Cell 3 is a sharp bright crimson red combat exclamation mark with intense warning glow. High optical clarity, game billboard sprite sheet, 8k`

---

#### 2.5 Combat Damage Screen Vignette (`HUD-04`)
* **File Target:** `public/assets/ui/hud/damage-vignette.png`
* **Size:** 1920×1080 px (16:9 widescreen)
* **Format:** PNG with transparent center
* **Description:** Full-screen overlay used in `damage-vignette.ts` when the player takes damage. The center is completely transparent; edges are dark blackened crimson with gritty splatter, blurred blood mist, and darkened noir tunnel vision.
* **Prompt:**
  > `Full screen 16:9 tactical damage vignette overlay, completely transparent hollow center, edges and corners covered in gritty dark crimson blood splatter, blurred peripheral vision shadow, blackened gunshot impact vignette, graphic noir comic style, alpha transparency, ultra realistic edge blood textures`

---

### Section 3: Menus, Meta UI & Progression

#### 3.1 Main Menu Cinematic Key Art (`MN-01`)
* **File Target:** `public/assets/ui/menu/main-menu-bg.jpg`
* **Size:** 2560×1440 px (QHD widescreen, responsive scaling down to mobile 1080p)
* **Format:** JPG / WebP
* **Description:** First-person perspective looking down a dimly lit industrial warehouse corridor. In the foreground, the player's black-gloved hand grips a weathered steel combat knife held ready. Ahead around a blind brick corner, an armed patrol guard's flashlight casts a dramatic warm amber light pool across the wet concrete floor and crates. Cold blue moonlight shines through high industrial windows. Heavy volumetric fog and dancing dust particles.
* **Prompt:**
  > `First-person POV cinematic graphic noir wallpaper, tactical operative holding a weathered steel combat knife in gloved hand in foreground, dark industrial warehouse interior at midnight, high contrast shadows, in the midground an armed guard sweeps a volumetric amber flashlight beam casting dramatic light pools on concrete floor around a corner, cool blue moonlight beam filtering through high grated windows, volumetric fog, dust motes, cinematic 35mm film still, photorealistic, tense stealth atmosphere`

---

#### 3.2 Campaign Theme Cards (`MN-02`)
* **File Target:** `public/assets/ui/menu/theme-warehouse.jpg`, `theme-office.jpg`, `theme-mansion.jpg`
* **Size:** 800×450 px each (16:9 card aspect ratio)
* **Theme Prompts:**
  1. **Warehouse Theme Card:**
     > `Atmospheric graphic noir concept art card of an abandoned industrial shipping warehouse at midnight, towering metal cargo container stacks, corrugated metal walls, rusted forklift, dramatic overhead yellow halogen lamps cutting through dense fog, dark moody blues and deep blacks, widescreen banner`
  2. **Office Theme Card:**
     > `Corporate skyscraper executive office floor after hours, rows of sleek dark desks and glass partitions, venetian blind shadows cast by neon city lights outside, blue glowing server monitors, cold minimalist architectural noir aesthetic, widescreen banner`
  3. **Mansion Theme Card:**
     > `Opulent luxury private mansion corridor at night, dark mahogany wood paneling, ornate marble checkered floor reflecting silver moonlight, antique oil paintings, heavy crimson velvet drapery, dramatic chiaroscuro candle and moonlight illumination, widescreen banner`

---

#### 3.3 The 12 Campaign Level Select Thumbnails (`MN-03`)
* **Size:** 400×250 px each (or generated on a 4×3 master grid of 1600×1000 px)
* **List of Level Prompts:**
  - `level-thumb-warehouse-1.jpg` (*Night Shift*): Warehouse loading bay door slightly ajar, single warm security light.
  - `level-thumb-warehouse-2.jpg` (*Footfalls*): Narrow maze of wooden pallets and stacked grey crates.
  - `level-thumb-warehouse-3.jpg` (*Loose Ends*): Central warehouse crossroads with intersecting flashlight beams.
  - `level-thumb-warehouse-4.jpg` (*The Ledger*): Elevated foreman's office cage overlooking warehouse floor.
  - `level-thumb-office-1.jpg` (*After Hours*): Glass security turnstile entrance lobby with corporate logo.
  - `level-thumb-office-2.jpg` (*Corner Offices*): Executive boardroom with mahogany table and high skyline view.
  - `level-thumb-office-3.jpg` (*Cross Traffic*): High-tech cubicle corridor with printer stations.
  - `level-thumb-office-4.jpg` (*Server Room*): High security server vault with blue LED blinkers and raised flooring.
  - `level-thumb-mansion-1.jpg` (*The Long Gallery*): Grand portrait gallery hallway with marble statues.
  - `level-thumb-mansion-2.jpg` (*Ballroom*): Expansive parquet ballroom floor beneath a grand crystal chandelier.
  - `level-thumb-mansion-3.jpg` (*The Study*): Wall-to-wall antique library bookshelves with leather armchair.
  - `level-thumb-mansion-4.jpg` (*Clean Sweep*): Penthouse security vault with reinforced steel doors.

---

#### 3.4 Loadout Weapons, Gloves & Perks Suite (`MN-06` – `MN-08`)
* **Sheet Target:** `Sheet LOADOUT-A` (1024×1024 px, 10 items, isolated on transparent background)
* **Master Prompt:**
  > `UI inventory icon sheet of 10 tactical equipment items on transparent background, graphic noir style, realistic 3D rendered isometric props: (1) Steel Combat Knife: classic military drop-point steel blade with black rubber grip. (2) Blackened Knife: stealth tactical knife coated in matte non-reflective black oxide with paracord wrapped handle. (3) Brass Knife: golden brass bolster and pommel with razor sharp tanto blade. (4) Damascus Knife: exotic folded damascus steel blade with wavy water patterns and dark rosewood hilt. (5) Black Leather Tactical Gloves. (6) Tan Suede Operator Gloves with carbon knuckle plating. (7) Olive Drab Military Gloves with textured grip. (8) Soft Soles Perk Icon: boot footprint tread emitting muted sound dampening ripples in glowing cyan. (9) Second Wind Perk Icon: stylized anatomical heart with electrocardiogram pulse line in cyan. (10) Deep Pockets Perk Icon: heavy tactical utility belt pouch holding glass bottles. Premium game inventory icons, clean transparent cutouts`

* **Extracted Files for `src/ui/loadout.ts`:**
  1. `public/assets/ui/loadout/knife-steel.png` (256×256)
  2. `public/assets/ui/loadout/knife-black.png` (256×256)
  3. `public/assets/ui/loadout/knife-brass.png` (256×256)
  4. `public/assets/ui/loadout/knife-damascus.png` (256×256)
  5. `public/assets/ui/loadout/glove-black.png` (256×256)
  6. `public/assets/ui/loadout/glove-tan.png` (256×256)
  7. `public/assets/ui/loadout/glove-olive.png` (256×256)
  8. `public/assets/ui/loadout/perk-quiet.png` (256×256)
  9. `public/assets/ui/loadout/perk-regen.png` (256×256)
  10. `public/assets/ui/loadout/perk-bottle.png` (256×256)

---

#### 3.5 Meta UI, Result Screen Badges & Currency Icons (`MN-04`, `MN-05`, `MN-09`, `MN-10`)
* **Sheet Target:** `Sheet MENU-A` (1024×1024 px, transparent background)
* **Master Prompt:**
  > `Game UI sprite sheet of graphic noir menu icons and rewards on transparent background: (1) Golden star reward icon: 3D faceted metallic gold star with bright specular glint. (2) Empty star icon: dark gunmetal star silhouette with thin chamfered edge. (3) Gem currency icon: dark radiant diamond gemstone with glowing cyan facets and internal refraction. (4) Level lock icon: heavy industrial padlock in blackened steel. (5) Mission Accomplished ribbon badge in cold cyan and steel. (6) Mission Failed emblem in crimson red with fractured skull motif. (7) Stat icon: tactical stopwatch for mission time. (8) Stat icon: crossed daggers skull for enemies neutralized. (9) Stat icon: stealth eye / radar for times detected. (10) Video filmstrip badge with golden play arrow for 'Revive Ad'. (11) Volume speaker icon. (12) Sensitivity reticle icon. (13) Gyroscope icon: phone tilting with 3D arrows. Isolated transparent PNG`

---

#### 3.6 Rotate Device Landscape Graphic (`MN-11`)
* **File Target:** `public/assets/ui/rotate-device.png` (used in `src/ui/rotate-overlay.ts`)
* **Size:** 512×512 px (Transparent PNG)
* **Prompt:**
  > `Minimalist graphic noir vector icon of a sleek modern smartphone rotating 90 degrees from portrait orientation to landscape orientation, smooth curved cyan directional arrow showing motion, clean lines, glowing cyan accents on dark steel phone bezel, transparent background`

---

### Section 4: 3D Character & Weapon PBR Textures

#### 4.1 First-Person Viewmodel PBR Textures (`TX-01`, `TX-02`)
* **Damascus Blade Texture (`TX-01`):**
  - **Target:** `public/assets/textures/damascus-albedo.png` & `damascus-roughness.png`
  - **Size:** 1024×1024 px (Seamless Tileable)
  - **Prompt:** `Seamless tileable texture of high-contrast folded Damascus pattern steel, organic fluid swirling water ripples, dark charcoal grey and silver etched bands, metallic luster, knife blade texture, 8k seamless PBR map`
* **Tactical Glove Leather Grain (`TX-02`):**
  - **Target:** `public/assets/textures/glove-leather-normal.png` & `glove-leather-roughness.png`
  - **Size:** 1024×1024 px (Seamless Tileable)
  - **Prompt:** `Seamless macro texture of black tactical combat glove leather, fine grain, subtle reinforced stitching lines, heavy duty carbon fiber knuckle weave pattern, seamless PBR texture map`

---

#### 4.2 Guard Character Skin Variants (`TX-03` – `TX-06`)
* **Base Reference:** `art-src/anims/guard.fbm/Soldier_Body_diffuse.png` (Mixamo SWAT UV map)
* **Size:** 1024×1024 px diffuse texture
* **Variants for Theme Immersion:**
  1. `guard-urban-swat.png`: Midnight tactical navy/charcoal SWAT uniform with Kevlar vest and POLICE badge.
  2. `guard-warehouse-thug.png`: Grungy leather work jacket, dark cargo combat trousers, skull armband patch.
  3. `guard-office-security.png`: Clean black corporate security uniform with silver shoulder epaulets, necktie, and gold chest badge.
  4. `guard-mansion-bodyguard.png`: Sharp tailored dark charcoal tuxedo suit, crisp white dress shirt, black tie, concealed shoulder holster straps.

---

### Section 5: Environment Decals & Sky Backdrops

#### 5.1 Environment Floor Decals Sheet (`Sheet DECAL-A`)
* **File Target:** Sliced into `public/assets/textures/decals/`
* **Size:** 1024×1024 px (4 quadrants of 512×512, transparent PNG)
* **Decal Types:**
  1. `decal-blood-puddle.png`: Stylized dark crimson blood pool on floor with droplet spatter around edges.
  2. `decal-oil-stain.png`: Dark industrial engine oil spill with iridescent edge sheen.
  3. `decal-floor-cracks.png`: Heavy fractured concrete cracks and fissures for distressed warehouse floors.
  4. `decal-hazard-stripes.png`: Faded weathered diagonal yellow and black industrial safety hazard floor tape.
* **Prompt:**
  > `Texture sheet of 4 isolated floor decals on transparent background: Top-left: dark crimson blood pool puddle with natural splatter droplets. Top-right: dark industrial grease and motor oil spill. Bottom-left: cracked concrete floor fracture lines and chipping. Bottom-right: worn weathered yellow and black diagonal industrial safety hazard floor tape strip. Photorealistic grunge textures, alpha transparency, game decals`

---

#### 5.2 Window Panoramic Skyline Backdrop (`ENV-01`)
* **File Target:** `public/assets/textures/skyline-night.jpg`
* **Size:** 2048×1024 px (2:1 panoramic aspect ratio)
* **Format:** JPG / WebP
* **Description:** Used as the unlit backdrop visible through warehouse clerestory windows and mansion glass.
* **Prompt:**
  > `2:1 panoramic matte painting of a dark metropolitan city skyline at midnight during rain, distant skyscraper silhouettes with amber and cyan lit windows, foggy mist rising between buildings, overcast dark storm clouds with faint silver moonlight illumination, graphic noir atmosphere, cinematic digital backdrop`

---

### Section 6: VFX Sprites & Flipbooks

#### 6.1 Combat & Environmental VFX Sheet (`Sheet VFX-A`)
* **File Target:** `public/assets/textures/vfx-sheet.png`
* **Size:** 1024×1024 px (4 quadrants of 512×512, transparent PNG)
* **Contents:**
  1. `vfx-blood-hit.png`: Directional impact puff of dark crimson droplets for knife strikes.
  2. `vfx-glass-shatter.png`: Shards of sharp shattered bottle glass tumbling outwards with frothy foam droplet spray.
  3. `vfx-muzzle-flash.png`: Intense four-point starburst gun flash with fiery amber center and smoke ring.
  4. `vfx-dust-particle.png`: Soft illuminated dust mote circular particle with subtle Gaussian glow for flashlight beams.
* **Prompt:**
  > `Sprite sheet of 4 visual effects on pure transparent background: (1) Dynamic splash of dark red blood droplets bursting outward. (2) Explosion burst of sharp translucent shattered glass bottle shards and flying droplets. (3) High-velocity firearm muzzle flash with sharp 4-point star burst and smoke ring. (4) Soft glowing circular dust particle orb. Clean alpha masks, game VFX particle sprites`

---

## 4. Batch Generation & Slicing Strategy (The `asset_pck` Approach)

Generating 60+ individual image files one-by-one is slow and leads to stylistic drift between tools. Following the successful pattern proven in `asset_pck/ui_and_gameplay_icons/raw_source_packs/`, we organize generation into **7 Master Sheets + 6 Standalone Banners**:

```
GENERATION PIPELINE:
┌────────────────────────────────────────────────────────┐
│  7 Master Prompt Sheets (1024x1024 / 1376x768)         │
│  1. Sheet HUD-A      (Health, Gems, Reticles, Arcs)    │
│  2. Sheet HUD-B      (Minimap & Objective Markers)     │
│  3. Sheet HUD-C      (Touch Controls Buttons)          │
│  4. Sheet MENU-A     (Stars, Badges, Currency, Icons)  │
│  5. Sheet LOADOUT-A  (Knives, Gloves, Perks)           │
│  6. Sheet DECAL-A    (Blood, Oil, Cracks, Hazard Tape) │
│  7. Sheet VFX-A      (Blood Hit, Shatter, Flash, Dust) │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
              Automated Sharp Slicing Script
       (Crops grid frames, extracts alpha channels)
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│  Sliced & Optimized Runtime Assets                     │
│  → public/assets/ui/                                   │
│  → public/assets/textures/                             │
│  → public/assets/characters/                           │
└────────────────────────────────────────────────────────┘
```

### Standalone Key Art (Generated at exact resolution):
1. `BR-01`: Logo Cutout (`1376×768`)
2. `BR-02`: Master App Icon (`1024×1024`)
3. `BR-05`: Google Play Feature Graphic (`1024×500`)
4. `BR-06`: CrazyGames 16:9 Cover (`1200×675`)
5. `BR-08`: Playgama 16:9 Banner (`1920×1080`)
6. `MN-01`: Main Menu Wallpaper (`2560×1440` or `1920×1080`)
7. `HUD-04`: Damage Vignette Screen Mask (`1920×1080`)

---

## 5. Ingestion Workflow & Next Steps

1. **Generation:** Run the prompts detailed in Section 3 in Midjourney v6, DALL-E 3, Stable Diffusion XL, or Gemini Imagen.
2. **Deposit:** Save the raw generated sheets and banners into `art-src/generated/`.
3. **Execution Scripts:**
   - Run `node scripts/assets/build-android-icons.mjs` once `art-src/icon.png` is placed.
   - Run a slicing script (using the existing `sharp` dependency in `package.json`) to crop out each icon from `Sheet HUD-A`, `Sheet HUD-B`, `Sheet MENU-A`, etc., and place them into `public/assets/ui/`.
   - Update `src/styles.css`, `src/ui/`, and `src/render/` to replace DOM Unicode characters (`★`, `◆`, `⚙`) and CSS gradient boxes with these crisp PNG assets.

