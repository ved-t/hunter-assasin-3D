// Red screen-edge vignette: a sharp flash on every hit that fades out, and a slow pulse while the
// player is on their last hit point (not when one is all they ever have, as on Hardcore). One element, driven by CSS custom properties.

import { HEALTH, HUD } from '../config/tunables';

/** Smallest change in flash strength worth a style write. */
const WRITE_EPSILON = 0.01;

export class DamageVignette {
  private readonly el: HTMLDivElement;
  private flash = 0;
  private written = -1;
  private low = false;
  /** The player's full health; at or below HUD.lowHp the pulse would never stop, so it stays off. */
  maxHp: number = HEALTH.maxHp;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'damage-vignette';
    this.el.setAttribute('aria-hidden', 'true');
    root.appendChild(this.el);
  }

  hit(): void {
    this.flash = 1;
  }

  reset(): void {
    this.flash = 0;
  }

  update(dt: number, hp: number): void {
    this.flash = Math.max(0, this.flash - dt / HUD.hitFlashS);
    if (
      Math.abs(this.flash - this.written) >= WRITE_EPSILON ||
      (this.flash === 0) !== (this.written === 0)
    ) {
      this.written = this.flash;
      this.el.style.setProperty('--flash', this.flash.toFixed(3));
    }
    const low = hp > 0 && hp <= HUD.lowHp && this.maxHp > HUD.lowHp;
    if (low !== this.low) {
      this.low = low;
      this.el.classList.toggle('low', low);
    }
  }
}
