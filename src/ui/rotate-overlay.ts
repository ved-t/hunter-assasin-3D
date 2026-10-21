// "Rotate to landscape" prompt for touch devices held in portrait.
// iPhone Safari has no orientation lock, so this is the only way to steer players to landscape.

import { createOverlay } from './overlay';

const PORTRAIT_TOUCH = '(orientation: portrait) and (pointer: coarse)';

/** Shows the overlay while in portrait and reports blocked state changes. Returns the initial state. */
export function setupRotateOverlay(
  root: HTMLElement,
  onChange: (blocked: boolean) => void,
): boolean {
  const overlay = createOverlay(
    root,
    'rotate-overlay',
    '<div class="rotate-icon"></div><div>Rotate your device to landscape</div>',
  );
  const query = window.matchMedia(PORTRAIT_TOUCH);
  const sync = () => {
    if (query.matches) overlay.show();
    else overlay.hide();
    onChange(query.matches);
  };
  query.addEventListener('change', sync);
  sync();
  return query.matches;
}
