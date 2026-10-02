import { describe, expect, it } from 'vitest';
import { ACTS, PROMOTION, RESALE, TRAINING, UNIT_PRICE } from '../data/balance';
import * as A from './actions';
import { advance } from './engine';
import { skill, trainingTime } from './formulas';
import { createGame } from './state';
import type { GameState } from './types';

function act1(seed = 3): GameState {
  const s = createGame(seed);
  s.money = 1000;
  A.payDebt(s);
  s.money = 1e5;
  return s;
}

const staff = (s: GameState) => {
  for (let i = 0; i < 4; i++) A.hire(s, 0);
};

describe('acte I : modernisation machine par machine', () => {
  it('moderniser exige la recherche, ne touche qu’une machine et revend l’établi à 25 %', () => {
    const s = act1();
    A.addUnit(s, 0, 1);
    expect(A.modernize(s, 0, 1).ok).toBe(false);
    A.research(s, 'tier');
    const m0 = s.money;
    expect(A.modernize(s, 0, 1).ok).toBe(true);
    expect(m0 - s.money).toBe(Math.round(UNIT_PRICE[1][1] - RESALE * UNIT_PRICE[0][1]));
    const f = s.factories[0];
    expect(f.lines[0].slots[1]!.tier).toBe(1);
    expect(f.lines[1].slots[1]!.tier).toBe(0);
    // la suivante est celle de la chaîne 2
    expect(A.modernizeTarget(s, 0, 1)!.line).toBe(1);
  });

  it('le semi-automatique attend l’acte II', () => {
    const s = act1();
    A.research(s, 'tier');
    expect(A.researchAvailable(s, 'tier')).toBe(false);
  });

  it('une machine modernisée attend que son ouvrier soit promu', () => {
    const s = act1();
    A.research(s, 'tier');
    staff(s);
    A.modernize(s, 0, 1);
    expect(A.unqualified(s, 0).map((w) => w.station)).toEqual([1]);
    const p0 = s.stats.produced;
    advance(s, 120, { red: false }, 0.1);
    expect(s.stats.produced - p0).toBe(0);
    expect(s.factories[0].lines[0].buf[1]).toBeGreaterThan(0);
  });
});

describe('acte I : formation et promotion', () => {
  it('chaque formation rend l’ouvrier plus productif', () => {
    const s = act1();
    staff(s);
    const w = s.workers[1];
    const k0 = skill(w);
    const m0 = s.money;
    expect(A.train(s, w.id).ok).toBe(true);
    expect(m0 - s.money).toBe(TRAINING.cost[1]);
    expect(w.state).toBe('train');
    advance(s, trainingTime(s, w) + 0.5, { red: false }, 0.1);
    expect(w.state).not.toBe('train');
    expect(w.trainings).toBe(1);
    expect(skill(w)).toBeCloseTo(k0 * (1 + TRAINING.perTraining), 6);
  });

  it('après 5 formations, la promotion fait passer au niveau supérieur', () => {
    const s = act1();
    A.research(s, 'tier');
    staff(s);
    A.modernize(s, 0, 1);
    const w = s.workers.find((x) => x.station === 1)!;
    expect(A.promote(s, w.id).ok).toBe(false);
    for (let k = 0; k < TRAINING.perLevel; k++) {
      expect(A.train(s, w.id).ok).toBe(true);
      advance(s, 60, { red: false }, 0.1);
    }
    expect(A.train(s, w.id).ok).toBe(false);
    expect(A.promote(s, w.id).ok).toBe(true);
    advance(s, PROMOTION.time[2] + 1, { red: false }, 0.1);
    expect(w.level).toBe(2);
    expect(w.trainings).toBe(0);
    expect(w.trained).toBe(TRAINING.perLevel);
    expect(w.station).toBe(1);
    const p0 = s.stats.produced;
    advance(s, 120, { red: false }, 0.1);
    expect(s.stats.produced - p0).toBeGreaterThan(10);
  });

  it('le polyvalent coûte moins et produit moins', () => {
    const s = act1();
    expect(A.hirePoly(s, 0).ok).toBe(true);
    const p = s.workers[s.workers.length - 1];
    A.hire(s, 0);
    const q = s.workers[s.workers.length - 1];
    expect(p.kind).toBe('poly');
    expect(q.kind).toBe('post');
    expect(skill(p)).toBeLessThan(skill(q));
  });

  it('le contremaître ne fait pas perdre de cadence et pourvoit d’abord le poste le plus lent', () => {
    const s = act1();
    A.hireRole(s, 'foreman');
    const order = A.freePosts(s, 0).map((p) => p.station);
    // la frappe (le plus long cycle) d'abord, le contrôle en dernier
    expect(order[0]).toBe(1);
    expect(order[order.length - 1]).toBe(3);
  });
});

describe('acte I : marché de la ville et Ferrum', () => {
  it('à 30 % de part, Ferrum débauche un ouvrier (jamais Marcel)', () => {
    const s = act1();
    staff(s);
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

  it('deux usines au plus en acte I ; la nouvelle copie les machines de la meilleure, sans ouvriers', () => {
    const s = act1();
    A.research(s, 'tier');
    A.modernize(s, 0, 1);
    A.addUnit(s, 0, 0);
    A.buyConveyor(s, 0, 0);
    staff(s);
    const n = s.workers.length;
    expect(A.buyFactory(s).ok).toBe(true);
    const f = s.factories[1];
    expect(f.lines[0].slots[1]!.tier).toBe(1);
    expect(!!f.lines[1].slots[0]).toBe(true);
    expect(f.lines[0].conveyor).toBe(true);
    expect(f.lines[0].crank).toBe(-1);
    expect(s.workers.length).toBe(n);
    expect(A.buyFactory(s).ok).toBe(false);
  });

  it('déménager : savoir-faire, capital, recherches et outillage gardés, site neuf', () => {
    const s = act1();
    A.research(s, 'tier');
    A.research(s, 'mat:1');
    for (let st = 0; st < 4; st++) A.modernize(s, 0, st);
    A.upgradeTool(s, 1, 2);
    A.hireRole(s, 'foreman');
    staff(s);
    s.stats.revenueAct = 2e6;
    s.market.goalReached = true;
    const cap = A.moveCapital(s);
    const r = A.move(s);
    expect(r.ok).toBe(true);
    expect(s.act).toBe(2);
    expect(s.knowHow.points).toBe(Math.floor(Math.pow(2e6 / 1e4, 0.3)));
    expect(s.money).toBe(cap);
    expect(s.factories.length).toBe(1);
    expect(s.factories[0].lines[0].slots.every((m) => m!.tier === 0)).toBe(true);
    expect(s.workers.map((w) => w.name)).toEqual(['Marcel']);
    expect(s.research.tier).toBe(1);
    expect(s.research.materials[1]).toBe(true);
    expect(s.tooling[1][2]).toBe(1);
    expect(s.roles.foreman).toBe(false);
  });
});
