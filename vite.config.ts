import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';

/** Release targets, picked with `vite build --mode <target>`; any other mode builds the dev platform. */
const TARGETS = ['crazygames', 'playgama', 'android'] as const;
type Target = (typeof TARGETS)[number] | 'dev';

/** Portal SDK each target loads before the game script. Both portals require their CDN copy. */
const SDK_SCRIPTS: Record<Target, string | null> = {
  dev: null,
  crazygames: 'https://sdk.crazygames.com/crazygames-sdk-v3.js',
  playgama: 'https://bridge.playgama.com/v2/stable/playgama-bridge.js',
  android: null,
};

/** Files only one target ships, copied to its build root (Bridge reads its config next to index.html). */
const TARGET_FILES: Partial<Record<Target, string[]>> = {
  playgama: ['platform-config/playgama-bridge-config.json'],
};

/** Puts the target's SDK <script> in index.html ahead of the game, which needs it at boot. */
function sdkScript(target: Target): Plugin {
  return {
    name: 'shadow-hunter-sdk-script',
    transformIndexHtml() {
      const src = SDK_SCRIPTS[target];
      return src ? [{ tag: 'script', attrs: { src }, injectTo: 'head-prepend' }] : [];
    },
  };
}

/** Emits the target's TARGET_FILES into the build root. */
function targetFiles(target: Target): Plugin {
  return {
    name: 'shadow-hunter-target-files',
    apply: 'build',
    generateBundle() {
      for (const path of TARGET_FILES[target] ?? []) {
        this.emitFile({ type: 'asset', fileName: basename(path), source: readFileSync(path) });
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const target: Target = (TARGETS as readonly string[]).includes(mode) ? (mode as Target) : 'dev';
  return {
    // Relative base: portals and the Capacitor WebView serve the build from arbitrary subpaths.
    base: './',
    define: { __PLATFORM__: JSON.stringify(target) },
    plugins: [sdkScript(target), targetFiles(target)],
    build: {
      // Each target gets its own folder beside dist/, so building one never wipes another.
      outDir: target === 'dev' ? 'dist' : `dist-${target}`,
      target: 'es2020',
      sourcemap: false,
      // three.js alone is ~530 KB minified; the real budget (1 MB gzipped JS) is enforced by npm run size.
      chunkSizeWarningLimit: 900,
    },
    server: {
      port: 5173,
    },
    test: {
      include: ['src/**/*.test.ts'],
      environment: 'node',
    },
  };
});
