// Fixed-step game loop: the sim runs at SIM.hz, rendering runs once per animation frame
// and receives an interpolation alpha between the previous and current sim states.

import { SIM, PERF } from '../config/tunables';
import { GameTime } from './time';

export interface AccumulatorStep {
  /** Number of fixed sim steps to run this frame. */
  steps: number;
  /** Leftover time carried to the next frame (s), always < stepDt. */
  accumulator: number;
  /** Interpolation factor in [0, 1) for rendering between the last two sim states. */
  alpha: number;
}

/** Pure accumulator math, separated from requestAnimationFrame so it can be unit-tested. */
export function stepAccumulator(
  accumulator: number,
  frameDt: number,
  stepDt: number,
  maxFrameDt: number,
  maxSteps: number,
): AccumulatorStep {
  let acc = accumulator + Math.min(Math.max(frameDt, 0), maxFrameDt);
  let steps = Math.floor(acc / stepDt);
  if (steps > maxSteps) {
    // Too far behind: run the cap and drop the backlog instead of spiralling.
    steps = maxSteps;
    acc = acc % stepDt;
  } else {
    acc -= steps * stepDt;
  }
  // Guard against float drift leaving acc a hair at or above stepDt.
  if (acc >= stepDt) acc = 0;
  return { steps, accumulator: acc, alpha: acc / stepDt };
}

/** Rolling frame-time statistics for the debug overlay and the fps probe. */
export class FrameStats {
  private readonly samples: Float32Array;
  private count = 0;
  private index = 0;

  constructor(size: number = PERF.frameStatsWindow) {
    this.samples = new Float32Array(size);
  }

  push(frameMs: number): void {
    this.samples[this.index] = frameMs;
    this.index = (this.index + 1) % this.samples.length;
    this.count = Math.min(this.count + 1, this.samples.length);
  }

  reset(): void {
    this.count = 0;
    this.index = 0;
  }

  get size(): number {
    return this.count;
  }

  avgMs(): number {
    if (this.count === 0) return 0;
    let sum = 0;
    for (let i = 0; i < this.count; i++) sum += this.samples[i] ?? 0;
    return sum / this.count;
  }

  /** Percentile of frame times, p in [0, 1]. */
  percentileMs(p: number): number {
    if (this.count === 0) return 0;
    const sorted = Array.from(this.samples.subarray(0, this.count)).sort((a, b) => a - b);
    const i = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
    return sorted[i] ?? 0;
  }
}

export interface LoopCallbacks {
  /** Fixed-step simulation update. dt is always 1 / SIM.hz. */
  update: (dt: number, time: GameTime) => void;
  /** Render with interpolation alpha in [0, 1). frameDt is the real frame delta (s). */
  render: (alpha: number, frameDt: number) => void;
}

export class GameLoop {
  readonly time = new GameTime();
  readonly stats = new FrameStats();
  readonly stepDt = 1 / SIM.hz;
  /** When true, rendering continues but the simulation does not advance (e.g. rotate overlay). */
  simPaused = false;

  private accumulator = 0;
  private lastMs = 0;
  private frameId = 0;
  private running = false;

  constructor(private readonly callbacks: LoopCallbacks) {}

  get isRunning(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastMs = performance.now();
    this.accumulator = 0;
    this.frameId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frameId);
  }

  private readonly tick = (nowMs: number): void => {
    if (!this.running) return;
    this.frameId = requestAnimationFrame(this.tick);

    const rawMs = nowMs - this.lastMs;
    this.lastMs = nowMs;
    this.stats.push(rawMs);
    const frameDt = Math.min(rawMs / 1000, SIM.maxFrameDt);
    this.time.realSeconds += frameDt;

    let alpha = 0;
    if (!this.simPaused) {
      const step = stepAccumulator(
        this.accumulator,
        frameDt,
        this.stepDt,
        SIM.maxFrameDt,
        SIM.maxStepsPerFrame,
      );
      this.accumulator = step.accumulator;
      alpha = step.alpha;
      for (let i = 0; i < step.steps; i++) {
        this.callbacks.update(this.stepDt, this.time);
        this.time.simSteps++;
        this.time.simSeconds += this.stepDt;
      }
    }

    this.callbacks.render(alpha, frameDt);
  };
}
