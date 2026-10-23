// On-screen touch buttons: crouch toggle, the context action (lit and enabled only when a takedown is
// possible), the bottle throw with its count, and settings.
// Kept clear of the bottom ~24 px (iPhone home indicator) and side safe-area insets via CSS.

export interface TouchControlsOptions {
  onCrouch: () => void;
  onContext: () => void;
  onThrow: () => void;
  onSettings: () => void;
}

export class TouchControls {
  private readonly crouch: HTMLButtonElement;
  private readonly context: HTMLButtonElement;
  private readonly bottle: HTMLButtonElement;
  private readonly buttons: HTMLButtonElement[];
  private bottles = -1;

  constructor(root: HTMLElement, opts: TouchControlsOptions) {
    const make = (cls: string, label: string, onPress: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `touch-btn ${cls}`;
      b.setAttribute('aria-label', label);
      b.textContent = label;
      // pointerdown, not click: responds instantly and works while the other thumb is dragging.
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!b.disabled) onPress();
      });
      root.appendChild(b);
      return b;
    };
    this.crouch = make('touch-btn-crouch', 'Crouch', opts.onCrouch);
    this.context = make('touch-btn-context', 'Kill', opts.onContext);
    this.context.disabled = true;
    this.bottle = make('touch-btn-bottle', 'Bottle', opts.onThrow);
    const settings = make('touch-btn-settings', '⚙', opts.onSettings);
    settings.setAttribute('aria-label', 'Settings');
    this.buttons = [this.crouch, this.context, this.bottle, settings];
  }

  set visible(v: boolean) {
    for (const b of this.buttons) b.hidden = !v;
  }

  setCrouched(on: boolean): void {
    this.crouch.classList.toggle('active', on);
  }

  /** A takedown is possible right now. */
  setContext(available: boolean): void {
    if (this.context.disabled !== available) return;
    this.context.disabled = !available;
    this.context.classList.toggle('active', available);
  }

  setBottles(n: number): void {
    if (n === this.bottles) return;
    this.bottles = n;
    this.bottle.textContent = `Bottle ${n}`;
    this.bottle.disabled = n <= 0;
  }
}
