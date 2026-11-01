# Shadow Hunter — Asset List

As of 2026-10-29.

Every asset the game needs to look finished and ship, and where each one stands today. Most of the HUD,
menus and props work now but are built in code, plain text or Unicode symbols. The app icon, logo, store
art and fonts are missing.

For detailed image generation prompts, composite sheet layouts, and dimensional specifications for all visual assets, see [image-asset-generation-list.md](image-asset-generation-list.md).

## Status key

- **Have:** real asset shipped.
- **Code-built:** works now, but it's code, plain text or a Unicode symbol. Needs art to look finished.
- **Missing:** not in the game yet.

## Branding and store listings

| Asset | Status | Notes |
| --- | --- | --- |
| Game logo / wordmark | Missing | The main menu shows "Shadow Hunter" as plain text |
| App icon, 1024×1024 source | Missing | `art-src/icon.png` doesn't exist, so the Android icon script has nothing to read |
| Favicon / PWA icons | Missing | |
| Android splash screen | Code-built | Flat colour in `drawable/splash.xml` |
| CrazyGames / Playgama cover images (landscape and portrait) | Missing | Check each portal's current required sizes |
| Google Play feature graphic (1024×500) and screenshots | Missing | |
| Gameplay trailer / GIF | Missing | Optional, but helps on the portals |

## HUD (in-mission)

| Asset | Status | Notes |
| --- | --- | --- |
| Health pips (3 HP) | Code-built | DOM/CSS |
| Visibility meter | Code-built | CSS |
| Crosshair | Code-built | CSS |
| Hit markers / detection arcs | Code-built | Drawn in SVG by code. These could stay as they are |
| Damage vignette | Code-built | CSS gradient |
| Minimap markers: player arrow, guard arrow, dead guard, dropped flashlight, intel, exit door | Code-built | Drawn on a canvas. An icon set would read better |
| Mission bar icons: objective (kill / intel / exit), kill counter, bottle count | Missing | Text only right now |
| Context prompts: takedown, pick up, key and button glyphs (E, F, click, tap) | Missing | Text only |
| Touch controls: joystick base and knob; takedown, bottle, crouch and settings buttons | Code-built | nipplejs default look plus text buttons such as "Bottle 3" |
| Alert / suspicious markers above guards (? and !) | Missing | Common in the genre. Would also help colourblind players |
| Level intro card and loading screen background | Code-built | Text only |

## Menus and meta UI

| Asset | Status | Notes |
| --- | --- | --- |
| Main menu background / key art | Missing | |
| Display font and body font (self-hosted woff2) | Missing | Uses the system sans-serif |
| Panel and button frames, sliders, toggles, dropdowns | Code-built | CSS only |
| Star icon (filled and empty) | Code-built | Unicode ★ ☆ |
| Gem currency icon | Code-built | Unicode ◆ |
| Theme cards: Office, Warehouse, Mansion | Missing | Level select uses text buttons |
| Level thumbnails (×12) and a lock icon | Missing | |
| Loadout item icons: 4 knives, 3 gloves, 3 perks (Soft soles, Second wind, Deep pockets) | Code-built | Colour swatches only |
| Result screen: star reveal, stat icons (time, kills, detected) | Code-built | Text and Unicode |
| "Watch ad" badge for the revive button | Code-built | Text tag |
| "Rotate to landscape" illustration | Code-built | Check `rotate-overlay.ts`. A phone-rotation graphic is the norm |
| Settings icons: volume, music, brightness, gyro, quality | Missing | Optional |

## Player (first person) and skins

| Asset | Status | Notes |
| --- | --- | --- |
| Gloved hand and knife viewmodel | Code-built | Built in code (`viewmodel-mesh.ts`), as decided in Phase 5 |
| Knife skins: Steel, Blackened, Brass, Damascus | Code-built | Material colour changes on the same blade shape |
| Glove skins: Black leather, Tan suede, Tactical olive | Code-built | Colour and roughness only |
| New knife shapes (karambit, tanto, cleaver, neon or premium blades) | Missing | Needs a GLB per knife, or more procedural shapes. This is where purchasable skins get their value |
| Glove textures (stitching, knuckle pads, patterns) and sleeve or cuff variants | Missing | |
| Bottle in hand / bottle in flight | Code-built | Code mesh |

## Enemies

| Asset | Status | Notes |
| --- | --- | --- |
| Guard model (Mixamo SWAT) | Have | `characters/guard.glb` |
| Animations: idle, walk, run, look around, 2 deaths | Have | |
| Pistol and flashlight held by guards | Code-built | Instanced code meshes |
| Guard variants per theme: office security guard, warehouse worker or thug, mansion bodyguard in a suit | Missing | Any Mixamo "With Skin" FBX on the same skeleton works with `npm run assets:characters` |
| Texture variants of the SWAT (urban, night, desert) | Missing | A cheap way to get variety |
| Elite / heavy guard look, if tougher guards are ever added | Missing | That's a design change: PLAN.md first |
| Animations: fire pistol, alert reaction, suspicious turn | Missing | Aiming is procedural today. A real firing or reaction clip would sell the 0.6 s wind-up |

## Environment and props

| Asset | Status | Notes |
| --- | --- | --- |
| Trim sheets: Office, Warehouse, Mansion (albedo, normal, ORM) | Have | Poly Haven CC0 |
| Walls, trim, furniture, fixtures | Code-built | Code-built kits. Could be swapped for GLB hero props (desks, shelving, crates, sofas) |
| Exit double door and exit sign | Code-built | New on 2026-10-28 |
| Intel item | Code-built | Code mesh |
| Decals: blood pool, grime, cracks, posters, floor markings | Missing | |
| Window / moonlight plate or sky behind glazing | Missing | |

## VFX

| Asset | Status | Notes |
| --- | --- | --- |
| Beam cone, light pools, beam dust, glow sprites | Code-built | Works well |
| Muzzle flash and the wind-up tell | Code-built | |
| Blood hit and knife-kill splash | Missing | A tunable exists, but there's no visual asset |
| Glass shatter particles (bottle) | Missing | Sound only |
| Detection "!" burst, star and gem reward sparkle | Missing | |

## Audio

| Asset | Status | Notes |
| --- | --- | --- |
| Footsteps, knife, hurt, gunshot, wind-up, throw, shatter, pickup, win and fail | Have | Kenney / OpenGameArt CC0 |
| Menu music and level music | Have | Chosen without being listened to. Needs an audition |
| Warehouse and mansion ambience | Have | |
| Office ambience | Code-built | Synthesised room tone |
| Guard radio barks and the bullet whiz | Code-built | Synthesised |
| UI sounds: click, hover, back, purchase, equip, star reveal, gem count-up | Missing | |
| Door open, intel pickup sting, body fall, flashlight drop | Missing | `pickup-0` is reused for some of these |
| Guard voice lines ("Who's there?", "Found a body!", "Lost him") | Missing | Would make the AI states readable |
| Detection heartbeat or tension layer | Missing | |
| Footsteps per surface | Missing | Postponed past Phase 5 |

## Suggested priority

1. **Needed to ship:** app icon source, logo, portal and Play store art, fonts.
2. **Biggest visual gain:** an HUD and touch icon set, loadout item icons, theme cards, blood and shatter VFX.
3. **Content and monetization:** guard variants per theme, new knife shapes, glove textures. Skins and a
   currency are still undecided, so these need a PLAN.md phase first.
4. **Polish:** guard voice lines, UI sounds, office ambience, alert markers.

## Open decisions

- [ ] Should the knife viewmodel move from code-built to GLB models?
- [ ] Are purchasable skins and a currency in scope, and through which payment route?
- [ ] Will there be elite or heavy guards?
