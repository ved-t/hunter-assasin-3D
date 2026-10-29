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

export const CAMPAIGN: readonly CampaignLevel[] = [
  { id: 'warehouse-1', name: 'Night Shift', theme: 'warehouse' },
  { id: 'warehouse-2', name: 'Footfalls', theme: 'warehouse' },
  { id: 'warehouse-3', name: 'Loose Ends', theme: 'warehouse' },
  { id: 'warehouse-4', name: 'The Ledger', theme: 'warehouse' },
  { id: 'warehouse-5', name: 'Loading Bay', theme: 'warehouse' },
  { id: 'warehouse-6', name: 'Cold Storage', theme: 'warehouse' },
  { id: 'warehouse-7', name: 'Pallet Rows', theme: 'warehouse' },
  { id: 'warehouse-8', name: 'Dead Drop', theme: 'warehouse' },
  { id: 'warehouse-9', name: 'Night Watch', theme: 'warehouse' },
  { id: 'warehouse-10', name: 'Last Shipment', theme: 'warehouse' },
  { id: 'office-1', name: 'After Hours', theme: 'office' },
  { id: 'office-2', name: 'Corner Offices', theme: 'office' },
  { id: 'office-3', name: 'Cross Traffic', theme: 'office' },
  { id: 'office-4', name: 'Server Room', theme: 'office' },
  { id: 'mansion-1', name: 'The Long Gallery', theme: 'mansion' },
  { id: 'mansion-2', name: 'Ballroom', theme: 'mansion' },
  { id: 'mansion-3', name: 'The Study', theme: 'mansion' },
  { id: 'mansion-4', name: 'Clean Sweep', theme: 'mansion' },
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
