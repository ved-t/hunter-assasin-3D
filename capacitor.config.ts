// Capacitor wraps the android build (dist-android/, from `vite build --mode android`) as the native app.
// The native project lives in android/; scripts/android.mjs syncs, builds and signs it.
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.autobuildstudios.shadowhunter',
  appName: 'Shadow Hunter',
  webDir: 'dist-android',
  backgroundColor: '#05070a',
  android: {
    // Gameplay input is touch only; keep the WebView from zooming or overscrolling.
    allowMixedContent: false,
    captureInput: false,
  },
};

export default config;
