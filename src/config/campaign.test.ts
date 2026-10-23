import { describe, expect, it } from 'vitest';
import { validateLevel } from '../level/validate';
import { CAMPAIGN, campaignIndex, nextLevelId } from './campaign';

const FILES = import.meta.glob<unknown>('../../public/levels/*.json', {
  eager: true,
  import: 'default',
});

describe('campaign', () => {
  it('lists each level once', () => {
    expect(new Set(CAMPAIGN.map((l) => l.id)).size).toBe(CAMPAIGN.length);
  });

  for (const entry of CAMPAIGN) {
    it(`${entry.id}: has a valid level file`, () => {
      const json = FILES[`../../public/levels/${entry.id}.json`];
      expect(json, 'missing file').toBeDefined();
      const r = validateLevel(json);
      expect(r.ok, r.ok ? '' : r.errors.join('\n')).toBe(true);
      if (r.ok) expect(r.level.id).toBe(entry.id);
    });
  }

  it('walks the order and stops at the end', () => {
    const first = CAMPAIGN[0]!.id;
    const last = CAMPAIGN[CAMPAIGN.length - 1]!.id;
    expect(campaignIndex(first)).toBe(0);
    expect(nextLevelId(first)).toBe(CAMPAIGN[1]?.id ?? null);
    expect(nextLevelId(last)).toBeNull();
    expect(campaignIndex('perf')).toBe(-1);
    expect(nextLevelId('perf')).toBeNull();
  });
});
