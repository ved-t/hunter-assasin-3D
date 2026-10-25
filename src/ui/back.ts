// What a "back" press does, from Esc on desktop or the Android system back button. Pure, so the screen
// routing is testable; main.ts carries out the action. Esc never resumes or leaves screens (Pointer Lock
// can't be retaken from Esc, and Esc already means "release the mouse"), so a few actions are back-only.

export interface BackState {
  /** A level is loading or an ad is up: back does nothing until it ends. */
  busy: boolean;
  inLevel: boolean;
  pauseOpen: boolean;
  resultOpen: boolean;
  /** Level select, loadout or menu settings is over the title. */
  titleSubscreenOpen: boolean;
}

export type BackAction = 'pause' | 'resume' | 'menu' | 'title' | 'quit' | 'none';

export function backAction(s: BackState, source: 'escape' | 'back'): BackAction {
  const back = source === 'back';
  if (s.busy) return 'none';
  if (s.inLevel) {
    if (s.resultOpen) return back ? 'menu' : 'none';
    if (s.pauseOpen) return back ? 'resume' : 'none';
    return 'pause';
  }
  if (s.titleSubscreenOpen) return 'title';
  return back ? 'quit' : 'none';
}
