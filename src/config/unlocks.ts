// Loadout catalogue: knife and glove skins (looks only) and perks (gameplay, one equipped at a time).
// Prices add up to a little less than a full 3-star campaign earns, so everything can be bought.
// Perk effects live in tunables.ts (PERKS); swatches are the CSS colours the loadout shows, and `look`
// is how a skin paints the first-person viewmodel (render/viewmodel-mesh.ts).

import { HEALTH, PERKS } from './tunables';

export type UnlockKind = 'knife' | 'glove' | 'perk';

/** Blade and grip finish. Colours are hex RGB; `pattern` overlays a procedural damascus figure. */
export interface KnifeLook {
  blade: number;
  metalness: number;
  roughness: number;
  grip: number;
  pattern?: 'damascus';
}

export interface GloveLook {
  color: number;
  roughness: number;
}

export interface UnlockItem {
  id: string;
  kind: UnlockKind;
  name: string;
  /** Gems; 0 = owned from the start. */
  cost: number;
  /** CSS colour shown in the loadout. */
  swatch: string;
  description?: string;
  knife?: KnifeLook;
  glove?: GloveLook;
}

export const UNLOCKS: readonly UnlockItem[] = [
  {
    id: 'knife-steel',
    kind: 'knife',
    name: 'Steel',
    cost: 0,
    swatch: '#b9c2cc',
    knife: { blade: 0xb9c2cc, metalness: 0.6, roughness: 0.32, grip: 0x1e2024 },
  },
  {
    id: 'knife-black',
    kind: 'knife',
    name: 'Blackened',
    cost: 30,
    swatch: '#2b2f35',
    knife: { blade: 0x2b2f35, metalness: 0.5, roughness: 0.45, grip: 0x141518 },
  },
  {
    id: 'knife-brass',
    kind: 'knife',
    name: 'Brass',
    cost: 50,
    swatch: '#c9a24a',
    knife: { blade: 0xc9a24a, metalness: 0.65, roughness: 0.35, grip: 0x3a2618 },
  },
  {
    id: 'knife-damascus',
    kind: 'knife',
    name: 'Damascus',
    cost: 80,
    swatch: '#8a8f99',
    knife: {
      blade: 0x9a9fa8,
      metalness: 0.6,
      roughness: 0.3,
      grip: 0x2a1c14,
      pattern: 'damascus',
    },
  },
  {
    id: 'glove-black',
    kind: 'glove',
    name: 'Black leather',
    cost: 0,
    swatch: '#1c1d20',
    glove: { color: 0x2a2b30, roughness: 0.55 },
  },
  {
    id: 'glove-tan',
    kind: 'glove',
    name: 'Tan suede',
    cost: 40,
    swatch: '#8b6a48',
    glove: { color: 0x8b6a48, roughness: 0.9 },
  },
  {
    id: 'glove-olive',
    kind: 'glove',
    name: 'Tactical olive',
    cost: 70,
    swatch: '#4d5536',
    glove: { color: 0x4d5536, roughness: 0.8 },
  },
  {
    id: 'perk-quiet',
    kind: 'perk',
    name: 'Soft soles',
    cost: 50,
    swatch: '#bff4ff',
    description: `Footsteps carry ${Math.round((1 - PERKS.quietStepsNoiseScale) * 100)}% less far.`,
  },
  {
    id: 'perk-regen',
    kind: 'perk',
    name: 'Second wind',
    cost: 60,
    swatch: '#bff4ff',
    description: `Health comes back after ${PERKS.fastRegenDelayS} s instead of ${HEALTH.regenDelayS} s.`,
  },
  {
    id: 'perk-bottle',
    kind: 'perk',
    name: 'Deep pockets',
    cost: 80,
    swatch: '#bff4ff',
    description: `${PERKS.extraBottles} extra bottle${PERKS.extraBottles === 1 ? '' : 's'} every level.`,
  },
];

export const DEFAULT_KNIFE = 'knife-steel';
export const DEFAULT_GLOVE = 'glove-black';

export function unlockById(id: string): UnlockItem | undefined {
  return UNLOCKS.find((u) => u.id === id);
}

/** The look of a knife skin id, falling back to the default knife. */
export function knifeLook(id: string): KnifeLook {
  return (unlockById(id)?.knife ?? unlockById(DEFAULT_KNIFE)?.knife) as KnifeLook;
}

/** The look of a glove skin id, falling back to the default glove. */
export function gloveLook(id: string): GloveLook {
  return (unlockById(id)?.glove ?? unlockById(DEFAULT_GLOVE)?.glove) as GloveLook;
}
