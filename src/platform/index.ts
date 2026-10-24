// Picks the Platform implementation for the build target (__PLATFORM__, from the Vite mode). Each portal
// adapter is its own chunk, so a build only fetches its own SDK glue; dev is the fallback everywhere.

import { DevPlatform, type DevPlatformOptions } from './dev';
import type { Platform } from './platform';

export async function createPlatform(opts: DevPlatformOptions): Promise<Platform> {
  switch (__PLATFORM__) {
    // Phase 6b/6c add the crazygames, playgama and android adapters here.
    default:
      return new DevPlatform(opts);
  }
}

export type { Platform } from './platform';
