// End-of-mission screen: success or failure, time, kills, the star rating with the three criteria, and
// Retry / Next level. Buttons are real clicks, so Retry may take Pointer Lock straight back.

import type { MissionResult } from '../mission/mission';
import { createOverlay, type Overlay } from './overlay';

export interface ResultScreenOptions {
  onRetry: () => void;
  onNext: () => void;
}

/** m:ss */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export class ResultScreen {
  private readonly overlay: Overlay;
  private readonly title: HTMLHeadingElement;
  private readonly stars: HTMLDivElement;
  private readonly stats: HTMLDivElement;
  private readonly criteria: HTMLUListElement;
  private readonly next: HTMLButtonElement;

  constructor(root: HTMLElement, opts: ResultScreenOptions) {
    this.overlay = createOverlay(
      root,
      'result-overlay',
      `<div class="panel" role="dialog" aria-live="polite">
        <h2></h2>
        <div class="stars" aria-hidden="true"></div>
        <div class="stats"></div>
        <ul class="criteria"></ul>
        <div class="buttons">
          <button type="button" class="retry">Retry <kbd>R</kbd></button>
          <button type="button" class="next">Next level</button>
        </div>
      </div>`,
    );
    const el = this.overlay.element;
    const q = <T extends Element>(sel: string) => el.querySelector(sel) as T;
    this.title = q('h2');
    this.stars = q('.stars');
    this.stats = q('.stats');
    this.criteria = q('.criteria');
    this.next = q('.next');
    q<HTMLButtonElement>('.retry').addEventListener('click', opts.onRetry);
    this.next.addEventListener('click', opts.onNext);
  }

  get isOpen(): boolean {
    return this.overlay.visible;
  }

  /** `totalGuards` for the kill count; `parTimeS` for the time criterion; `hasNext` shows Next. */
  show(
    r: MissionResult,
    totalGuards: number,
    parTimeS: number | undefined,
    hasNext: boolean,
  ): void {
    const won = r.outcome === 'won';
    this.overlay.element.classList.toggle('failed', !won);
    this.title.textContent = won ? 'Mission complete' : 'Mission failed';
    this.stars.hidden = !won;
    this.stars.textContent = '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars);
    this.stats.textContent = `Time ${formatTime(r.stats.timeS)}  ·  Kills ${r.stats.kills}/${totalGuards}`;
    const items: [boolean, string][] = [
      [r.criteria.noDetection, 'Never detected'],
      [r.criteria.noDamage, 'No damage taken'],
      [
        r.criteria.underPar,
        parTimeS === undefined ? 'No par time' : `Under ${formatTime(parTimeS)}`,
      ],
    ];
    this.criteria.replaceChildren(
      ...items.map(([ok, text]) => {
        const li = document.createElement('li');
        li.className = ok ? 'met' : 'missed';
        li.textContent = `${ok ? '✓' : '✗'} ${text}`;
        return li;
      }),
    );
    this.criteria.hidden = !won;
    this.next.hidden = !(won && hasNext);
    this.overlay.show();
  }

  hide(): void {
    this.overlay.hide();
  }
}
