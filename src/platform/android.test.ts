import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADS } from '../config/tunables';
import { AndroidPlatform, createPreferencesStorage, type AndroidPlugins } from './android';

type Handler = (payload?: unknown) => void;

interface FakeOptions {
  consent?: { status: string; canRequestAds: boolean; privacy?: string } | 'throw';
  /** What the shown ad reports: earned + dismissed, dismissed only, failed to show, or nothing. */
  ad?: 'earned' | 'dismissed' | 'failed' | 'hang';
  loadFails?: boolean;
}

function fakePlugins(opts: FakeOptions = {}) {
  const listeners = new Map<string, Handler>();
  const fire = (event: string) => listeners.get(event)?.();
  const play = (kind: 'interstitial' | 'rewarded') => {
    const prefix = kind === 'rewarded' ? 'onRewardedVideoAd' : 'interstitialAd';
    const outcome = opts.ad ?? 'dismissed';
    queueMicrotask(() => {
      if (outcome === 'earned') fire('onRewardedVideoAdReward');
      if (outcome === 'earned' || outcome === 'dismissed') fire(`${prefix}Dismissed`);
      if (outcome === 'failed') fire(`${prefix}FailedToShow`);
    });
    return Promise.resolve();
  };
  const consent = opts.consent ?? { status: 'NOT_REQUIRED', canRequestAds: true };
  const prefs = new Map<string, string>();
  const load = vi.fn(async () => {
    if (opts.loadFails) throw new Error('no fill');
    return { adUnitId: 'x' };
  });
  const admob = {
    initialize: vi.fn(async () => {}),
    requestConsentInfo: vi.fn(async () => {
      if (consent === 'throw') throw new Error('offline');
      return {
        status: consent.status,
        isConsentFormAvailable: true,
        canRequestAds: consent.canRequestAds,
        privacyOptionsRequirementStatus: consent.privacy ?? 'NOT_REQUIRED',
      };
    }),
    showConsentForm: vi.fn(async () => ({
      status: 'OBTAINED',
      canRequestAds: true,
      privacyOptionsRequirementStatus: 'REQUIRED',
    })),
    showPrivacyOptionsForm: vi.fn(async () => {}),
    prepareInterstitial: load,
    prepareRewardVideoAd: load,
    showInterstitial: vi.fn(() => play('interstitial')),
    showRewardVideoAd: vi.fn(() => play('rewarded')),
    addListener: vi.fn(async (event: string, fn: Handler) => {
      listeners.set(event, fn);
      return { remove: async () => {} };
    }),
  };
  const app = {
    addListener: vi.fn(async (event: string, fn: Handler) => {
      listeners.set(event, fn);
      return { remove: async () => {} };
    }),
    exitApp: vi.fn(async () => {}),
  };
  const preferences = {
    get: async ({ key }: { key: string }) => ({ value: prefs.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => void prefs.set(key, value),
  };
  const plugins = { admob, app, preferences } as unknown as AndroidPlugins;
  return { plugins, admob, app, fire, prefs, load };
}

beforeEach(() => {
  const win = { addEventListener: () => {} } as unknown as Window & typeof globalThis;
  Object.assign(win, { self: win, top: win });
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', { hidden: false, addEventListener: () => {} });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function ready(opts: FakeOptions = {}) {
  const f = fakePlugins(opts);
  const p = new AndroidPlatform(f.plugins);
  await p.init();
  return { p, ...f };
}

describe('AndroidPlatform', () => {
  it('grants the reward only when the Rewarded event fires before dismissal', async () => {
    expect(await (await ready({ ad: 'earned' })).p.showRewarded()).toBe(true);
    expect(await (await ready({ ad: 'dismissed' })).p.showRewarded()).toBe(false);
    expect(await (await ready({ ad: 'failed' })).p.showRewarded()).toBe(false);
  });

  it('holds the game paused for the ad and loads the next one after', async () => {
    const { p, load } = await ready();
    const events: string[] = [];
    p.onPause(() => events.push('pause'));
    p.onResume(() => events.push('resume'));
    const before = load.mock.calls.length;
    await p.showInterstitial();
    expect(events).toEqual(['pause', 'resume']);
    expect(load.mock.calls.length).toBe(before + 1);
  });

  it('resolves false without showing when no ad will load', async () => {
    const { p, admob } = await ready({ loadFails: true });
    expect(await p.showRewarded()).toBe(false);
    expect(admob.showRewardVideoAd).not.toHaveBeenCalled();
  });

  it('resumes after the timeout when an ad never closes', async () => {
    const { p } = await ready({ ad: 'hang' });
    vi.useFakeTimers();
    const resumed = vi.fn();
    p.onResume(resumed);
    const shown = p.showRewarded();
    await vi.advanceTimersByTimeAsync(ADS.sdkAdTimeoutS * 1000);
    expect(await shown).toBe(false);
    expect(resumed).toHaveBeenCalledOnce();
  });

  it('shows the consent form when required and offers privacy options after', async () => {
    const { p, admob } = await ready({ consent: { status: 'REQUIRED', canRequestAds: false } });
    expect(admob.showConsentForm).toHaveBeenCalledOnce();
    expect(p.rewardedAvailable).toBe(true);
    expect(p.privacyOptionsRequired).toBe(true);
  });

  it('serves no ads without consent, or when consent cannot be checked', async () => {
    for (const consent of [{ status: 'OBTAINED', canRequestAds: false }, 'throw'] as const) {
      const { p, admob } = await ready({ consent });
      expect(p.rewardedAvailable).toBe(false);
      expect(admob.initialize).not.toHaveBeenCalled();
      await p.showInterstitial();
      expect(admob.showInterstitial).not.toHaveBeenCalled();
    }
  });

  it('maps app pause/resume to host pause and forwards the back button', async () => {
    const { p, fire } = await ready();
    const events: string[] = [];
    p.onPause(() => events.push('pause'));
    p.onResume(() => events.push('resume'));
    p.onBack(() => events.push('back'));
    fire('pause');
    fire('resume');
    fire('backButton');
    expect(events).toEqual(['pause', 'resume', 'back']);
  });

  it('quits through the app plugin', async () => {
    const { p, app } = await ready();
    expect(p.canQuit).toBe(true);
    p.quit();
    expect(app.exitApp).toHaveBeenCalledOnce();
  });
});

describe('createPreferencesStorage', () => {
  it('round-trips and returns null for missing keys', async () => {
    const { plugins, prefs } = fakePlugins();
    const s = createPreferencesStorage(plugins.preferences);
    await s.set('k', 'v');
    expect(await s.get('k')).toBe('v');
    expect(prefs.get('shadow-hunter:k')).toBe('v');
    expect(await s.get('missing')).toBeNull();
  });

  it('falls back to memory when the plugin fails', async () => {
    const s = createPreferencesStorage({
      get: () => Promise.reject(new Error('down')),
      set: () => Promise.reject(new Error('down')),
    });
    await s.set('k', 'v');
    expect(await s.get('k')).toBe('v');
  });
});
