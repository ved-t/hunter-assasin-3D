// Picks the Platform implementation. Only `dev` exists until Phase 6 adds a build-time switch.

import type { Platform } from './platform';
import { DevPlatform } from './dev';

export function createPlatform(verbose: boolean): Platform {
  return new DevPlatform(verbose);
}

export type { Platform } from './platform';
