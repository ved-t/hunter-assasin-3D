import { describe, expect, it } from 'vitest';
import { ADS } from '../config/tunables';
import { AdPolicy } from './ad-policy';

describe('AdPolicy', () => {
  it('holds interstitials back early in the session', () => {
    const p = new AdPolicy(100);
    expect(p.interstitialDue(100)).toBe(false);
    expect(p.interstitialDue(100 + ADS.firstInterstitialAfterS - 1)).toBe(false);
    expect(p.interstitialDue(100 + ADS.firstInterstitialAfterS)).toBe(true);
  });

  it('keeps a minimum gap after any ad, rewarded included', () => {
    const p = new AdPolicy(0);
    const t = ADS.firstInterstitialAfterS + 10;
    p.adShown(t);
    expect(p.interstitialDue(t + ADS.interstitialMinGapS - 1)).toBe(false);
    expect(p.interstitialDue(t + ADS.interstitialMinGapS)).toBe(true);
  });
});
