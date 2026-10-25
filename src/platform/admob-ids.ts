// AdMob IDs for the Android build. Until the real ones are pasted in, these are Google's official test IDs
// (developers.google.com/admob/android/test-ads), which always fill with labelled test ads.
// scripts/android.mjs writes APP_ID into the native strings.xml on sync and refuses a release build while
// any test ID is left here (unless run with --allow-test-ads).

export const ADMOB_TEST_PUBLISHER = 'ca-app-pub-3940256099942544';

export const ADMOB_IDS = {
  // ↓ Paste the real IDs from the AdMob console here. ↓
  appId: 'ca-app-pub-3940256099942544~3347511713',
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
  rewarded: 'ca-app-pub-3940256099942544/5224354917',
} as const;

/** Test ads are requested (and labelled) while any test ID is still in use. */
export const ADMOB_TESTING = Object.values(ADMOB_IDS).some((id) => id.startsWith(ADMOB_TEST_PUBLISHER));
