// Loadout: spend gems on knife and glove skins and perks, and pick what to wear (one perk at a time).
// Applies the pure rules from save/progress.ts and hands every new Progress to the owner to save.

import { UNLOCKS, type UnlockItem, type UnlockKind } from '../config/unlocks';
import { buy, equip, owns, type Progress } from '../save/progress';
import { createOverlay, type Overlay } from './overlay';

export interface LoadoutOptions {
  /** After every purchase or equip. */
  onChange: (progress: Progress) => void;
  onBack: () => void;
}

const SECTIONS: [UnlockKind, string][] = [
  ['knife', 'Knife'],
  ['glove', 'Gloves'],
  ['perk', 'Perk (one at a time)'],
];

export class Loadout {
  private readonly overlay: Overlay;
  private readonly gems: HTMLSpanElement;
  private readonly body: HTMLDivElement;
  private progress: Progress | null = null;

  constructor(
    root: HTMLElement,
    private readonly opts: LoadoutOptions,
  ) {
    this.overlay = createOverlay(
      root,
      'menu-screen loadout',
      `<div class="menu-panel wide" role="dialog" aria-label="Loadout">
        <h2>Loadout <span class="gem-balance"><span class="gem">◆</span> <span class="gems"></span></span></h2>
        <div class="loadout-body"></div>
        <button type="button" class="menu-btn back">Back</button>
      </div>`,
    );
    const el = this.overlay.element;
    this.gems = el.querySelector('.gems') as HTMLSpanElement;
    this.body = el.querySelector('.loadout-body') as HTMLDivElement;
    (el.querySelector('.back') as HTMLButtonElement).addEventListener('click', opts.onBack);
  }

  get isOpen(): boolean {
    return this.overlay.visible;
  }

  show(progress: Progress): void {
    this.progress = progress;
    this.render();
    this.overlay.show();
  }

  hide(): void {
    this.overlay.hide();
  }

  private act(item: UnlockItem): void {
    const p = this.progress;
    if (!p) return;
    // Buying equips straight away; that is almost always why it was bought.
    const next = owns(p, item.id)
      ? equip(p, item.id)
      : (() => {
          const r = buy(p, item.id);
          return r.result === 'bought' ? equip(r.progress, item.id) : p;
        })();
    if (next === p) return;
    this.progress = next;
    this.opts.onChange(next);
    this.render();
  }

  private render(): void {
    const p = this.progress;
    if (!p) return;
    this.gems.textContent = String(p.gems);
    this.body.replaceChildren(
      ...SECTIONS.map(([kind, title]) => {
        const section = document.createElement('section');
        const h = document.createElement('h3');
        h.textContent = title;
        const list = document.createElement('div');
        list.className = 'unlock-list';
        list.append(...UNLOCKS.filter((u) => u.kind === kind).map((u) => this.card(p, u)));
        section.append(h, list);
        return section;
      }),
    );
  }

  private card(p: Progress, item: UnlockItem): HTMLElement {
    const owned = owns(p, item.id);
    const worn =
      item.kind === 'perk' ? p.equipped.perk === item.id : p.equipped[item.kind] === item.id;
    const card = document.createElement('div');
    card.className = `unlock-card${worn ? ' worn' : ''}`;
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = item.swatch;
    const text = document.createElement('span');
    text.className = 'unlock-text';
    const name = document.createElement('span');
    name.className = 'unlock-name';
    name.textContent = item.name;
    text.append(name);
    if (item.description) {
      const d = document.createElement('span');
      d.className = 'unlock-desc';
      d.textContent = item.description;
      text.append(d);
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'menu-btn small';
    if (!owned) {
      b.innerHTML = `<span class="gem">◆</span> ${item.cost}`;
      b.disabled = p.gems < item.cost;
    } else if (worn) {
      b.textContent = item.kind === 'perk' ? 'Remove' : 'Equipped';
      b.disabled = item.kind !== 'perk';
    } else {
      b.textContent = 'Equip';
    }
    b.addEventListener('click', () => this.act(item));
    card.append(swatch, text, b);
    return card;
  }
}
