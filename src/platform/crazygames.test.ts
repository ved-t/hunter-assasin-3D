import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADS } from '../config/tunables';
import { CrazyGamesPlatform } from './crazygames';

type AdOutcome = 'finish' | { error: string } | 'hang';

/** A scripted stand-in for window.CrazyGames.SDK. */
function fakeSdk(opts: { adblock?: boolean; outcome?: AdOutcome; muted?: boolean } = {}) {
  let settingsListener: ((s: CrazyGamesSdk.Settings) => void) | null = null;
  const data = new Map<string, string>();
  const sdk = {
    environment: 'local',
    init: vi.fn(async () => {}),
    game: {
      loadingStart: vi.fn(),
      loadingStop: vi.fn(),
      gameplayStart: vi.fn(),
      gameplayStop: vi.fn(),
      happytime: vi.fn(),
      settings: { muteAudio: opts.muted ?? false },
      addSettingsChangeListener: (fn: (s: CrazyGamesSdk.Settings) => void) => {
        settingsListener = fn;
      },
    },
    ad: {
      requestAd: vi.fn((_type: string, cb: CrazyGamesSdk.AdCallbacks) => {
        const outcome = opts.outcome ?? 'finish';
        if (typeof outcome === 'object') {
          cb.adError?.({ code: outcome.error, message: '' });
          return;
        }
        cb.adStarted?.();
        if (outcome === 'finish') cb.adFinished?.();
      }),
      hasAdblock: async () => opts.adblock ?? false,
    },
    data: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    },
    user: {
      isUserAccountAvailable: false,
      getUser: async () => null,
      systemInfo: { device: { type: 'desktop' as const } },
    },
  } satisfies CrazyGamesSdk.Sdk;
  return { sdk, data, changeSettings: (s: CrazyGamesSdk.Settings) => settingsListener?.(s) };
}

beforeEach(() => {
  const win = { addEventListener: () => {} } as unknown as Window & typeof globalThis;
  Object.assign(win, { self: win, top: win });
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', { hidden: false, addEventListener: () => {} });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('CrazyGamesPlatform', () => {
  it('holds the game paused for the length of an ad', async () => {
    const { sdk } = fakeSdk();
    const p = new CrazyGamesPlatform(sdk);
    const events: string[] = [];
    p.onPause(() => events.push('pause'));
    p.onResume(() => events.push('resume'));
    await p.showInterstitial();
    expect(sdk.ad.requestAd).toHaveBeenCalledWith('midgame', expect.anything());
    expect(events).toEqual(['pause', 'resume']);
  });

  it('grants the reward only when the rewarded ad finishes', async () => {
    expect(await new CrazyGamesPlatform(fakeSdk().sdk).showRewarded()).toBe(true);
    const unfilled = new CrazyGamesPlatform(fakeSdk({ outcome: { error: 'unfilled' } }).sdk);
    expect(await unfilled.showRewarded()).toBe(false);
    expect(unfilled.rewardedAvailable).toBe(true); // may fill next time
  });

  it('stops offering rewarded ads after a Basic Launch or adblock error', async () => {
    for (const error of ['adsDisabledBasicLaunch', 'adblock']) {
      const p = new CrazyGamesPlatform(fakeSdk({ outcome: { error } }).sdk);
      expect(await p.showRewarded()).toBe(false);
      expect(p.rewardedAvailable).toBe(false);
    }
  });

  it('marks rewarded unavailable when adblock is detected at init', async () => {
    const p = new CrazyGamesPlatform(fakeSdk({ adblock: true }).sdk);
    await p.init();
    expect(p.rewardedAvailable).toBe(false);
  });

  it('resumes after the timeout when an ad never ends', async () => {
    vi.useFakeTimers();
    const p = new CrazyGamesPlatform(fakeSdk({ outcome: 'hang' }).sdk);
    const resumed = vi.fn();
    p.onResume(resumed);
    const shown = p.showRewarded();
    await vi.advanceTimersByTimeAsync(ADS.sdkAdTimeoutS * 1000);
    expect(await shown).toBe(false);
    expect(resumed).toHaveBeenCalledOnce();
  });

  it('falls back (throws from init) on a domain where the SDK is disabled', async () => {
    const { sdk } = fakeSdk();
    sdk.init.mockImplementation(async () => {
      (sdk as { environment: string }).environment = 'disabled';
    });
    await expect(new CrazyGamesPlatform(sdk).init()).rejects.toThrow();
  });

  it('follows the portal mute setting, current state first', async () => {
    const { sdk, changeSettings } = fakeSdk({ muted: true });
    const p = new CrazyGamesPlatform(sdk);
    await p.init();
    const muted: boolean[] = [];
    p.onMuteChange((m) => muted.push(m));
    changeSettings({ muteAudio: false });
    expect(muted).toEqual([true, false]);
  });

  it('saves through the data module', async () => {
    const { sdk, data } = fakeSdk();
    const p = new CrazyGamesPlatform(sdk);
    await p.init();
    await p.storage.set('k', 'v');
    expect(await p.storage.get('k')).toBe('v');
    expect(data.size).toBe(1);
  });
});
