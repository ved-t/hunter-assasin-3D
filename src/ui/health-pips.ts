// Health: one pip per hit point under the light gem. Lost pips stay as dim outlines so the player can
// count what is left at a glance. Writes the DOM only when the value changes.

import { HEALTH } from '../config/tunables';

export class HealthPips {
  private readonly root: HTMLDivElement;
  private pips: HTMLDivElement[] = [];
  private shown = -1;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'health-pips';
    this.root.setAttribute('aria-label', 'Health');
    this.setMax(HEALTH.maxHp);
    parent.appendChild(this.root);
  }

  set visible(v: boolean) {
    this.root.hidden = !v;
  }

  /** How many pips to show (the difficulty sets the player's hit points). */
  setMax(maxHp: number): void {
    if (maxHp === this.pips.length) return;
    for (const pip of this.pips) pip.remove();
    this.pips = Array.from({ length: maxHp }, () => {
      const pip = document.createElement('div');
      pip.className = 'health-pip';
      this.root.appendChild(pip);
      return pip;
    });
    this.root.setAttribute('aria-valuemax', String(maxHp));
    this.shown = -1;
  }

  update(hp: number): void {
    if (hp === this.shown) return;
    this.shown = hp;
    this.pips.forEach((pip, i) => pip.classList.toggle('lost', i >= hp));
    this.root.setAttribute('aria-valuenow', String(hp));
  }
}
