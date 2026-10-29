// Intro card at the start of a level: the difficulty, its name and one-line tip, under the objective line. Fades out on
// its own after HUD.introCardS of play (time stands still while the game is paused); clicks pass through.

import { DIFFICULTY_NAMES, type Difficulty } from '../config/difficulty';
import { HUD } from '../config/tunables';

export class LevelIntro {
  private readonly card: HTMLDivElement;
  private readonly difficulty: HTMLDivElement;
  private readonly name: HTMLDivElement;
  private readonly tip: HTMLDivElement;
  private left = 0;

  constructor(root: HTMLElement) {
    this.card = document.createElement('div');
    this.card.className = 'level-intro';
    this.card.hidden = true;
    this.difficulty = document.createElement('div');
    this.name = document.createElement('div');
    this.name.className = 'name';
    this.tip = document.createElement('div');
    this.tip.className = 'tip';
    this.card.append(this.difficulty, this.name, this.tip);
    root.append(this.card);
  }

  /** `tip` may be absent (development levels): the card then shows the name alone. */
  show(name: string, tip: string | undefined, difficulty: Difficulty): void {
    this.difficulty.className = `difficulty ${difficulty}`;
    this.difficulty.textContent = DIFFICULTY_NAMES[difficulty];
    this.name.textContent = name;
    this.tip.textContent = tip ?? '';
    this.tip.hidden = !tip;
    this.left = HUD.introCardS;
    this.card.style.opacity = '1';
    this.card.hidden = false;
  }

  hide(): void {
    this.left = 0;
    this.card.hidden = true;
  }

  /** Per rendered frame of play (not while paused). */
  update(dt: number): void {
    if (this.left <= 0) return;
    this.left -= dt;
    if (this.left <= 0) this.hide();
    else this.card.style.opacity = String(Math.min(1, this.left / HUD.introFadeS));
  }
}
