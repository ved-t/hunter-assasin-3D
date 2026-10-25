// Android build helper: node scripts/android.mjs <task> [--allow-test-ads] [--release]
//   sync     copy dist-android/ into the native project (cap sync) and write the AdMob app ID into strings.xml
//   debug    gradle assembleDebug                      → release/shadow-hunter-android-<version>-debug.apk
//   release  gradle bundleRelease + assembleRelease    → release/shadow-hunter-android-<version>.aab / .apk
//            refuses while src/platform/admob-ids.ts still has Google test IDs, unless --allow-test-ads
//   run      install the debug APK (or --release APK) on the connected device/emulator and launch it
//   open     open the native project in Android Studio
// Capacitor 8 needs JDK 21, so gradle runs on ANDROID_JAVA_HOME, else Android Studio's bundled JBR, else
// JAVA_HOME (a system JAVA_HOME is often an older JDK). ANDROID_HOME defaults to the per-user SDK.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const APP_ID = 'com.autobuildstudios.shadowhunter';
const [task, ...flags] = process.argv.slice(2);
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const isWin = process.platform === 'win32';

const env = { ...process.env };
env.JAVA_HOME = firstExisting([
  process.env.ANDROID_JAVA_HOME,
  'C:/Program Files/Android/Android Studio/jbr',
  '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
  process.env.JAVA_HOME,
]);
env.ANDROID_HOME ??= firstExisting([
  process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Android', 'Sdk'),
  process.env.HOME && join(process.env.HOME, 'Library', 'Android', 'sdk'),
  process.env.HOME && join(process.env.HOME, 'Android', 'Sdk'),
]);
const adb = env.ANDROID_HOME ? join(env.ANDROID_HOME, 'platform-tools', isWin ? 'adb.exe' : 'adb') : 'adb';

function firstExisting(paths) {
  return paths.find((p) => p && existsSync(p));
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', env, shell: isWin, ...opts });
  if (r.status !== 0) {
    console.error(`\n${cmd} ${args.join(' ')} failed (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
}

function gradle(...tasks) {
  if (!env.JAVA_HOME) {
    console.error('JDK 21 not found: install Android Studio or set JAVA_HOME.');
    process.exit(1);
  }
  const dir = join(process.cwd(), 'android');
  run(join(dir, isWin ? 'gradlew.bat' : 'gradlew'), tasks, { cwd: dir });
}

/** The AdMob IDs in src/platform/admob-ids.ts (the single source of truth). */
function admobIds() {
  const src = readFileSync('src/platform/admob-ids.ts', 'utf8');
  const testPublisher = src.match(/ADMOB_TEST_PUBLISHER = '([^']+)'/)[1];
  const block = src.match(/ADMOB_IDS = \{([\s\S]*?)\}/)[1];
  const ids = Object.fromEntries([...block.matchAll(/(\w+): '([^']+)'/g)].map((m) => [m[1], m[2]]));
  return { ids, testing: Object.values(ids).some((id) => id.startsWith(testPublisher)) };
}

function out(src, name) {
  mkdirSync('release', { recursive: true });
  const dest = join('release', name);
  copyFileSync(src, dest);
  console.log(`${dest}  ${(readFileSync(dest).length / 1024 / 1024).toFixed(2)} MB`);
}

switch (task) {
  case 'sync': {
    if (!existsSync('dist-android/index.html')) {
      console.error('dist-android/ is missing: run npm run build:android');
      process.exit(1);
    }
    run('npx', ['cap', 'sync', 'android']);
    const strings = 'android/app/src/main/res/values/strings.xml';
    const { ids, testing } = admobIds();
    const xml = readFileSync(strings, 'utf8').replace(
      /(<string name="admob_app_id"[^>]*>)[^<]*(<\/string>)/,
      `$1${ids.appId}$2`,
    );
    writeFileSync(strings, xml);
    console.log(`AdMob app ID ${ids.appId}${testing ? '  (Google TEST ids)' : ''}`);
    break;
  }
  case 'debug':
    gradle('assembleDebug');
    out('android/app/build/outputs/apk/debug/app-debug.apk', `shadow-hunter-android-${version}-debug.apk`);
    break;
  case 'release': {
    if (admobIds().testing && !flags.includes('--allow-test-ads')) {
      console.error(
        'src/platform/admob-ids.ts still has Google test ad IDs. Paste the real ones, or pass\n' +
          '--allow-test-ads for a release build that is NOT for the store.',
      );
      process.exit(1);
    }
    if (!existsSync('android/keystore.properties')) {
      console.error('android/keystore.properties is missing, so the release would be unsigned (see RELEASE.md).');
      process.exit(1);
    }
    gradle('bundleRelease', 'assembleRelease');
    out('android/app/build/outputs/bundle/release/app-release.aab', `shadow-hunter-android-${version}.aab`);
    out('android/app/build/outputs/apk/release/app-release.apk', `shadow-hunter-android-${version}.apk`);
    break;
  }
  case 'run': {
    const apk = flags.includes('--release')
      ? `release/shadow-hunter-android-${version}.apk`
      : `release/shadow-hunter-android-${version}-debug.apk`;
    run(adb, ['install', '-r', apk], { shell: false });
    run(adb, ['shell', 'am', 'start', '-n', `${APP_ID}/.MainActivity`], { shell: false });
    break;
  }
  case 'open':
    run('npx', ['cap', 'open', 'android']);
    break;
  default:
    console.error('usage: node scripts/android.mjs sync|debug|release|run|open [--allow-test-ads] [--release]');
    process.exit(1);
}
