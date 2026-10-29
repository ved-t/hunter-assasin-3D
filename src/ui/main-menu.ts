// Title screen: Play (the next level to beat on the picked difficulty), Levels, Loadout and Settings,
// with the star total for that difficulty and the gem total. Drawn over the paused level behind it. Buttons are real clicks, so Play may take Pointer Lock.

import { createOverlay, type Overlay } from './overlay';

export interface MainMenuOptions {
  onPlay: () => void;
  onLevels: () => void;
  onLoadout: () => void;
  onSettings: () => void;
}

export interface MainMenuInfo {
  /** Name of the level Play starts, and the difficulty it is played on. */
  playName: string;
  difficultyName: string;
  stars: number;
  maxStars: number;
  gems: number;
}

export class MainMenu {
  private readonly overlay: Overlay;
  private readonly playName: HTMLSpanElement;
  private readonly totals: HTMLDivElement;
  private readonly play: HTMLButtonElement;

  constructor(root: HTMLElement, opts: MainMenuOptions) {
    this.overlay = createOverlay(
      root,
      'menu-screen main-menu',
      `<div class="menu-panel" role="dialog" aria-label="Main menu">
        <h1 class="game-title">Shadow Hunter</h1>
        <div class="menu-totals"></div>
        <button type="button" class="menu-btn primary play">Play<span class="play-name"></span></button>
        <button type="button" class="menu-btn levels">Levels</button>
        <button type="button" class="menu-btn loadout">Loadout</button>
        <button type="button" class="menu-btn settings">Settings</button>
      </div>`,
    );
    const el = this.overlay.element;
    const q = <T extends Element>(sel: string) => el.querySelector(sel) as T;
    this.play = q('.play');
    this.playName = q('.play-name');
    this.totals = q('.menu-totals');
    this.play.addEventListener('click', opts.onPlay);
    q<HTMLButtonElement>('.levels').addEventListener('click', opts.onLevels);
    q<HTMLButtonElement>('.loadout').addEventListener('click', opts.onLoadout);
    q<HTMLButtonElement>('.settings').addEventListener('click', opts.onSettings);
  }

  get isOpen(): boolean {
    return this.overlay.visible;
  }

  show(info: MainMenuInfo): void {
    this.playName.textContent = `${info.playName} · ${info.difficultyName}`;
    this.totals.innerHTML = `<span class="star">★</span> ${info.stars}/${info.maxStars}<span class="gem">◆</span> ${info.gems}`;
    this.overlay.show();
    this.play.focus({ preventScroll: true });
  }

  hide(): void {
    this.overlay.hide();
  }
}
