// Desktop prompt shown while the mouse is not captured. Clicks pass through to the canvas,
// which requests Pointer Lock.

export interface PlayHint {
  set(visible: boolean): void;
}

export function createPlayHint(root: HTMLElement): PlayHint {
  const el = document.createElement('div');
  el.className = 'play-hint';
  el.textContent = 'Click to play';
  el.hidden = true;
  root.appendChild(el);
  return { set: (v) => (el.hidden = !v) };
}
