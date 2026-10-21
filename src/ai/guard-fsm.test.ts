import { describe, expect, it } from 'vitest';
import { AWARENESS, SEARCH } from '../config/tunables';
import { nextState, type FsmInput, type GuardState } from './guard-fsm';

function input(state: GuardState, over: Partial<FsmInput> = {}): FsmInput {
  return {
    state,
    awareness: 0,
    investigated: false,
    atLkp: false,
    seesPlayer: false,
    searchElapsed: 0,
    searchExhausted: false,
    ...over,
  };
}

const S = AWARENESS.suspicious;
const A = AWARENESS.alert;

describe('nextState', () => {
  it('Patrol stays below the suspicious threshold', () => {
    expect(nextState(input('patrol', { awareness: S - 0.01 }))).toBe('patrol');
  });

  it('Patrol → Suspicious at the threshold', () => {
    expect(nextState(input('patrol', { awareness: S }))).toBe('suspicious');
  });

  it('Patrol → Alert straight away at full awareness', () => {
    expect(nextState(input('patrol', { awareness: A }))).toBe('alert');
  });

  it('Suspicious → Alert at full awareness', () => {
    expect(nextState(input('suspicious', { awareness: A }))).toBe('alert');
  });

  it('Suspicious keeps investigating until done and calm', () => {
    expect(nextState(input('suspicious', { awareness: 10 }))).toBe('suspicious');
    expect(nextState(input('suspicious', { awareness: S + 5, investigated: true }))).toBe(
      'suspicious',
    );
  });

  it('Suspicious → Patrol once investigated and below the threshold', () => {
    expect(nextState(input('suspicious', { awareness: S - 1, investigated: true }))).toBe('patrol');
  });

  it('Alert holds while chasing or while the player is in sight', () => {
    expect(nextState(input('alert', { awareness: 40 }))).toBe('alert');
    expect(nextState(input('alert', { atLkp: true, seesPlayer: true }))).toBe('alert');
  });

  it('Alert → Search on reaching the LKP without seeing the player', () => {
    expect(nextState(input('alert', { awareness: A, atLkp: true }))).toBe('search');
  });

  it('Search continues until it gives up', () => {
    expect(nextState(input('search', { searchElapsed: SEARCH.giveUpS - 0.1 }))).toBe('search');
  });

  it('Search → Patrol after giveUpS or when every cell is visited', () => {
    expect(nextState(input('search', { searchElapsed: SEARCH.giveUpS }))).toBe('patrol');
    expect(nextState(input('search', { searchExhausted: true }))).toBe('patrol');
  });

  it('Search → Alert when the player is found again', () => {
    expect(nextState(input('search', { awareness: A }))).toBe('alert');
  });
});
