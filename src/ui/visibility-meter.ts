// Crosshair dot and light gem: how lit the player is right now, from darkness to inside a beam.
// Driven through one CSS custom property, so an update never triggers layout.

import { HUD, LIGHT_EXPOSURE } from '../config/tunables';

/** Smallest change in the shown value worth a style write. */
const WRITE_EPSILON = 0.004;

/** Exposure (dark..lit) to 0..1. */
export function litFraction(exposure: number): number {
  const f = (exposure - LIGHT_EXPOSURE.dark) / (LIGHT_EXPOSURE.lit - LIGHT_EXPOSURE.dark);
  return Math.min(1, Math.max(0, f));
}

export class VisibilityMeter {
  private readonly gem: HTMLDivElement;
  private readonly elements: HTMLElement[];
  private shown = 0;
  private written = -1;

  constructor(root: HTMLElement) {
    const crosshair = document.createElement('div');
    crosshair.className = 'crosshair';
    this.gem = document.createElement('div');
    this.gem.className = 'light-gem';
    this.gem.setAttribute('aria-hidden', 'true');
    root.append(crosshair, this.gem);
    this.elements = [crosshair, this.gem];
  }

  set visible(v: boolean) {
    for (const el of this.elements) el.hidden = !v;
  }

  update(dt: number, exposure: number): void {
    const target = litFraction(exposure);
    this.shown += (target - this.shown) * (1 - Math.exp(-dt / HUD.meterSmoothingS));
    if (Math.abs(this.shown - this.written) < WRITE_EPSILON) return;
    this.written = this.shown;
    this.gem.style.setProperty('--lit', this.shown.toFixed(3));
  }
}
