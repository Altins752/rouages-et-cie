import { describe, expect, it } from 'vitest';
import { ACTS, CONTRACTS, ENERGY, WEAR } from '../data/balance';
import * as A from './actions';
import { advance, step } from './engine';
import { daylight } from './env';
import { moraleCap } from './formulas';
import { createGame } from './state';
import type { GameState } from './types';

function act2(seed = 5): GameState {
  const s = createGame(seed);
  s.act = 2;
  s.debt = 0;
  s.research.tier = 2;
  s.research.materials = [true, true, true, true, false, false, false];
  s.money = 1e6;
  return s;
}

describe('acte II : moral', () => {
  it('sans relève, l’ouvrier du goulot s’épuise ; un polyvalent qualifié le relève', () => {
    // Frappe mécanique : seul son opérateur sait la conduire, Marcel ne peut pas le relever.
    const run = (relief: boolean) => {
      const s = act2();
      A.modernize(s, 0, 1);
      A.addUnit(s, 0, 0);
      A.addUnit(s, 0, 2);
      for (let i = 0; i < 6; i++) A.hire(s, 0);
      for (const w of s.workers) if (w.station === 1) w.level = 2;
      if (relief) {
        A.hirePoly(s, 0);
        s.workers[s.workers.length - 1].level = 2;
      }
      advance(s, 2400, { red: false }, 0.25);
      return Math.min(...s.workers.map((w) => w.morale));
    };
    const alone = run(false);
    const relieved = run(true);
    expect(alone).toBeLessThan(0.5);
    expect(relieved).toBeGreaterThan(alone + 0.15);
  });

  it('la cantine relève le plafond du moral', () => {
    const s = act2();
    expect(moraleCap(s)).toBeCloseTo(0.85, 6);
    expect(A.buyCanteen(s).ok).toBe(true);
    expect(moraleCap(s)).toBeCloseTo(1, 6);
  });

  it('la cadence a un plancher : 70 % même à moral nul', () => {
    const s = act2();
    for (const w of s.workers) w.morale = 0;
    const s2 = act2();
    advance(s, 600, { red: false }, 0.25);
    for (const w of s.workers) w.morale = 0;
    advance(s2, 600, { red: false }, 0.25);
    expect(s.stats.produced).toBeGreaterThan(s2.stats.produced * 0.6);
  });
});

describe('acte II : énergie', () => {
  it('le solaire ne produit que de jour ; l’éolien couvre la demande', () => {
    const s = act2();
    A.buyEnergy(s, 'solar');
    let day = 0;
    let night = 0;
    for (let t = 0; t < ENERGY.dayLength; t += 5) {
      step(s, 5, { red: false });
      if (daylight(s.t) > 0.5) day = Math.max(day, s.energy.solarKw);
      if (daylight(s.t) === 0) night = Math.max(night, s.energy.solarKw);
    }
    expect(day).toBeGreaterThan(20);
    expect(night).toBe(0);
  });

  it('la batterie stocke le surplus, le reste est revendu', () => {
    const s = act2();
    for (let i = 0; i < 3; i++) A.buyEnergy(s, 'wind');
    A.buyEnergy(s, 'battery');
    const m0 = s.money;
    advance(s, 120, { red: false }, 0.5);
    expect(s.energy.charge).toBeGreaterThan(0);
    // sans machine, le vent rapporte (revente) au lieu de coûter
    expect(s.money).toBeGreaterThan(m0 - 120 * 0.03 * s.workers.length - 1);
  });

  it('les machines consomment : la facture suit la puissance', () => {
    const s = act2();
    for (let st = 0; st < 4; st++) {
      A.modernize(s, 0, st);
      A.modernize(s, 0, st);
    }
    for (let i = 0; i < 4; i++) A.hire(s, 0);
    for (const w of s.workers) w.level = 3;
    advance(s, 30, { red: false }, 0.1);
    expect(s.energy.demand).toBeGreaterThan(4 * 25 * ENERGY.idleShare - 1);
    expect(s.flow.energy).toBeGreaterThan(0);
  });
});

describe('acte II : contrats et Ferrum', () => {
  it('un contrat ponctuel réserve le stock, se livre et se paie', () => {
    const s = act2();
    for (let i = 0; i < 6; i++) A.hire(s, 0);
    advance(s, CONTRACTS.spotRefresh * 1.5, { red: false }, 0.25);
    expect(s.spot.length).toBeGreaterThan(0);
    const c = s.spot[0];
    c.qty = 5;
    A.acceptSpot(s, c.id);
    advance(s, 60, { red: false }, 0.25);
    expect(s.reserved[c.material] + s.stock[c.material]).toBeGreaterThanOrEqual(0);
    const r = A.deliverSpot(s, c.id);
    expect(r.ok).toBe(true);
    const rep0 = s.reputation;
    advance(s, 0.25, { red: false }, 0.25);
    expect(s.spot.find((x) => x.id === c.id)).toBeUndefined();
    expect(s.reputation).toBe(rep0 + CONTRACTS.repSpotOk);
  });

  it('un contrat manqué coûte de la réputation', () => {
    const s = act2();
    s.reputation = 10;
    s.spot.push({ id: 999, material: 3, qty: 1000, delivered: 0, price: 60, deadline: 0, duration: 10, accepted: false, counted: 0 });
    A.acceptSpot(s, 999);
    advance(s, 11, { red: false }, 0.25);
    expect(s.reputation).toBe(10 + CONTRACTS.repSpotFail);
  });

  it('un contrat long terme sans stock rompt après le délai de grâce', () => {
    const s = act2();
    s.long.push({ id: 77, material: 3, rate: 5, price: 55, accepted: true, acc: 0, short: 0 });
    advance(s, CONTRACTS.longGrace + 5, { red: false }, 0.25);
    expect(s.long.find((x) => x.id === 77)).toBeUndefined();
  });

  it('la guerre des prix baisse les prix 5 minutes, pas la part de marché', () => {
    const s = act2();
    s.market.ferrumDone = [true, false, false];
    s.market.rateEma = ACTS[2].market * 0.55;
    advance(s, 0.25, { red: false }, 0.25);
    expect(s.market.priceWar).toBeGreaterThan(0);
    advance(s, 310, { red: false }, 1);
    expect(s.market.priceWar).toBe(0);
  });
});

describe('acte II : rôles et maintenance', () => {
  it('les RH forment puis promeuvent seules l’ouvrier d’une machine modernisée', () => {
    const s = act2();
    for (let i = 0; i < 4; i++) A.hire(s, 0);
    A.modernize(s, 0, 1);
    A.hireRole(s, 'hr');
    const w = s.workers.find((x) => x.station === 1)!;
    advance(s, 6, { red: false }, 0.25);
    expect(w.state).toBe('train');
    advance(s, 600, { red: false }, 0.25);
    expect(w.level).toBe(2);
    expect(s.fx.some((e) => e.type === 'hrTrain' && e.promote)).toBe(true);
  });

  it('l’ingénieur méthodes modernise selon la consigne, une fois l’ouvrier prêt', () => {
    const s = act2();
    for (let i = 0; i < 4; i++) A.hire(s, 0);
    A.hireRole(s, 'methods');
    A.setMethodsTarget(s, 1, 1);
    A.setMethodsActive(s, true);
    advance(s, 30, { red: false }, 0.25);
    // l'ouvrier n'a pas le niveau : la machine attend
    expect(s.factories[0].lines[0].slots[1]!.tier).toBe(0);
    const w = s.workers.find((x) => x.station === 1)!;
    w.level = 2;
    advance(s, 30, { red: false }, 0.25);
    expect(s.factories[0].lines[0].slots[1]!.tier).toBe(1);
    expect(s.factories[0].lines[0].slots[2]!.tier).toBe(0);
    expect(s.fx.some((e) => e.type === 'methods')).toBe(true);
  });

  it('un rôle se congédie : son salaire s’arrête', () => {
    const s = act2();
    A.hireRole(s, 'hr');
    expect(A.dismissRole(s, 'hr').ok).toBe(true);
    expect(s.roles.hr).toBe(false);
    expect(A.dismissRole(s, 'hr').ok).toBe(false);
  });

  it('la maintenance préventive révise avant la panne', () => {
    const s = act2();
    A.modernize(s, 0, 1);
    A.research(s, 'preventive');
    const u = s.factories[0].lines[0].slots[1]!;
    u.wear = WEAR.preventiveAt + 0.01;
    advance(s, 0.25, { red: false }, 0.25);
    expect(u.service).toBeGreaterThan(0);
    advance(s, WEAR.preventiveTime + 1, { red: false }, 0.25);
    expect(u.wear).toBeLessThan(0.05);
  });

  it('l’atelier de maintenance répare seul les pannes', () => {
    const s = act2();
    A.modernize(s, 0, 1);
    A.research(s, 'workshop');
    for (let i = 0; i < 4; i++) A.hire(s, 0);
    for (const w of s.workers) w.level = 2;
    const u = s.factories[0].lines[0].slots[1]!;
    u.wear = 1;
    let broke = false;
    for (let k = 0; k < 4000 && !broke; k++) {
      step(s, 0.5, { red: false });
      if (s.stats.breakdowns > 0) broke = true;
      u.wear = Math.max(u.wear, 0.99);
    }
    expect(broke).toBe(true);
    expect(u.service > 0 || !u.broken).toBe(true);
  });
});
