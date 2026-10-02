import { describe, expect, it } from 'vitest';
import { ACTS, KNOW_HOW, SANDBOX_ACT } from '../data/balance';
import * as A from './actions';
import { advance } from './engine';
import { knowHowGain, machineCycle } from './formulas';
import { createGame } from './state';

describe('savoir-faire et prestige', () => {
  it('le gain suit ⌊(CA / 10 000)^0,3⌋', () => {
    expect(knowHowGain(0)).toBe(0);
    expect(knowHowGain(9999)).toBe(0);
    expect(knowHowGain(10000)).toBe(1);
    expect(knowHowGain(1e8)).toBe(Math.floor(Math.pow(1e4, 0.3)));
  });

  it('gestes sûrs : +3 % de cadence par niveau, coût croissant', () => {
    const s = createGame(1);
    const c0 = machineCycle(s, 0, 0, 1);
    s.knowHow.points = 3;
    expect(A.buyKnowHow(s, 'cadence').ok).toBe(true);
    expect(A.buyKnowHow(s, 'cadence').ok).toBe(true);
    expect(s.knowHow.points).toBe(0);
    expect(A.buyKnowHow(s, 'cadence').ok).toBe(false);
    const c1 = machineCycle(s, 0, 0, 1);
    expect(c0 / c1).toBeCloseTo(1.06, 6);
  });

  it('chaque branche de l’arbre a un plafond', () => {
    const s = createGame(1);
    s.knowHow.points = 1000;
    for (const d of KNOW_HOW) {
      for (let i = 0; i < d.max; i++) expect(A.buyKnowHow(s, d.id).ok).toBe(true);
      expect(A.buyKnowHow(s, d.id).ok).toBe(false);
    }
  });

  it('bac à sable : marché sans plafond et nouveau site facultatif', () => {
    const s = createGame(1);
    s.act = SANDBOX_ACT;
    s.ended = true;
    s.money = 1e7;
    expect(ACTS[SANDBOX_ACT].goal.kind).toBe('none');
    expect(A.newSite(s).ok).toBe(false); // rien gagné depuis l'arrivée
    for (let i = 0; i < 6; i++) A.hire(s, 0);
    advance(s, 60, { red: false }, 0.5);
    s.stats.revenueAct = 5e6;
    const r = A.newSite(s);
    expect(r.ok).toBe(true);
    expect(s.act).toBe(SANDBOX_ACT);
    expect(s.knowHow.points).toBe(knowHowGain(5e6));
    expect(s.workers.length).toBe(1);
    expect(s.stats.moves).toBe(1);
  });
});
