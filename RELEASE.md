# Release

How to build, check and upload each target: the two web portals, then Android (Google Play).

## Builds
| Target | Command | Output | Upload |
|---|---|---|---|
| CrazyGames | `npm run build:crazygames` | `dist-crazygames/` | `release/shadow-hunter-crazygames-<version>.zip` |
| Playgama | `npm run build:playgama` | `dist-playgama/` | `release/shadow-hunter-playgama-<version>.zip` |
| Android | `npm run build:android`, then `npm run android:release` | `dist-android/`, `android/` | `release/shadow-hunter-android-<version>.aab` |

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

## Android (Google Play)
App ID `com.autobuildstudios.shadowhunter`. The native project in `android/` is committed; `npm run build:android` refreshes the web files inside it.
`scripts/android.mjs` runs gradle on JDK 21: Android Studio's bundled JBR by default, or `ANDROID_JAVA_HOME` if set.

### Build
| Command | Result |
|---|---|
| `npm run build:android` | Web build + size report, then `cap sync` and the AdMob app ID written into `strings.xml` |
| `npm run android:debug` | `release/shadow-hunter-android-<version>-debug.apk` (WebView debuggable from `chrome://inspect`) |
| `npm run android:release` | Signed `release/shadow-hunter-android-<version>.aab` (for Play) and `.apk` (for sideloading) |
| `npm run android:run` | Installs the debug APK on the connected phone and starts it (`-- --release` for the release APK) |
| `npm run android:open` | Opens the project in Android Studio |
| `npm run assets:icons` | Launcher icons + `release/play-icon-512.png` from `art-src/icon.png` (1024×1024) |

- `versionName` is package.json's `version`, and `versionCode` is derived from it (`0.1.2` → 102). **Bump `version` before every Play upload**, because Play rejects a repeated versionCode. Override once with `gradlew -PversionCode=N`.
- `android:release` refuses to run while `src/platform/admob-ids.ts` still has Google's test IDs. `--allow-test-ads` builds anyway, for internal testing only.

### Signing keys (back these up)
- Upload keystore: `%USERPROFILE%\.android-keys\shadowhunter-upload.jks` (alias `upload`, valid 10,000 days), with a copy of its passwords in `shadowhunter-keystore.properties` next to it.
- `android/keystore.properties` points gradle at it. It is gitignored: never commit it.
- In Play Console, enrol in **Play App Signing** (the default for new apps): Google keeps the real app signing key, and this is only the upload key. If the upload key is lost, Play support can register a new one. Still, keep both files in a password manager or offline backup.

### Real AdMob IDs
1. In AdMob, add the Android app (`com.autobuildstudios.shadowhunter`) and create two ad units: **Interstitial** and **Rewarded**.
2. Paste the app ID and both unit IDs into `src/platform/admob-ids.ts`, then run `npm run build:android` (this also updates `strings.xml`) and `npm run android:release`.
3. In AdMob, open **Privacy & messaging → GDPR** and publish a consent message for the app. The game shows it through Google's UMP SDK on first launch in the EEA/UK. Without a published message, EEA players get no ads.
4. Never tap your own live ads. Test on your phones with the test IDs, or add the phones as AdMob test devices.

### Install on a phone
- Turn on **Developer options → USB debugging**, connect over USB, then run `npm run android:run` (debug) or `npm run android:run -- --release`.
- Or copy the `.apk` to the phone and open it, allowing installs from that source.

### Play Console
1. Create the app (game, free, contains ads). Upload the `.aab` to **Internal testing** first, and add your own accounts as testers.
2. **Store listing:** use `release/play-icon-512.png`, a 1024×500 feature graphic, and at least 2 landscape screenshots.
3. **App content:**
   - **Privacy policy:** a public URL with the text of `PRIVACY.md`. Required, because the app shows ads.
   - **Ads:** yes.
   - **Content rating questionnaire:** violence against humans, no blood or gore. Expect PEGI 12 / Teen.
   - **Target audience:** 13+. Don't select under-13 ages, because ads are not configured for families.
   - **Data safety:** the game itself collects nothing. The AdMob SDK collects the device advertising ID, approximate location (IP) and app interactions for advertising and analytics, encrypted in transit, and users can't request deletion through the app. Declare that, and that data is shared with Google for ads.
4. Before promoting to production: run the two-phone check below, and make sure the build was made with real AdMob IDs and no `--allow-test-ads`.

### Two-phone check (PLAN.md acceptance)
On a low-end and a mid-range phone, from the release APK:
- [ ] It installs, launches in landscape and fullscreen, and the system bars stay hidden (a swipe shows them briefly).
- [ ] Touch-only play works end to end. Check fps with the debug build's `?debug=1` overlay: ≥ 45 fps at medium tier on the mid-range phone, and ≥ 50 at low tier with 8 guards.
- [ ] Back: pauses in a level, resumes from pause, leaves the result screen and title sub-screens, and exits from the title.
- [ ] Home or app switch mid-level pauses and silences the game. Returning doesn't resume until you tap Resume.
- [ ] Revive plays a (test) rewarded ad and resumes at 1 HP. Interstitials appear only after 2+ minutes, at result-screen exits.
- [ ] Progress and settings survive force-closing the app.

## Release checklist (from PLAN.md)
- [x] Size report and file count: printed by every target build.
- [ ] Content rating PEGI 12: no gore, and deaths are a stylised fall with no blood. Declare it on each portal form.
- [ ] Privacy: the game collects nothing beyond what the portal SDKs and AdMob do. Web needs no extra notice. Play needs `PRIVACY.md` hosted at a public URL, plus the Data safety form above.
- [x] Mute on ads and on tab blur (shared pause holds in `src/platform/base.ts`).
- [ ] Plays with mouse-only menus, keyboard+mouse gameplay and touch only. Check on the portal previews, on desktop and a phone.
