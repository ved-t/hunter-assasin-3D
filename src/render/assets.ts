// Theme art, loaded lazily: each theme's trim sheets (KTX2, transcoded on a worker to whatever the GPU
// supports) and their layout. A theme's kit material exists from the start and draws in flat fallback
// colours until its sheet arrives; a failed load leaves it flat rather than failing the level.

import * as THREE from 'three';
import type { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { TIER_SETTINGS, type QualityTier } from '../config/quality';
import { ASSET_FILES } from '../config/tunables';
import { THEME_KITS } from '../level/kit';
import type { Theme } from '../level/types';
import {
  createKitMaterial,
  type KitMaterial,
  type SheetTextures,
  type TrimSheet,
} from './kit-material';
import { ktx2Loader } from './ktx2';

export class ThemeAssets {
  private readonly loader: KTX2Loader;
  private readonly kits = new Map<Theme, KitMaterial>();
  private readonly loads = new Map<Theme, Promise<void>>();
  private readonly textures: THREE.Texture[] = [];
  private anisotropy: number;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    tier: QualityTier,
  ) {
    this.loader = ktx2Loader(renderer);
    this.anisotropy = this.anisotropyFor(tier);
  }

  /** The theme's kit material (flat until its sheet has loaded). */
  material(theme: Theme): THREE.Material {
    return this.kit(theme).material;
  }

  /** Loads the theme's sheet once; resolves when it is applied, or when loading failed. */
  load(theme: Theme): Promise<void> {
    let pending = this.loads.get(theme);
    if (!pending) {
      pending = this.fetchSheet(theme).catch((err: unknown) => {
        console.warn(`[assets] theme "${theme}" stays untextured:`, err);
      });
      this.loads.set(theme, pending);
    }
    return pending;
  }

  /** Starts loading in the background (e.g. the next theme from the level select). */
  prefetch(theme: Theme): void {
    void this.load(theme);
  }

  applyTier(tier: QualityTier): void {
    this.anisotropy = this.anisotropyFor(tier);
    for (const tex of this.textures) {
      tex.anisotropy = this.anisotropy;
      tex.needsUpdate = true;
    }
  }

  private kit(theme: Theme): KitMaterial {
    let kit = this.kits.get(theme);
    if (!kit) {
      kit = createKitMaterial(THEME_KITS[theme].fallback);
      this.kits.set(theme, kit);
    }
    return kit;
  }

  private anisotropyFor(tier: QualityTier): number {
    return Math.min(TIER_SETTINGS[tier].anisotropy, this.renderer.capabilities.getMaxAnisotropy());
  }

  private async fetchSheet(theme: Theme): Promise<void> {
    const dir = `${ASSET_FILES.themesDir}${theme}/`;
    const res = await fetch(`${dir}sheet.json`);
    if (!res.ok) throw new Error(`sheet.json: HTTP ${res.status}`);
    const sheet = (await res.json()) as TrimSheet;
    const [albedo, normal, orm] = await Promise.all(
      (['albedo', 'normal', 'orm'] as const).map((name) =>
        this.loader.loadAsync(`${dir}${name}.ktx2`),
      ),
    );
    const textures: SheetTextures = { albedo, normal, orm } as SheetTextures;
    for (const tex of [albedo, normal, orm] as THREE.Texture[]) {
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.anisotropy = this.anisotropy;
      this.textures.push(tex);
    }
    this.kit(theme).applySheet(textures, sheet);
  }
}
