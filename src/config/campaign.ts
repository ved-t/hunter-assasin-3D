// The campaign: level order, names and themes, so the menus can list every level without fetching it.
// Each id is a file in public/levels/ (a test checks they exist and validate). Levels not listed here,
// such as the Phase 1 greybox pair, stay reachable with ?level=<id> for development.

import type { Theme } from '../level/types';

export interface CampaignLevel {
  id: string;
  name: string;
  theme: Theme;
}

export const THEME_NAMES: Record<Theme, string> = {
  warehouse: 'Warehouse',
  office: 'Office',
  mansion: 'Mansion',
};

// Phase 5a placeholder: the two greybox levels until the 12 campaign levels land in 5b.
export const CAMPAIGN: readonly CampaignLevel[] = [
  { id: 'small', name: 'Greybox — Small', theme: 'warehouse' },
  { id: 'medium', name: 'Greybox — Medium', theme: 'warehouse' },
];

/** Position in the campaign, or −1 for a development level. */
export function campaignIndex(id: string): number {
  return CAMPAIGN.findIndex((l) => l.id === id);
}

/** The level after `id`, or null at the end of the campaign or outside it. */
export function nextLevelId(id: string): string | null {
  const i = campaignIndex(id);
  return i >= 0 ? (CAMPAIGN[i + 1]?.id ?? null) : null;
}
