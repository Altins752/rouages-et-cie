import { describe, expect, it } from 'vitest';
import { BUFFER_CAP, PROLOGUE } from '../data/balance';
import * as A from './actions';
import { estimateFactory } from './analysis';
import { advance, nextLine } from './engine';
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

/** Pièces produites par seconde de jeu après une mise en route. */
function rate(setup: (s: GameState) => void, dt = 0.05): number {
  const s = sandboxProlog();
  setup(s);
  advance(s, 120, GREEN, dt);
  const p0 = s.stats.produced;
  const t0 = s.t;
  advance(s, 900, GREEN, dt);
  return (s.stats.produced - p0) / (s.t - t0);
}

const fourPosts = (s: GameState) => {
  for (let i = 0; i < 4; i++) A.hire(s, 0);
};

describe('chaînes et postes fixes', () => {
  it('la première usine a une chaîne d’établis et trois chaînes vides', () => {
    const s = createGame(1);
    const f = s.factories[0];
    expect(f.lines.length).toBe(4);
    expect(f.lines[0].slots.every((m) => m && m.tier === 0)).toBe(true);
    expect(f.lines.slice(1).every((l) => l.slots.every((m) => m === null))).toBe(true);
    expect(s.workers.map((w) => [w.name, w.kind])).toEqual([['Marcel', 'poly']]);
  });

  it('un ouvrier embauché prend un poste libre et n’en bouge plus', () => {
    const s = sandboxProlog();
    fourPosts(s);
    const posts = s.workers.filter((w) => w.kind === 'post').map((w) => `${w.line}:${w.station}`);
    expect(posts).toEqual(['0:0', '0:1', '0:2', '0:3']);
    expect(A.hire(s, 0).ok).toBe(false); // plus de poste libre
    advance(s, 600, GREEN, 0.1);
    expect(s.workers.filter((w) => w.kind === 'post').map((w) => `${w.line}:${w.station}`)).toEqual(posts);
  });

  it('un poste acheté va à la première chaîne qui ne l’a pas', () => {
    const s = sandboxProlog();
    expect(A.addUnit(s, 0, 1).ok).toBe(true);
    expect(A.addUnit(s, 0, 1).ok).toBe(true);
    const f = s.factories[0];
    expect(f.lines.map((l) => !!l.slots[1])).toEqual([true, true, true, false]);
    A.addUnit(s, 0, 1);
    expect(A.addUnit(s, 0, 1).ok).toBe(false);
  });

  it('licencier libère le poste pour une nouvelle embauche', () => {
    const s = sandboxProlog();
    fourPosts(s);
    const w = s.workers.find((x) => x.station === 2)!;
    expect(A.fire(s, w.id).ok).toBe(true);
    expect(s.factories[0].lines[0].slots[2]!.post).toBe(-1);
    A.hire(s, 0);
    expect(s.workers[s.workers.length - 1].station).toBe(2);
    expect(A.fire(s, s.workers[0].id).ok).toBe(false); // jamais Marcel
  });
});

describe('production', () => {
  it('Marcel seul produit ; une chaîne pourvue produit nettement plus', () => {
    const alone = rate(() => {});
    const four = rate(fourPosts);
    expect(alone).toBeGreaterThan(0.05);
    expect(four).toBeGreaterThan(alone * 2.5);
  });

  it('le convoyeur ne tourne qu’avec un ouvrier à la manivelle', () => {
    const base = rate(fourPosts);
    const idle = rate((s) => {
      fourPosts(s);
      A.buyConveyor(s, 0, 0);
    });
    const cranked = rate((s) => {
      fourPosts(s);
      A.buyConveyor(s, 0, 0);
      expect(A.freePosts(s, 0)[0].kind).toBe('crank');
      A.hire(s, 0);
    });
    expect(idle).toBeCloseTo(base, 2);
    expect(cranked).toBeGreaterThan(base * 1.2);
  });

  it('une chaîne sans poste suivant déverse sa production sur celles qui l’ont', () => {
    const s = sandboxProlog();
    A.addUnit(s, 0, 0);
    A.addUnit(s, 0, 0);
    const f = s.factories[0];
    expect(nextLine(f, 1, 0)).toBe(0);
    expect(nextLine(f, 0, 0)).toBe(0);
    A.addUnit(s, 0, 1);
    // la chaîne 2 n'a pas de frappe : elle alimente la moins chargée des chaînes 0 et 1
    f.lines[0].buf[1] = 4;
    expect(nextLine(f, 2, 0)).toBe(1);
    expect(nextLine(f, 0, 3)).toBe(-2);
  });

  it('les pièces appartiennent à leur chaîne', () => {
    const s = sandboxProlog();
    for (let st = 0; st < 4; st++) A.addUnit(s, 0, st);
    for (let i = 0; i < 8; i++) A.hire(s, 0);
    advance(s, 600, GREEN, 0.05);
    const f = s.factories[0];
    expect(f.lines[0].produced).toBeGreaterThan(20);
    expect(f.lines[1].produced).toBeGreaterThan(20);
    expect(f.lines[0].produced + f.lines[1].produced).toBe(f.produced);
  });
});

describe('déterminisme et pas de temps', () => {
  it('deux parties de même graine donnent le même état', () => {
    const run = () => {
      const s = createGame(42);
      A.hire(s, 0);
      A.hire(s, 0);
      advance(s, 300, GREEN, 0.05);
      A.upgradeTool(s, 0, 1);
      advance(s, 300, { red: true }, 0.05);
      s.fx = [];
      return JSON.stringify(s);
    };
    expect(run()).toBe(run());
  });

  it('le résultat ne dépend pas de la taille du pas', () => {
    const prod = (dt: number) => {
      const s = sandboxProlog(3);
      A.addUnit(s, 0, 1);
      for (let i = 0; i < 5; i++) A.hire(s, 0);
      advance(s, 600, GREEN, dt);
      return s.stats.produced;
    };
    const ref = prod(0.05);
    expect(Math.abs(prod(0.25) - ref) / ref).toBeLessThan(0.05);
    expect(Math.abs(prod(1) - ref) / ref).toBeLessThan(0.08);
  });
});

describe('goulot lisible', () => {
  it('les pièces s’accumulent devant le poste le plus lent, plafonnées', () => {
    const s = sandboxProlog();
    // deux découpes pour une frappe : la frappe (3 s) déborde
    A.addUnit(s, 0, 0);
    for (let i = 0; i < 5; i++) A.hire(s, 0);
    A.buyConveyor(s, 0, 0);
    A.hire(s, 0);
    advance(s, 300, GREEN, 0.05);
    const line = s.factories[0].lines[0];
    expect(line.buf[1]).toBeGreaterThanOrEqual(BUFFER_CAP - 2);
    expect(line.buf[1]).toBeLessThanOrEqual(BUFFER_CAP);
    expect(line.buf[3]).toBeLessThan(3);
  });

  it('l’estimation identifie le même goulot', () => {
    const s = sandboxProlog();
    A.addUnit(s, 0, 0);
    for (let i = 0; i < 5; i++) A.hire(s, 0);
    expect(estimateFactory(s, 0).bottleneck).toBe(1);
  });
});

describe('outillage', () => {
  it('s’applique à toutes les machines du même poste et du même palier', () => {
    const s = sandboxProlog();
    A.addUnit(s, 0, 1);
    const before = rate((x) => {
      A.addUnit(x, 0, 1);
      for (let i = 0; i < 5; i++) A.hire(x, 0);
    });
    const after = rate((x) => {
      A.addUnit(x, 0, 1);
      for (let i = 0; i < 5; i++) A.hire(x, 0);
      for (let k = 0; k < 10; k++) for (let st = 0; st < 4; st++) A.upgradeTool(x, 0, st);
    });
    expect(after).toBeGreaterThan(before * 1.2);
    expect(s.tooling[0][1]).toBe(0);
  });

  it('50 niveaux, au coût croissant', () => {
    const s = sandboxProlog();
    s.money = 1e12;
    const costs: number[] = [];
    for (let k = 0; k < 50; k++) {
      const r = A.upgradeTool(s, 0, 2);
      expect(r.ok).toBe(true);
      costs.push(r.ok ? r.cost! : 0);
    }
    expect(A.upgradeTool(s, 0, 2).ok).toBe(false);
    expect(costs[49]).toBeGreaterThan(costs[0] * 20);
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
    expect(A.hire(s, 0).ok).toBe(true);
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
    s.factories[0].lines[0].slots[1]!.broken = true;
    expect(A.repair(s, 0, 0, 1).ok).toBe(true);
    expect(s.money).toBeLessThan(-50);
  });

  it('un ouvrier dont la machine a été modernisée se forme même à découvert', () => {
    const s = createGame(1);
    s.act = 2;
    s.research.tier = 1;
    s.money = 1000;
    fourPosts(s);
    A.modernize(s, 0, 1);
    s.money = -500;
    const w = s.workers.find((x) => x.station === 1)!;
    expect(A.urgent(s, w)).toBe(true);
    expect(A.train(s, w.id).ok).toBe(true);
    const other = s.workers.find((x) => x.station === 2)!;
    expect(A.train(s, other.id).ok).toBe(false);
  });

  it('sans trésorerie, le réseau coupe mais les machines tournent au plancher', () => {
    const s = createGame(1);
    s.act = 2;
    s.research.tier = 2;
    s.money = 1e5;
    for (let st = 0; st < 4; st++) {
      A.modernize(s, 0, st);
      A.modernize(s, 0, st);
    }
    fourPosts(s);
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
    expect(s.factories[0].lines[0].slots[3]!.wear).toBeCloseTo((720 / 7200) * 0.3, 3);
  });
});

describe('zone rouge', () => {
  it('multiplie l’usure par 5', () => {
    const wear = (red: boolean) => {
      const s = createGame(5);
      s.act = 1;
      s.research.tier = 1;
      s.money = 1e4;
      fourPosts(s);
      A.modernize(s, 0, 0);
      for (const w of s.workers) w.level = 2;
      advance(s, 300, { red }, 0.1);
      return s.factories[0].lines[0].slots[0]!.wear;
    };
    expect(wear(true) / wear(false)).toBeGreaterThan(4);
  });
});
