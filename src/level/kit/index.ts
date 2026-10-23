// The environment kit for each theme.

import type { Theme } from '../types';
import type { ThemeKit } from './kit-common';
import { MANSION } from './mansion';
import { OFFICE } from './office';
import { WAREHOUSE } from './warehouse';

export const THEME_KITS: Record<Theme, ThemeKit> = {
  warehouse: WAREHOUSE,
  office: OFFICE,
  mansion: MANSION,
};

/** Levels without a theme (the dev greybox pair) use the warehouse kit. */
export const DEFAULT_THEME: Theme = 'warehouse';
