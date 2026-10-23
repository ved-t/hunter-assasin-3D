// Loadout catalogue: knife and glove skins (looks only) and perks (gameplay, one equipped at a time).
// Prices add up to a little less than a full 3-star campaign earns, so everything can be bought.
// Perk effects live in tunables.ts (PERKS); swatches are CSS colours for the menu until the 5d viewmodel.

import { HEALTH, PERKS } from './tunables';

export type UnlockKind = 'knife' | 'glove' | 'perk';

export interface UnlockItem {
  id: string;
  kind: UnlockKind;
  name: string;
  /** Gems; 0 = owned from the start. */
  cost: number;
  /** CSS colour shown in the loadout. */
  swatch: string;
  description?: string;
}

export const UNLOCKS: readonly UnlockItem[] = [
  { id: 'knife-steel', kind: 'knife', name: 'Steel', cost: 0, swatch: '#b9c2cc' },
  { id: 'knife-black', kind: 'knife', name: 'Blackened', cost: 30, swatch: '#2b2f35' },
  { id: 'knife-brass', kind: 'knife', name: 'Brass', cost: 50, swatch: '#c9a24a' },
  { id: 'knife-damascus', kind: 'knife', name: 'Damascus', cost: 80, swatch: '#8a8f99' },
  { id: 'glove-black', kind: 'glove', name: 'Black leather', cost: 0, swatch: '#1c1d20' },
  { id: 'glove-tan', kind: 'glove', name: 'Tan suede', cost: 40, swatch: '#8b6a48' },
  { id: 'glove-olive', kind: 'glove', name: 'Tactical olive', cost: 70, swatch: '#4d5536' },
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
