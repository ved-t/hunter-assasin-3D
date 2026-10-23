// Fetches and validates a level JSON file, then builds its Grid.

import { LEVEL_FILES } from '../config/tunables';
import { Grid } from './grid';
import type { LevelData } from './types';
import { validateLevel } from './validate';

export interface LoadedLevel {
  data: LevelData;
  grid: Grid;
}

export class LevelLoadError extends Error {}

export async function loadLevel(id: string): Promise<LoadedLevel> {
  // Relative URL so portal subpaths and the Capacitor WebView resolve it next to index.html.
  const res = await fetch(`${LEVEL_FILES.dir}${encodeURIComponent(id)}.json`);
  if (!res.ok) throw new LevelLoadError(`Level "${id}" not found (${res.status}).`);
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new LevelLoadError(`Level "${id}" is not valid JSON.`);
  }
  return levelFromJson(json, id);
}

/** Validates parsed level JSON and builds its Grid. */
export function levelFromJson(json: unknown, id = 'level'): LoadedLevel {
  const result = validateLevel(json);
  if (!result.ok) {
    throw new LevelLoadError(`Level "${id}" is invalid:\n${result.errors.join('\n')}`);
  }
  return { data: result.level, grid: Grid.fromRows(result.level.tiles, result.level.tileSize) };
}
