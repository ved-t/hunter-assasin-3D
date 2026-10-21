import { describe, expect, it } from 'vitest';
import { FpsProbe, guessTier, tierAfterProbe, type DeviceInfo } from './tier-detect';

const desktop = (gpu: string | null): DeviceInfo => ({
  gpu,
  isMobile: false,
  cores: 8,
  memoryGb: 8,
});
const mobile = (gpu: string | null, extra: Partial<DeviceInfo> = {}): DeviceInfo => ({
  gpu,
  isMobile: true,
  cores: 8,
  memoryGb: 6,
  ...extra,
});

describe('guessTier', () => {
  it.each([
    ['ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'high'],
    ['ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)', 'high'],
    ['Apple M1', 'high'],
    ['ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'medium'],
    ['ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', 'medium'],
    ['ANGLE (Intel, Intel(R) HD Graphics 4000 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'low'],
    ['ANGLE (Intel, Intel(R) HD Graphics 520 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'low'],
    ['ANGLE (Intel, Intel(R) HD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'medium'],
    ['ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)', 'low'],
    [null, 'medium'],
  ] as const)('desktop %s -> %s', (gpu, tier) => {
    expect(guessTier(desktop(gpu))).toBe(tier);
  });

  it.each([
    ['Adreno (TM) 642L', 'medium'],
    ['Adreno (TM) 730', 'medium'],
    ['Adreno (TM) 610', 'low'],
    ['Adreno (TM) 506', 'low'],
    ['Mali-G57 MC2', 'low'],
    ['Mali-G78 MP14', 'medium'],
    ['Mali-T830', 'low'],
    ['PowerVR Rogue GE8320', 'low'],
    ['Apple GPU', 'medium'],
    [null, 'medium'],
  ] as const)('mobile %s -> %s', (gpu, tier) => {
    expect(guessTier(mobile(gpu))).toBe(tier);
  });

  it('drops low-memory or few-core phones to low', () => {
    expect(guessTier(mobile('Adreno (TM) 642L', { memoryGb: 2 }))).toBe('low');
    expect(guessTier(mobile('Adreno (TM) 642L', { cores: 4 }))).toBe('low');
  });

  it('never picks high on mobile', () => {
    expect(guessTier(mobile('NVIDIA GeForce RTX 4090'))).toBe('medium');
  });
});

describe('FpsProbe', () => {
  it('ignores warm-up frames and finishes after the duration', () => {
    const probe = new FpsProbe(100, 2);
    expect(probe.push(500)).toBe(false); // warm-up
    expect(probe.push(500)).toBe(false); // warm-up
    let finished = false;
    for (let i = 0; i < 10 && !finished; i++) finished = probe.push(20);
    expect(finished).toBe(true);
    expect(probe.done).toBe(true);
    expect(probe.medianFps()).toBeCloseTo(50);
    expect(probe.push(20)).toBe(false);
  });
});

describe('tierAfterProbe', () => {
  it('keeps the tier when fast enough', () => {
    expect(tierAfterProbe('high', 60, 50)).toBe('high');
  });
  it('drops exactly one tier when slow', () => {
    expect(tierAfterProbe('high', 30, 50)).toBe('medium');
    expect(tierAfterProbe('medium', 30, 50)).toBe('low');
  });
  it('stays on low', () => {
    expect(tierAfterProbe('low', 10, 50)).toBe('low');
  });
});
