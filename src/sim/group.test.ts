import { describe, expect, it } from 'vitest';
import { TRAINING } from '../data/balance';
import * as A from './actions';
import { createGame } from './state';
import type { GameState } from './types';

function act1(): GameState {
  const s = createGame(3);
  s.money = 1000;
  A.payDebt(s);
  s.money = 1e6;
  for (let st = 0; st < 4; st++) A.addUnit(s, 0, st);
  for (let i = 0; i < 4; i++) A.hire(s, 0);
  A.research(s, 'tier');
  return s;
}

describe('actions groupées sur une chaîne : tout ou rien', () => {
  it('moderniser une machine précise, pas la moins moderne', () => {
    const s = act1();
    A.addUnit(s, 0, 1);
    const cost = A.modernizeAtCost(s, 0, 1, 1)!;
    const m0 = s.money;
    expect(A.modernizeAt(s, 0, 1, 1).ok).toBe(true);
    expect(m0 - s.money).toBe(cost);
    expect(s.factories[0].lines[1].slots[1]!.tier).toBe(1);
    expect(s.factories[0].lines[0].slots[1]!.tier).toBe(0);
  });

  it('moderniser la chaîne : toutes ses machines, ou rien si la caisse ne suffit pas', () => {
    const s = act1();
    const t = A.lineModernizeTargets(s, 0, 0);
    expect(t.length).toBe(4);
    const total = t.reduce((a, x) => a + x.cost, 0);
    s.money = total - 1;
    expect(A.modernizeLine(s, 0, 0)).toMatchObject({ ok: false, reason: 'argent' });
    expect(s.factories[0].lines[0].slots.every((m) => m!.tier === 0)).toBe(true);
    s.money = total;
    expect(A.modernizeLine(s, 0, 0).ok).toBe(true);
    expect(s.factories[0].lines[0].slots.every((m) => m!.tier === 1)).toBe(true);
    expect(s.money).toBe(0);
    expect(A.modernizeLine(s, 0, 0)).toMatchObject({ ok: false, reason: 'rien' });
  });

  it('former la chaîne : tous ses titulaires partent ensemble, ou personne', () => {
    const s = act1();
    const g = A.lineTrainees(s, 0, 0);
    expect(g.ws.length).toBe(4);
    s.money = g.cost - 1;
    expect(A.trainLine(s, 0, 0).ok).toBe(false);
    expect(s.workers.some((w) => w.state === 'train')).toBe(false);
    s.money = g.cost;
    expect(A.trainLine(s, 0, 0).ok).toBe(true);
    expect(A.lineCrew(s, 0, 0).every((w) => w.state === 'train')).toBe(true);
    // les polyvalents (Marcel) ne sont pas de la chaîne
    expect(s.workers.find((w) => w.name === 'Marcel')!.state).not.toBe('train');
  });

  it('promouvoir la chaîne : seulement ceux qui ont leurs formations', () => {
    const s = act1();
    const crew = A.lineCrew(s, 0, 0);
    crew[0].trainings = TRAINING.perLevel;
    crew[1].trainings = TRAINING.perLevel;
    expect(A.linePromotees(s, 0, 0).ws.length).toBe(2);
    expect(A.lineTrainees(s, 0, 0).ws.length).toBe(2);
    expect(A.promoteLine(s, 0, 0).ok).toBe(true);
    expect(crew[0].course).toBe('promote');
    expect(crew[2].state).not.toBe('train');
  });
});
