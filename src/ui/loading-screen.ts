// Shown while a level is fetched, built and its shaders compiled.

import { createOverlay, type Overlay } from './overlay';

export class LoadingScreen {
  private readonly overlay: Overlay;
  private readonly name: HTMLDivElement;

  constructor(root: HTMLElement) {
    this.overlay = createOverlay(
      root,
      'loading-overlay',
      `<div class="loading-name"></div><div class="loading-label">Loading…</div>`,
    );
    this.name = this.overlay.element.querySelector('.loading-name') as HTMLDivElement;
  }

  show(levelName: string): void {
    this.name.textContent = levelName;
    this.overlay.show();
  }

  hide(): void {
    this.overlay.hide();
  }
}
