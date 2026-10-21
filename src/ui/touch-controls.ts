// On-screen touch buttons: crouch toggle, context action (inactive until Phase 4) and settings.
// Kept clear of the bottom ~24 px (iPhone home indicator) and side safe-area insets via CSS.

export interface TouchControlsOptions {
  onCrouch: () => void;
  onContext: () => void;
  onSettings: () => void;
}

export class TouchControls {
  private readonly crouch: HTMLButtonElement;
  private readonly buttons: HTMLButtonElement[];

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
    const context = make('touch-btn-context', 'Use', opts.onContext);
    context.disabled = true; // knife / interact arrive in Phase 4
    const settings = make('touch-btn-settings', '⚙', opts.onSettings);
    settings.setAttribute('aria-label', 'Settings');
    this.buttons = [this.crouch, context, settings];
  }

  set visible(v: boolean) {
    for (const b of this.buttons) b.hidden = !v;
  }

  setCrouched(on: boolean): void {
    this.crouch.classList.toggle('active', on);
  }
}
