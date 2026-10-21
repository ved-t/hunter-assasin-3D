import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base: portals and the Capacitor WebView serve the build from arbitrary subpaths.
  base: './',
  build: {
    target: 'es2020',
    sourcemap: false,
    // three.js alone is ~530 KB minified; the real budget (1 MB gzipped JS) is enforced by npm run size.
    chunkSizeWarningLimit: 800,
  },
  server: {
    port: 5173,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
