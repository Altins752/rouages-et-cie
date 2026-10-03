import { describe, expect, it } from 'vitest';
import { CHALLENGE_CAPITAL } from '../data/balance';
import * as A from './actions';
import { advance } from './engine';
import { createGame } from './state';
import type { GameState } from './types';

function sandbox(): GameState {
  const s = createGame(8);
  s.act = 5;
  s.ended = true;
  s.debt = 0;
  s.research.tier = 4;
  s.research.materials = [true, true, true, true, true, true, true];
  s.money = 1e9;
  return s;
}

describe('défis du bac à sable', () => {
  it('repartent d’un site presque vide, recherches gardées', () => {
    const s = sandbox();
    expect(A.startChallenge(s, 'chrono').ok).toBe(true);
    expect(s.money).toBe(CHALLENGE_CAPITAL);
    expect(s.factories.length).toBe(1);
    expect(s.research.tier).toBe(4);
    expect(A.startChallenge(s, 'nofire').ok).toBe(false);
  });

  it('sans licencier : impossible de renvoyer quelqu’un', () => {
    const s = sandbox();
    A.startChallenge(s, 'nofire');
    A.hire(s, 0);
    expect(A.fire(s, s.workers[1].id).ok).toBe(false);
    A.abandonChallenge(s);
    expect(A.fire(s, s.workers[1].id).ok).toBe(true);
  });

  it('l’artisan : pas de machine au-delà du mécanique', () => {
    const s = sandbox();
    A.startChallenge(s, 'artisan');
    s.money = 1e5;
    expect(A.modernize(s, 0, 1).ok).toBe(true);
    expect(A.modernize(s, 0, 1).ok).toBe(false);
    expect(A.tierAllowed(s, 2)).toBe(false);
  });

  it('se gagne à l’objectif, se perd au temps', () => {
    const s = sandbox();
    A.startChallenge(s, 'artisan');
    s.money = 2e6;
    advance(s, 1, { red: false }, 0.25);
    expect(s.challenge!.state).toBe('won');
    expect(s.milestones['challenge-artisan']).toBe(true);
    const t = sandbox();
    A.startChallenge(t, 'chrono');
    advance(t, 1801, { red: false }, 1);
    expect(t.challenge!.state).toBe('lost');
  });
});
