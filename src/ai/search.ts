// Picks the cells a guard visits when searching around the last-known position.
// Reachable by walking, spread apart, biased along the direction the player was last heading.

import { SEARCH } from '../config/tunables';
import type { Rng } from '../core/rng';
import type { Vec2 } from '../level/collision';
import type { DistanceField } from '../nav/sound';

interface Candidate {
  x: number;
  z: number;
  score: number;
}

/**
 * Returns 4–6 cell centres (fewer if the area is small), ordered as a greedy nearest-next tour
 * starting from the LKP. `walk` must be a walking DistanceField; it is re-flooded from the LKP.
 */
export function pickSearchCells(walk: DistanceField, lkp: Vec2, heading: Vec2, rng: Rng): Vec2[] {
  const { grid } = walk;
  const dist = walk.flood(lkp.x, lkp.z, SEARCH.radiusM);
  const candidates: Candidate[] = [];
  for (let cy = 0; cy < grid.height; cy++) {
    for (let cx = 0; cx < grid.width; cx++) {
      const d = dist[cy * grid.width + cx] as number;
      if (!(d >= SEARCH.minDistM && d <= SEARCH.radiusM)) continue;
      const p = grid.cellCenter(cx, cy);
      const len = Math.hypot(p.x - lkp.x, p.z - lkp.z);
      const along = len > 0 ? ((p.x - lkp.x) * heading.x + (p.z - lkp.z) * heading.z) / len : 0;
      candidates.push({ ...p, score: SEARCH.headingWeight * along + SEARCH.jitter * rng.next() });
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  const want = rng.int(SEARCH.minCells, SEARCH.maxCells);
  const picked: Vec2[] = [];
  const spacing2 = SEARCH.minSpacingM * SEARCH.minSpacingM;
  for (const cand of candidates) {
    if (picked.length >= want) break;
    if (picked.some((p) => (p.x - cand.x) ** 2 + (p.z - cand.z) ** 2 < spacing2)) continue;
    picked.push({ x: cand.x, z: cand.z });
  }

  // Visit order: always the nearest remaining cell next.
  const tour: Vec2[] = [];
  let at = lkp;
  while (picked.length > 0) {
    let best = 0;
    let bestD = Infinity;
    picked.forEach((p, i) => {
      const d = (p.x - at.x) ** 2 + (p.z - at.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    at = picked.splice(best, 1)[0] as Vec2;
    tour.push(at);
  }
  return tour;
}
