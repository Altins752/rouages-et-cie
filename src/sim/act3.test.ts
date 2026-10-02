import { describe, expect, it } from 'vitest';
import { ACTS, MATERIALS, PROMOTION } from '../data/balance';
import { storyTick } from '../story/director';
import { REPORT_PERIOD } from '../story/script';
import * as A from './actions';
import { advance } from './engine';
import { materialOk } from './formulas';
import { createGame } from './state';
import type { GameState } from './types';

function act3(seed = 6): GameState {
  const s = createGame(seed);
  s.act = 3;
  s.debt = 0;
  s.research.tier = 3;
  s.research.materials = MATERIALS.map((_, i) => i <= 4);
  s.money = 1e8;
  return s;
}

function robotize(s: GameState, fi = 0): void {
  for (let st = 0; st < 4; st++) while (s.factories[fi].lines[0].slots[st]!.tier < 3) A.modernize(s, fi, st);
}

describe('acte III : robotisation', () => {
  it('les robots tournent sans opérateur, à 50 % sans technicien', () => {
    const produced = (tech: boolean) => {
      const s = act3();
      robotize(s);
      s.workers = [];
      if (tech) {
        A.hirePoly(s, 0);
        s.workers[0].level = 4;
      }
      expect(A.freePosts(s, 0).length).toBe(0);
      advance(s, 300, { red: false }, 0.1);
      return s.stats.produced;
    };
    const without = produced(false);
    const withTech = produced(true);
    expect(without).toBeGreaterThan(100);
    expect(withTech / without).toBeGreaterThan(1.8);
  });

  it('le titane exige le semi-automatique à la frappe et au taraudage', () => {
    const s = act3();
    const f = s.factories[0];
    expect(materialOk(s, f, 4)).toBe(false);
    A.modernize(s, 0, 1);
    A.modernize(s, 0, 1);
    A.modernize(s, 0, 2);
    A.modernize(s, 0, 2);
    expect(materialOk(s, f, 4)).toBe(true);
    // une frappe ajoutée au palier courant le reste
    A.addUnit(s, 0, 1);
    expect(materialOk(s, f, 4)).toBe(true);
  });

  it('promouvoir en technicien compte pour la fin ; licencier aussi', () => {
    const s = act3();
    for (let i = 0; i < 3; i++) A.hire(s, 0);
    const w = s.workers[1];
    w.level = 3;
    w.trainings = 5;
    expect(A.promote(s, w.id).ok).toBe(true);
    advance(s, PROMOTION.time[4] + 1, { red: false }, 0.5);
    expect(w.level).toBe(4);
    expect(s.stats.retrained).toBe(1);
    A.fire(s, s.workers[2].id);
    expect(s.stats.laidOff).toBe(1);
  });

  it('deux fins : chaleureuse si l’on a reconverti, amère si l’on a surtout licencié', () => {
    const end = (laid: number, re: number) => {
      const s = act3();
      s.act = 4;
      s.stats.laidOff = laid;
      s.stats.retrained = re;
      const g = ACTS[4].goal;
      s.money = g.kind === 'cash' ? g.amount + 1 : 0;
      expect(A.buyout(s).ok).toBe(true);
      expect(s.ended).toBe(true);
      expect(s.act).toBe(5);
      return s.ending;
    };
    expect(end(2, 3)).toBe('warm');
    expect(end(12, 2)).toBe('bitter');
  });
});

describe('acte III : rôles support', () => {
  it('la logistique livre seule les contrats ponctuels', () => {
    const s = act3();
    A.hireRole(s, 'logistics');
    s.stock[0] = 50;
    s.spot.push({ id: 501, material: 0, qty: 20, delivered: 0, price: 3, deadline: 0, duration: 120, accepted: false, counted: 0 });
    A.acceptSpot(s, 501);
    advance(s, 0.5, { red: false }, 0.25);
    expect(s.spot.find((c) => c.id === 501)).toBeUndefined();
    expect(s.stats.contractsDone).toBe(1);
  });

  it('le commercial signe seul les contrats long terme tenables', () => {
    const s = act3();
    A.hireRole(s, 'sales');
    s.market.prodRate[0] = 100;
    s.long.push({ id: 601, material: 0, rate: 10, price: 3.5, accepted: false, acc: 0, short: 0 });
    s.long.push({ id: 602, material: 0, rate: 500, price: 3.5, accepted: false, acc: 0, short: 0 });
    advance(s, 0.25, { red: false }, 0.25);
    expect(s.long.find((c) => c.id === 601)?.accepted).toBe(true);
    expect(s.long.find((c) => c.id === 602)?.accepted).toBe(false);
  });

  it('le contrôleur de gestion envoie un rapport périodique', () => {
    const s = act3();
    A.hireRole(s, 'controller');
    storyTick(s);
    advance(s, REPORT_PERIOD + 1, { red: false }, 1);
    const out = storyTick(s);
    expect(out.msgs.some((m) => m.from === 'Contrôle de gestion')).toBe(true);
  });
});
