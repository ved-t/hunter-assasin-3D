# Release

How to build, check and upload each target. Web portals are covered here; the Android section arrives with Phase 6c.

## Builds
| Target | Command | Output | Upload |
|---|---|---|---|
| CrazyGames | `npm run build:crazygames` | `dist-crazygames/` | `release/shadow-hunter-crazygames-<version>.zip` |
| Playgama | `npm run build:playgama` | `dist-playgama/` | `release/shadow-hunter-playgama-<version>.zip` |
| Android | `npm run build:android` | `dist-android/` | Phase 6c |

Each build type-checks, prints the size report (initial ≤ 20 MB, total ≤ 50 MB, ≤ 1,500 files) and zips with `index.html` at the zip root.
The zip is larger than the report's total because it carries both the OGG and M4A audio sets.

How the builds differ:
- Each target's SDK `<script>` is injected into `<head>` ahead of the game (`SDK_SCRIPTS` in `vite.config.ts`). Both portals require their CDN copy.
- Only the Playgama build ships `playgama-bridge-config.json` (source: `platform-config/`).
- If the SDK is missing, blocked or fails to init, the game logs `[platform] … using the dev platform` and runs without ads or cloud saves instead of failing to boot.

## Local check before uploading
Serve a build: `npx vite preview --outDir dist-<target> --port 4301`.
- **CrazyGames:** open `http://localhost:4301/?useLocalSdk=true&debug=1`. The SDK runs in its `local` environment with fake ads and localStorage-backed data.
  Add `&muteAudio=true` to check the portal mute.
- **Playgama:** open `http://localhost:4301/?debug=1`. Off-portal, Bridge uses its `mock` platform.

With `?debug=1`, the overlay's `plat` line names the active adapter (`crazygames` / `playgama`). If it says `dev`, the SDK fell back, and the console says why.

## CrazyGames
1. In the developer portal, create the game and upload the zip. Select **Progress Save** at submission: the game saves through the data module. Without it, saves only last the session.
2. Run the portal's QA tool / preview. Check:
   - [ ] Loading start/stop fire once at boot.
   - [ ] `gameplayStart` fires on entering a level; `gameplayStop` fires on pause, result screens and menus.
   - [ ] Fail → **Revive** plays a rewarded ad. The game is paused and silent during it and resumes at 1 HP.
     During **Basic Launch** ads are disabled (`adsDisabledBasicLaunch`): the first revive attempt fails and the button stops appearing. That is expected.
   - [ ] An interstitial shows when leaving a result screen once 2+ minutes have passed (then at most every 3 minutes).
   - [ ] The portal mute setting silences the game and overrides the in-game volume.
   - [ ] Switching tabs pauses and silences the game.
   - [ ] Progress survives a reload.
3. Happy time fires only the first time a level reaches 3 stars.

## Playgama
1. Upload the zip to the Playgama developer portal. Bridge reads `playgama-bridge-config.json` from beside `index.html`.
2. Check in the portal preview:
   - [ ] `game_ready` is sent once the title screen is up (the host loader hides).
   - [ ] The host pause state (tab switch, host overlays) pauses and silences the game.
   - [ ] The host audio state mutes and unmutes.
   - [ ] Revive (rewarded) and interstitials behave as for CrazyGames. Bridge's own interstitial delay is 60 s; the game's pacing (2 min first, 3 min gap) is stricter.
   - [ ] Progress survives a reload (saved through `bridge.storage`, never localStorage directly).

## Release checklist (from PLAN.md)
- [x] Size report and file count: printed by every target build.
- [ ] Content rating PEGI 12: no gore, and deaths are a stylised fall with no blood. Declare it on each portal form.
- [ ] Privacy: the game collects nothing beyond what the portal SDKs do, so no extra notice for web. Re-check for Android (AdMob) in 6c.
- [x] Mute on ads and on tab blur (shared pause holds in `src/platform/base.ts`).
- [ ] Plays with mouse-only menus, keyboard+mouse gameplay and touch only. Check on the portal previews, on desktop and a phone.
