// Guard state machine: Patrol → Suspicious → Alert → Search → Patrol, driven by the awareness gauge.
// `nextState` is a pure transition function; the per-state behaviour lives in guard.ts.

import { AWARENESS, SEARCH } from '../config/tunables';

export type GuardState = 'patrol' | 'suspicious' | 'alert' | 'search';

export interface FsmInput {
  state: GuardState;
  awareness: number;
  /** Suspicious: reached the stimulus point (or it is unreachable) and finished looking around. */
  investigated: boolean;
  /** Alert: reached the LKP (or it is unreachable). */
  atLkp: boolean;
  /** The guard can see the player this step. */
  seesPlayer: boolean;
  /** Search: seconds since the search started. */
  searchElapsed: number;
  /** Search: every chosen cell has been visited. */
  searchExhausted: boolean;
}

export function nextState(i: FsmInput): GuardState {
  if (i.state !== 'alert' && i.awareness >= AWARENESS.alert) return 'alert';
  switch (i.state) {
    case 'patrol':
      return i.awareness >= AWARENESS.suspicious ? 'suspicious' : 'patrol';
    case 'suspicious':
      return i.investigated && i.awareness < AWARENESS.suspicious ? 'patrol' : 'suspicious';
    case 'alert':
      return i.atLkp && !i.seesPlayer ? 'search' : 'alert';
    case 'search':
      return i.searchExhausted || i.searchElapsed >= SEARCH.giveUpS ? 'patrol' : 'search';
  }
}
