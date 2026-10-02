import { describe, expect, it } from 'vitest';
import { BUFFER_CAP, PROLOGUE } from '../data/balance';
import * as A from './actions';
import { estimateFactory, factoryPlans } from './analysis';
import { advance } from './engine';
import { createGame } from './state';
import type { GameState } from './types';

const GREEN = { red: false };

function sandboxProlog(seed = 7): GameState {
  const s = createGame(seed);
  s.debt = 1e9;
  s.due = 1e9;
  s.money = 1e6;
  return s;
}

/** Bénéfice net mesuré (€/s de jeu) après une mise en route. */
function netRate(setup: (s: GameState) => void, dt = 0.05): number {
  const s = sandboxProlog();
  setup(s);
  advance(s, 120, GREEN, dt);
  const m0 = s.money;
  const t0 = s.t;
  advance(s, 900, GREEN, dt);
  return (s.money - m0) / (s.t - t0);
}

const fourWorkers = (s: GameState) => {
  for (let i = 0; i < 3; i++) A.hire(s, 0);
};
const balancedLine = (s: GameState) => {
  for (let i = 0; i < 8; i++) A.hire(s, 0);
  A.addUnit(s, 0, 0);
  A.addUnit(s, 0, 1);
  A.addUnit(s, 0, 1);
  A.addUnit(s, 0, 2);
  A.addUnit(s, 0, 2);
};

describe('moteur de chaîne (mesures du POC v6.1)', () => {
  it('Marcel seul rapporte environ 0,25 €/s', () => {
    expect(netRate(() => {})).toBeCloseTo(0.25, 1);
  });
  it('quatre ouvriers rapportent environ 0,68 €/s', () => {
    expect(Math.abs(netRate(fourWorkers) - 0.68)).toBeLessThan(0.04);
  });
  it('une ligne équilibrée de 9 ouvriers rapporte environ 2,13 €/s', () => {
    expect(Math.abs(netRate(balancedLine) - 2.13)).toBeLessThan(0.1);
  });
  it("l'atelier manuel au maximum plafonne au marché du quartier", () => {
    const r = netRate((s) => {
      for (let i = 0; i < 15; i++) A.hire(s, 0);
      for (let si = 0; si < 4; si++) {
        for (let k = 0; k < 3; k++) A.addUnit(s, 0, si);
        for (let k = 0; k < 3; k++) A.upgradeTool(s, 0, si);
      }
    });
    // marché 4 €/s en fonte : 1,33 pièce/s × 2,4 € de marge − salaires
    expect(r).toBeGreaterThan(2.6);
    expect(r).toBeLessThan(2.82);
  });
});

describe('déterminisme et pas de temps', () => {
  it('deux parties de même graine donnent le même état', () => {
    const run = () => {
      const s = createGame(42);
      A.hire(s, 0);
      A.hire(s, 0);
      advance(s, 300, GREEN, 0.05);
      A.addUnit(s, 0, 1);
      advance(s, 300, { red: true }, 0.05);
      s.fx = [];
      return JSON.stringify(s);
    };
    expect(run()).toBe(run());
  });
  it('le résultat ne dépend pas de la taille du pas', () => {
    const prod = (dt: number) => {
      const s = sandboxProlog(3);
      for (let i = 0; i < 5; i++) A.hire(s, 0);
      A.addUnit(s, 0, 1);
      advance(s, 600, GREEN, dt);
      return s.stats.produced;
    };
    const ref = prod(0.05);
    expect(Math.abs(prod(0.25) - ref) / ref).toBeLessThan(0.03);
    expect(Math.abs(prod(1) - ref) / ref).toBeLessThan(0.05);
  });
});

describe('goulot lisible', () => {
  it('les pièces s’accumulent devant le poste le plus lent, plafonnées', () => {
    const s = sandboxProlog();
    for (let i = 0; i < 7; i++) A.hire(s, 0);
    // Frappe (3 s) seule et lente : découpe doublée.
    A.addUnit(s, 0, 0);
    A.addUnit(s, 0, 2);
    advance(s, 300, GREEN, 0.05);
    const c = s.chains[0];
    expect(c.buf[1]).toBeGreaterThanOrEqual(BUFFER_CAP - 2);
    expect(c.buf[1]).toBeLessThanOrEqual(BUFFER_CAP);
    expect(c.buf[3]).toBeLessThan(3);
  });
  it('l’estimation identifie le même goulot', () => {
    const s = sandboxProlog();
    for (let i = 0; i < 7; i++) A.hire(s, 0);
    A.addUnit(s, 0, 0);
    A.addUnit(s, 0, 2);
    const est = estimateFactory(s, factoryPlans(s));
    expect(est.chains[0].bottleneck).toBe(1);
  });
});

describe('prologue', () => {
  it("l'échéance dépassée majore la dette de 10 % et accorde 10 minutes", () => {
    const s = createGame(1);
    advance(s, PROLOGUE.due + 1, GREEN, 0.25);
    expect(s.debt).toBe(Math.round(PROLOGUE.debt * 1.1));
    expect(s.due).toBeGreaterThan(PROLOGUE.due + 500);
    expect(s.act).toBe(0);
  });
  it('rembourser la dette ouvre l’acte I', () => {
    const s = createGame(1);
    s.money = 900;
    expect(A.payDebt(s).ok).toBe(true);
    expect(s.debt).toBe(0);
    expect(s.act).toBe(1);
    expect(s.money).toBe(100);
  });
  it('le premier achat utile est possible dès le départ', () => {
    const s = createGame(1);
    expect(A.upgradeTool(s, 0, 3).ok).toBe(true);
  });
});

describe('jamais bloqué', () => {
  it('la maintenance est toujours possible, quitte à s’endetter', () => {
    const s = createGame(1);
    s.act = 2;
    s.research.tier = 1;
    s.money = 1000;
    A.modernize(s, 0, 1);
    s.money = -50;
    s.chains[0].stations[1].units[0].broken = true;
    expect(A.repair(s, 0, 1, 0).ok).toBe(true);
    expect(s.money).toBeLessThan(-50);
  });
  it('sans trésorerie, le réseau coupe mais les machines tournent au plancher', () => {
    const s = createGame(1);
    s.act = 2;
    s.research.tier = 2;
    s.money = 1e5;
    for (let si = 0; si < 4; si++) {
      A.modernize(s, 0, si);
      A.modernize(s, 0, si);
    }
    for (let i = 0; i < 4; i++) A.hire(s, 0);
    for (const w of s.workers) w.level = 3;
    s.money = -1000;
    advance(s, 60, GREEN, 0.05);
    expect(s.energy.cut).toBe(true);
    expect(s.energy.factor).toBeGreaterThanOrEqual(0.3);
    expect(s.stats.produced).toBeGreaterThan(0);
  });
  it('une dette n’empêche pas de produire et de vendre', () => {
    const s = createGame(1);
    s.money = -200;
    A.hire(s, 0);
    advance(s, 300, GREEN, 0.1);
    expect(s.stats.sold).toBeGreaterThan(10);
  });
});

describe('le gaspillage coûte', () => {
  it('une machine en veille consomme 30 % de sa puissance', () => {
    const s = createGame(1);
    s.act = 2;
    s.research.tier = 1;
    s.money = 1e4;
    A.modernize(s, 0, 3);
    s.workers = [];
    advance(s, 10, GREEN, 0.05);
    expect(s.energy.demand).toBeCloseTo(1.5 * 0.3, 3);
  });
  it('une machine en veille s’use lentement', () => {
    const s = createGame(1);
    s.act = 2;
    s.research.tier = 1;
    s.money = 1e4;
    A.modernize(s, 0, 3);
    s.workers = [];
    advance(s, 720, GREEN, 0.5);
    const w = s.chains[0].stations[3].units[0].wear;
    expect(w).toBeCloseTo((720 / 7200) * 0.3, 3);
  });
});

describe('zone rouge', () => {
  it('multiplie l’usure par 5', () => {
    const wear = (red: boolean) => {
      const s = createGame(5);
      s.act = 1;
      s.research.tier = 1;
      s.money = 1e4;
      A.modernize(s, 0, 0);
      for (const w of s.workers) w.level = 2;
      advance(s, 300, { red }, 0.1);
      return s.chains[0].stations[0].units[0].wear;
    };
    expect(wear(true) / wear(false)).toBeGreaterThan(4);
  });
});
