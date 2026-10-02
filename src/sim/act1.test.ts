import { describe, expect, it } from 'vitest';
import { ACTS, RESALE, TRAIN_TIME, UNIT_PRICE, UNIT_GROWTH } from '../data/balance';
import * as A from './actions';
import { advance } from './engine';
import { createGame } from './state';
import type { GameState } from './types';

function act1(seed = 3): GameState {
  const s = createGame(seed);
  s.money = 1000;
  A.payDebt(s);
  s.money = 1e5;
  return s;
}

describe('acte I : technologie et qualification', () => {
  it('moderniser exige la recherche et revend les établis à 25 %', () => {
    const s = act1();
    A.addUnit(s, 0, 1);
    expect(A.modernize(s, 0, 1).ok).toBe(false);
    A.research(s, 'tier');
    const m0 = s.money;
    expect(A.modernize(s, 0, 1).ok).toBe(true);
    const expected = UNIT_PRICE[1][1] + UNIT_PRICE[1][1] * UNIT_GROWTH - RESALE * (UNIT_PRICE[0][1] + UNIT_PRICE[0][1] * UNIT_GROWTH);
    expect(m0 - s.money).toBeCloseTo(Math.round(expected), 0);
    const st = s.chains[0].stations[1];
    expect(st.tier).toBe(1);
    expect(st.units.length).toBe(2);
    expect(st.tool).toBe(0);
  });

  it('le semi-automatique attend l’acte II', () => {
    const s = act1();
    A.research(s, 'tier');
    expect(A.researchAvailable(s, 'tier')).toBe(false);
  });

  it('une machine sans opérateur formé reste à l’arrêt', () => {
    const s = act1();
    A.research(s, 'tier');
    A.modernize(s, 0, 1);
    for (let i = 0; i < 3; i++) A.hire(s, 0);
    advance(s, 120, { red: false }, 0.1);
    expect(s.stats.produced).toBe(0);
    expect(s.chains[0].buf[1]).toBeGreaterThan(0);
  });

  it('former un opérateur prend 30 s ; il revient conduire la machine', () => {
    const s = act1();
    A.research(s, 'tier');
    A.modernize(s, 0, 1);
    for (let i = 0; i < 3; i++) A.hire(s, 0);
    const m0 = s.money;
    expect(A.train(s, 0, 2).ok).toBe(true);
    expect(m0 - s.money).toBe(100);
    expect(s.workers.filter((w) => w.state === 'train').length).toBe(1);
    advance(s, TRAIN_TIME[2] + 1, { red: false }, 0.1);
    expect(s.workers.some((w) => w.level === 2 && w.state !== 'train')).toBe(true);
    advance(s, 120, { red: false }, 0.1);
    expect(s.stats.produced).toBeGreaterThan(10);
  });

  it('le contremaître fait gagner de la cadence à une ligne chargée', () => {
    const run = (foreman: boolean) => {
      const s = act1(8);
      for (let i = 0; i < 8; i++) A.hire(s, 0);
      A.addUnit(s, 0, 0);
      A.addUnit(s, 0, 1);
      A.addUnit(s, 0, 1);
      A.addUnit(s, 0, 2);
      A.addUnit(s, 0, 2);
      if (foreman) A.hireRole(s, 'foreman');
      advance(s, 900, { red: false }, 0.1);
      return s.stats.produced;
    };
    expect(run(true)).toBeGreaterThanOrEqual(run(false) * 0.98);
  });
});

describe('acte I : marché de la ville et Ferrum', () => {
  it('à 30 % de part, Ferrum débauche un ouvrier (jamais Marcel)', () => {
    const s = act1();
    for (let i = 0; i < 4; i++) A.hire(s, 0);
    s.market.rateEma = ACTS[1].market * 0.31;
    const n = s.workers.length;
    advance(s, 0.1, { red: false }, 0.1);
    s.market.rateEma = ACTS[1].market * 0.31;
    advance(s, 0.1, { red: false }, 0.1);
    expect(s.workers.length).toBe(n - 1);
    expect(s.workers.some((w) => w.name === 'Marcel')).toBe(true);
    expect(s.fx.some((e) => e.type === 'ferrum')).toBe(true);
  });

  it('l’objectif exige 50 % tenus 30 s, puis le déménagement devient possible', () => {
    const s = act1();
    expect(A.canMove(s)).toBe(false);
    for (let k = 0; k < 400; k++) {
      s.market.rateEma = ACTS[1].market * 0.6;
      advance(s, 0.1, { red: false }, 0.1);
    }
    expect(s.market.goalReached).toBe(true);
    expect(A.canMove(s)).toBe(true);
  });

  it('deux chaînes au plus en acte I ; la nouvelle copie la meilleure', () => {
    const s = act1();
    A.research(s, 'tier');
    A.modernize(s, 0, 1);
    A.upgradeTool(s, 0, 2);
    expect(A.buyChain(s).ok).toBe(true);
    expect(s.chains[1].stations[1].tier).toBe(1);
    expect(s.chains[1].stations[2].tool).toBe(1);
    expect(A.buyChain(s).ok).toBe(false);
  });

  it('déménager : savoir-faire, capital, recherches gardées, site neuf', () => {
    const s = act1();
    A.research(s, 'tier');
    A.research(s, 'mat:1');
    for (let si = 0; si < 4; si++) A.modernize(s, 0, si);
    A.hireRole(s, 'foreman');
    s.stats.revenueAct = 2e6;
    s.market.goalReached = true;
    const cap = A.moveCapital(s);
    const r = A.move(s);
    expect(r.ok).toBe(true);
    expect(s.act).toBe(2);
    expect(s.knowHow.points).toBe(Math.floor(Math.pow(2e6 / 1e4, 0.3)));
    expect(s.money).toBe(cap);
    expect(s.chains.length).toBe(1);
    expect(s.chains[0].stations.every((st) => st.tier === 0)).toBe(true);
    expect(s.workers.map((w) => w.name)).toEqual(['Marcel']);
    expect(s.research.tier).toBe(1);
    expect(s.research.materials[1]).toBe(true);
    expect(s.roles.foreman).toBe(false);
  });
});
