// Quality tier selection: a hardware guess at boot, then a short fps probe that can drop one tier.
// Hand-rolled on purpose: GPU-benchmark libraries fetch data from a CDN at runtime, which portals dislike.

import { lowerTier, type QualityTier } from '../config/quality';
import { PERF } from '../config/tunables';

export interface DeviceInfo {
  /** Unmasked GPU renderer string, if the browser exposes it. */
  gpu: string | null;
  isMobile: boolean;
  /** navigator.hardwareConcurrency (0 if unknown). */
  cores: number;
  /** navigator.deviceMemory in GB (0 if unknown; Chrome only). */
  memoryGb: number;
}

const SOFTWARE_GPU = /swiftshader|llvmpipe|softpipe|software|microsoft basic render/i;
const WEAK_MOBILE_GPU =
  /mali-(4\d\d|t\d+|g31|g51|g52|g57)|adreno[^\d]*([2-5]\d\d|6[01]\d)\b|powervr|sgx|videocore/i;
// Old Intel iGPUs: GMA, unnumbered "HD Graphics", HD 2000–5xxx and HD 2xx–5xx. (\b excludes "UHD".)
const WEAK_DESKTOP_GPU = /intel.*\b(gma|hd graphics(?! \d)|hd graphics [2-5]\d{2,3}\b)/i;
const INTEGRATED_DESKTOP_GPU = /intel|vega \d\b|radeon\(tm\) graphics|mali|adreno/i;
const STRONG_DESKTOP_GPU = /nvidia|geforce|rtx|gtx|quadro|radeon (rx|pro)|apple m\d|apple gpu/i;

/** Lowest-RAM / fewest-core mobile devices go straight to low. */
const LOW_END_MOBILE_MAX_MEMORY_GB = 3;
const LOW_END_MOBILE_MAX_CORES = 4;

export function guessTier(info: DeviceInfo): QualityTier {
  const gpu = info.gpu ?? '';
  if (SOFTWARE_GPU.test(gpu)) return 'low';

  if (info.isMobile) {
    if (WEAK_MOBILE_GPU.test(gpu)) return 'low';
    if (info.memoryGb > 0 && info.memoryGb <= LOW_END_MOBILE_MAX_MEMORY_GB) return 'low';
    if (info.cores > 0 && info.cores <= LOW_END_MOBILE_MAX_CORES) return 'low';
    // Mobile never starts on high; the mid-range target phone is medium.
    return 'medium';
  }

  if (WEAK_DESKTOP_GPU.test(gpu)) return 'low';
  if (STRONG_DESKTOP_GPU.test(gpu)) return 'high';
  if (INTEGRATED_DESKTOP_GPU.test(gpu)) return 'medium';
  return 'medium';
}

/**
 * Collects frame times for PERF.probeSeconds after a warm-up, then reports the median fps.
 * Feed it every rendered frame's duration; it ignores frames once finished.
 */
export class FpsProbe {
  private readonly frames: number[] = [];
  private seen = 0;
  private elapsedMs = 0;
  private finished = false;

  constructor(
    private readonly durationMs: number = PERF.probeSeconds * 1000,
    private readonly warmupFrames: number = PERF.probeWarmupFrames,
  ) {}

  get done(): boolean {
    return this.finished;
  }

  /** Returns true on the frame the probe completes. */
  push(frameMs: number): boolean {
    if (this.finished) return false;
    this.seen++;
    if (this.seen <= this.warmupFrames) return false;
    this.frames.push(frameMs);
    this.elapsedMs += frameMs;
    if (this.elapsedMs >= this.durationMs) {
      this.finished = true;
      return true;
    }
    return false;
  }

  medianFps(): number {
    if (this.frames.length === 0) return 0;
    const sorted = [...this.frames].sort((a, b) => a - b);
    const mid = sorted[Math.floor(sorted.length / 2)] ?? 0;
    return mid > 0 ? 1000 / mid : 0;
  }
}

/** Tier after the probe: drop one tier if the median fps is below the threshold. Never upgrades. */
export function tierAfterProbe(
  tier: QualityTier,
  medianFps: number,
  threshold: number = PERF.probeDowngradeFps,
): QualityTier {
  if (medianFps >= threshold) return tier;
  return lowerTier(tier) ?? tier;
}
