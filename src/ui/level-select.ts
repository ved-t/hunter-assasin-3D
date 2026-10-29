// Level select: the difficulty picker, one tab per theme, and a card per level with its best stars on the
// picked difficulty, locked until the level before it is won on any difficulty (everything is open with
// ?debug=1, Hardcore included).

import { CAMPAIGN, THEME_NAMES } from '../config/campaign';
import { DIFFICULTIES, DIFFICULTY_NAMES, type Difficulty } from '../config/difficulty';
import type { Theme } from '../level/types';
import {
  canPlayDifficulty,
  isUnlocked,
  levelRecord,
  nextToPlay,
  type Progress,
} from '../save/progress';
import { createOverlay, type Overlay } from './overlay';

export interface LevelSelectOptions {
  onPick: (id: string) => void;
  onBack: () => void;
  /** A difficulty segment was tapped (only playable ones can be). */
  onDifficulty: (d: Difficulty) => void;
  /** A tab with a playable level is showing: its theme's art is worth fetching now. */
  onTheme?: (theme: Theme) => void;
}

export class LevelSelect {
  private readonly overlay: Overlay;
  private readonly picker: HTMLDivElement;
  private readonly hint: HTMLDivElement;
  private readonly tabs: HTMLDivElement;
  private readonly cards: HTMLDivElement;
  private theme: Theme | null = null;
  private progress: Progress | null = null;
  private allOpen = false;

  constructor(
    root: HTMLElement,
    private readonly opts: LevelSelectOptions,
  ) {
    this.overlay = createOverlay(
      root,
      'menu-screen level-select',
      `<div class="menu-panel wide" role="dialog" aria-label="Levels">
        <h2>Levels</h2>
        <div class="difficulty-picker" role="radiogroup" aria-label="Difficulty"></div>
        <div class="diff-hint" hidden>Clear every level on Hard to unlock Hardcore</div>
        <div class="tabs" role="tablist"></div>
        <div class="level-cards"></div>
        <button type="button" class="menu-btn back">Back</button>
      </div>`,
    );
    const el = this.overlay.element;
    this.picker = el.querySelector('.difficulty-picker') as HTMLDivElement;
    this.hint = el.querySelector('.diff-hint') as HTMLDivElement;
    this.tabs = el.querySelector('.tabs') as HTMLDivElement;
    this.cards = el.querySelector('.level-cards') as HTMLDivElement;
    (el.querySelector('.back') as HTMLButtonElement).addEventListener('click', opts.onBack);
  }

  get isOpen(): boolean {
    return this.overlay.visible;
  }

  /** `allOpen`: ignore locks (?debug=1). Opens on the tab of the next level to play. */
  show(progress: Progress, allOpen: boolean): void {
    this.progress = progress;
    this.allOpen = allOpen;
    const next = CAMPAIGN.find((l) => l.id === nextToPlay(progress));
    this.theme = next?.theme ?? CAMPAIGN[0]?.theme ?? null;
    this.render();
    this.overlay.show();
  }

  /** New progress (a difficulty was picked): redraw on the same tab. */
  update(progress: Progress): void {
    this.progress = progress;
    this.render();
  }

  hide(): void {
    this.overlay.hide();
  }

  private render(): void {
    const { progress } = this;
    if (!progress) return;
    const picked = progress.difficulty;
    this.picker.replaceChildren(
      ...DIFFICULTIES.map((d) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `diff-btn ${d}${d === picked ? ' active' : ''}`;
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(d === picked));
        b.disabled = !this.allOpen && !canPlayDifficulty(progress, d);
        b.textContent = DIFFICULTY_NAMES[d];
        b.addEventListener('click', () => {
          if (d !== picked) this.opts.onDifficulty(d);
        });
        return b;
      }),
    );
    this.hint.hidden = this.allOpen || canPlayDifficulty(progress, 'hardcore');
    const themes = [...new Set(CAMPAIGN.map((l) => l.theme))];
    this.tabs.replaceChildren(
      ...themes.map((t) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `tab${t === this.theme ? ' active' : ''}`;
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', String(t === this.theme));
        b.textContent = THEME_NAMES[t];
        b.addEventListener('click', () => {
          this.theme = t;
          this.render();
        });
        return b;
      }),
    );
    let anyOpen = false;
    this.cards.replaceChildren(
      ...CAMPAIGN.map((level, index) => ({ level, index }))
        .filter(({ level }) => level.theme === this.theme)
        .map(({ level, index }) => {
          const open = this.allOpen || isUnlocked(progress, index);
          anyOpen ||= open;
          const stars = levelRecord(progress, level.id)?.stars ?? 0;
          const b = document.createElement('button');
          b.type = 'button';
          b.className = `level-card${open ? '' : ' locked'}`;
          b.disabled = !open;
          b.innerHTML = `<span class="num">${index + 1}</span><span class="name"></span><span class="stars">${
            open ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : 'Locked'
          }</span>`;
          (b.querySelector('.name') as HTMLSpanElement).textContent = level.name;
          b.addEventListener('click', () => this.opts.onPick(level.id));
          return b;
        }),
    );
    if (anyOpen && this.theme) this.opts.onTheme?.(this.theme);
  }
}
