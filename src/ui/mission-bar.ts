// Text HUD: the objective line and bottle count (top centre), and the context prompt under the
// crosshair ("E · Takedown"). On touch the prompt is hidden: the Use button lights up instead.
// Text is only written when it changes.

export class MissionBar {
  private readonly bar: HTMLDivElement;
  private readonly objective: HTMLSpanElement;
  private readonly bottles: HTMLSpanElement;
  private readonly prompt: HTMLDivElement;
  private shown = { objective: '', bottles: '', prompt: '' };

  constructor(root: HTMLElement) {
    this.bar = document.createElement('div');
    this.bar.className = 'mission-bar';
    this.objective = document.createElement('span');
    this.objective.className = 'objective';
    this.bottles = document.createElement('span');
    this.bottles.className = 'bottles';
    this.bar.append(this.objective, this.bottles);
    this.prompt = document.createElement('div');
    this.prompt.className = 'context-prompt';
    this.prompt.hidden = true;
    root.append(this.bar, this.prompt);
  }

  set visible(v: boolean) {
    this.bar.hidden = !v;
    if (!v) this.prompt.hidden = true;
  }

  /** `prompt` is null when there is nothing to do (or on touch, where the button shows it). */
  update(objective: string, bottles: string, prompt: string | null): void {
    const s = this.shown;
    if (objective !== s.objective) this.objective.textContent = s.objective = objective;
    if (bottles !== s.bottles) this.bottles.textContent = s.bottles = bottles;
    const p = prompt ?? '';
    if (p !== s.prompt) {
      s.prompt = p;
      this.prompt.textContent = p;
      this.prompt.hidden = p === '';
    }
  }
}
