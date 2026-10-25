import { describe, expect, it, vi } from 'vitest';
import { initWithFallback } from './index';
import type { Platform } from './platform';

function fakePlatform(name: string, init: () => Promise<void> = async () => {}): Platform {
  return { name, init: vi.fn(init) } as unknown as Platform;
}

describe('initWithFallback', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  it('initialises and returns the adapter when its SDK works', async () => {
    const adapter = fakePlatform('portal');
    const p = await initWithFallback(async () => adapter, () => fakePlatform('dev'));
    expect(p).toBe(adapter);
    expect(adapter.init).toHaveBeenCalledOnce();
  });

  it('falls back to dev when the SDK is absent', async () => {
    const p = await initWithFallback(async () => null, () => fakePlatform('dev'));
    expect(p.name).toBe('dev');
    expect(p.init).toHaveBeenCalledOnce();
  });

  it('falls back to dev when the SDK init throws', async () => {
    const broken = fakePlatform('portal', () => Promise.reject(new Error('blocked')));
    const p = await initWithFallback(async () => broken, () => fakePlatform('dev'));
    expect(p.name).toBe('dev');
  });
});
