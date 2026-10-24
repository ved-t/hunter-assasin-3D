// One KTX2Loader for the whole game (theme sheets and the guard model): each instance runs its own
// transcoder workers, so they are shared.

import type * as THREE from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

let shared: KTX2Loader | null = null;

export function ktx2Loader(renderer: THREE.WebGLRenderer): KTX2Loader {
  // No transcoder path: the loader then fetches three's Basis transcoder by URL, which Vite bundles.
  shared ??= new KTX2Loader().detectSupport(renderer);
  return shared;
}
