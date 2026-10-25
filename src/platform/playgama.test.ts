import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADS } from '../config/tunables';
import { createBridgeStorage, PlaygamaPlatform } from './playgama';

type Listener = (value: never) => void;

/** A scripted stand-in for window.bridge; `adStates` is what each show* call reports. */
function fakeBridge(opts: { adStates?: string[]; audio?: boolean; rewarded?: boolean } = {}) {
  const listeners = new Map<string, Set<Listener>>();
  const emitter = {
    on: (event: string, fn: Listener) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(fn);
    },
    off: (event: string, fn: Listener) => void listeners.get(event)?.delete(fn),
  };
  const emit = (event: string, value: unknown) =>
    listeners.get(event)?.forEach((fn) => (fn as (v: unknown) => void)(value));
  const play = (event: string) => (opts.adStates ?? ['opened', 'closed']).forEach((s) => emit(event, s));
  const store = new Map<string, unknown>();
  const bridge = {
    EVENT_NAME: {
      INTERSTITIAL_STATE_CHANGED: 'interstitial',
      REWARDED_STATE_CHANGED: 'rewarded',
      PAUSE_STATE_CHANGED: 'pause',
      AUDIO_STATE_CHANGED: 'audio',
    },
    initialize: vi.fn(async () => {}),
    platform: {
      ...emitter,
      id: 'mock',
      language: 'en',
      isAudioEnabled: opts.audio ?? true,
      sendMessage: vi.fn(),
    },
    advertisement: {
      ...emitter,
      isInterstitialSupported: true,
      isRewardedSupported: opts.rewarded ?? true,
      showInterstitial: vi.fn(() => play('interstitial')),
      showRewarded: vi.fn(() => play('rewarded')),
    },
    storage: {
      get: async (keys: string[]) => keys.map((k) => store.get(k) ?? null),
      set: async (keys: string[], values: string[]) =>
        keys.forEach((k, i) => store.set(k, values[i])),
    },
    device: { type: 'desktop' as const },
    player: { isAuthorized: false, id: null, name: null, photos: [] },
  } satisfies PlaygamaBridge.Bridge;
  return { bridge, emit, store, listeners };
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

describe('PlaygamaPlatform', () => {
  it('sends game_ready once', () => {
    const { bridge } = fakeBridge();
    const p = new PlaygamaPlatform(bridge);
    p.loadingStop();
    p.loadingStop();
    expect(bridge.platform.sendMessage).toHaveBeenCalledExactlyOnceWith('game_ready');
  });

  it('pauses for an interstitial and cleans up its listener', async () => {
    const { bridge, listeners } = fakeBridge();
    const p = new PlaygamaPlatform(bridge);
    const events: string[] = [];
    p.onPause(() => events.push('pause'));
    p.onResume(() => events.push('resume'));
    await p.showInterstitial();
    expect(events).toEqual(['pause', 'resume']);
    expect(listeners.get('interstitial')?.size).toBe(0);
  });

  it('grants the reward only when the rewarded state arrives', async () => {
    const earned = fakeBridge({ adStates: ['loading', 'opened', 'rewarded', 'closed'] });
    const p1 = new PlaygamaPlatform(earned.bridge);
    await p1.init();
    expect(await p1.showRewarded()).toBe(true);

    const skipped = fakeBridge({ adStates: ['opened', 'closed'] });
    const p2 = new PlaygamaPlatform(skipped.bridge);
    await p2.init();
    expect(await p2.showRewarded()).toBe(false);

    const failed = fakeBridge({ adStates: ['loading', 'failed'] });
    const p3 = new PlaygamaPlatform(failed.bridge);
    await p3.init();
    expect(await p3.showRewarded()).toBe(false);
  });

  it('offers no rewarded ad where the platform has none', async () => {
    const { bridge } = fakeBridge({ rewarded: false });
    const p = new PlaygamaPlatform(bridge);
    await p.init();
    expect(p.rewardedAvailable).toBe(false);
    expect(await p.showRewarded()).toBe(false);
    expect(bridge.advertisement.showRewarded).not.toHaveBeenCalled();
  });

  it('resumes after the timeout when an ad never closes', async () => {
    vi.useFakeTimers();
    const { bridge } = fakeBridge({ adStates: ['opened'] });
    const p = new PlaygamaPlatform(bridge);
    const resumed = vi.fn();
    p.onResume(resumed);
    const shown = p.showInterstitial();
    await vi.advanceTimersByTimeAsync(ADS.sdkAdTimeoutS * 1000);
    await shown;
    expect(resumed).toHaveBeenCalledOnce();
  });

  it('maps the host pause and audio states', async () => {
    const { bridge, emit } = fakeBridge({ audio: false });
    const p = new PlaygamaPlatform(bridge);
    await p.init();
    const events: string[] = [];
    p.onPause(() => events.push('pause'));
    p.onResume(() => events.push('resume'));
    p.onMuteChange((m) => events.push(m ? 'muted' : 'unmuted'));
    emit('pause', true);
    emit('pause', false);
    emit('audio', true);
    expect(events).toEqual(['muted', 'pause', 'resume', 'unmuted']);
  });
});

describe('createBridgeStorage', () => {
  it('round-trips strings and returns null for missing keys', async () => {
    const { bridge } = fakeBridge();
    const s = createBridgeStorage(bridge.storage);
    await s.set('k', '{"a":1}');
    expect(await s.get('k')).toBe('{"a":1}');
    expect(await s.get('missing')).toBeNull();
  });

  it('re-serialises values a platform hands back parsed', async () => {
    const { bridge, store } = fakeBridge();
    store.set('shadow-hunter:k', { a: 1 });
    expect(await createBridgeStorage(bridge.storage).get('k')).toBe('{"a":1}');
  });

  it('falls back to memory when the platform storage fails', async () => {
    const s = createBridgeStorage({
      get: () => Promise.reject(new Error('down')),
      set: () => Promise.reject(new Error('down')),
    });
    await s.set('k', 'v');
    expect(await s.get('k')).toBe('v');
  });
});
