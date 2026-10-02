/**
 * Estimations en régime établi (sans simuler) : débit de chaque poste et de chaque
 * chaîne, goulots, profit du site. Sert au contremaître, au superviseur et à l'IA.
 */
import {
  ACTS, BLACK_TIER, CARRY_TIME, ENERGY, MATERIALS, POLY, ROBOT_NO_TECH_FACTOR, ROBOT_TIER, ROLES, SCRAP, TIER_KW,
  TIER_OPERATOR_LEVEL, WEAR,
} from '../data/balance';
import { machineRank, salaryOf } from './engine';
import { knowHow, machineCycle, moraleActive, priceMult, skill, unitPrice } from './formulas';
import type { Factory, GameState, Worker } from './types';

export interface FactoryEstimate {
  /** Pièces bonnes par seconde. */
  x: number;
  /** rate[l][st] : cadence possible du poste (0 si absent, vacant ou non qualifié). */
  rate: number[][];
  /** flow[l][st] : pièces réellement traitées par seconde. */
  flow: number[][];
  /** Capacité totale de chaque type de poste dans l'usine. */
  cap: number[];
  /** Goulot de chaque chaîne (poste le plus lent), -1 si la chaîne ne tourne pas. */
  lineBottleneck: number[];
  /** Poste le plus faible de l'usine. */
  bottleneck: number;
}

function moraleOf(s: GameState, ws: Worker[]): number {
  if (!moraleActive(s) || !ws.length) return 1;
  const m = ws.reduce((a, w) => a + w.morale, 0) / ws.length;
  return 0.7 + 0.3 * Math.max(m, 0.8);
}

/** Cadence d'un poste tenu par un humain (cycle ralenti par le portage sans convoyeur). */
function humanRate(cyc: number, speed: number, conveyor: boolean): number {
  return 1 / (cyc / speed + (conveyor ? 0 : CARRY_TIME));
}

export function estimateFactory(s: GameState, fi: number): FactoryEstimate {
  const f = s.factories[fi];
  const ws = s.workers.filter((w) => w.factory === fi);
  const mor = moraleOf(s, ws);
  const byId = new Map(ws.map((w) => [w.id, w]));
  const tech = ws.some((w) => w.level >= 4);
  const L = f.lines.length;
  const rate = f.lines.map(() => [0, 0, 0, 0]);
  const vacant: { l: number; st: number; cyc: number; req: number; conveyor: boolean }[] = [];
  f.lines.forEach((line, l) => {
    const conveyor = line.conveyor && line.crank >= 0 && !!byId.get(line.crank);
    line.slots.forEach((m, st) => {
      if (!m || m.broken) return;
      const cyc = machineCycle(s, f.material, m.tier, st);
      if (m.tier >= ROBOT_TIER) {
        rate[l][st] = (1 / cyc) * (m.tier >= BLACK_TIER || tech ? 1 : ROBOT_NO_TECH_FACTOR);
        return;
      }
      const req = TIER_OPERATOR_LEVEL[m.tier];
      const w = m.post >= 0 ? byId.get(m.post) : undefined;
      if (w && w.level >= req) rate[l][st] = humanRate(cyc, skill(w) * mor, conveyor);
      else vacant.push({ l, st, cyc, req, conveyor });
    });
  });
  // Les polyvalents tiennent les postes vacants (marche comprise).
  const polys = ws.filter((w) => w.kind === 'poly').sort((a, b) => skill(b) - skill(a));
  if (polys.length && vacant.length) {
    const able = vacant.filter((v) => polys.some((p) => p.level >= v.req));
    const sk = skill(polys[0]) * mor;
    if (polys.length >= able.length) {
      for (const v of able) rate[v.l][v.st] = humanRate(v.cyc, sk * 0.9, v.conveyor);
    } else {
      // Moins de polyvalents que de postes vacants : ils enchaînent les postes par lots,
      // leur temps se partage sur toute la suite de postes vacants.
      const time = able.reduce((a, v) => a + v.cyc / sk + (v.conveyor ? 0 : CARRY_TIME), 0);
      const x = (polys.length * 0.95) / Math.max(1e-6, time);
      for (const v of able) rate[v.l][v.st] = Math.min(x * Math.max(1, able.length / Math.max(1, new Set(able.map((a) => a.st)).size)), humanRate(v.cyc, sk, v.conveyor));
    }
  }
  // Flux : une pièce reste sur sa chaîne, sinon déborde vers les chaînes qui ont le poste suivant.
  const flow = f.lines.map(() => [0, 0, 0, 0]);
  for (let l = 0; l < L; l++) flow[l][0] = f.lines[l].slots[0] ? rate[l][0] : 0;
  for (let st = 1; st < 4; st++) {
    const incoming = new Array(L).fill(0);
    let overflow = 0;
    for (let l = 0; l < L; l++) {
      if (f.lines[l].slots[st]) incoming[l] += flow[l][st - 1];
      else overflow += flow[l][st - 1];
    }
    for (let l = 0; l < L; l++) flow[l][st] = f.lines[l].slots[st] ? Math.min(rate[l][st], incoming[l]) : 0;
    for (let pass = 0; pass < 3 && overflow > 1e-9; pass++) {
      let spare = 0;
      for (let l = 0; l < L; l++) if (f.lines[l].slots[st]) spare += Math.max(0, rate[l][st] - flow[l][st]);
      if (spare <= 1e-9) break;
      const k = Math.min(1, overflow / spare);
      let used = 0;
      for (let l = 0; l < L; l++) {
        if (!f.lines[l].slots[st]) continue;
        const add = Math.max(0, rate[l][st] - flow[l][st]) * k;
        flow[l][st] += add;
        used += add;
      }
      overflow -= used;
    }
  }
  const cap = [0, 1, 2, 3].map((st) => rate.reduce((a, r) => a + r[st], 0));
  let bottleneck = 0;
  for (let st = 1; st < 4; st++) if (cap[st] < cap[bottleneck]) bottleneck = st;
  const lineBottleneck = f.lines.map((line, l) => {
    if (!line.slots.some(Boolean)) return -1;
    let b = -1;
    for (let st = 0; st < 4; st++) {
      if (!line.slots[st]) continue;
      if (b < 0 || rate[l][st] < rate[l][b]) b = st;
    }
    return b;
  });
  let ctl = 0;
  for (const line of f.lines) if (line.slots[3]) ctl = Math.max(ctl, line.slots[3]!.tier);
  const scrap = SCRAP.base * SCRAP.tierFactor[ctl];
  const x = flow.reduce((a, r) => a + r[3], 0) * (1 - scrap);
  return { x, rate, flow, cap, lineBottleneck, bottleneck };
}

export interface SiteEstimate {
  revenue: number;
  raw: number;
  salaries: number;
  energy: number;
  maintenance: number;
  net: number;
  /** Ventes au prix de base (€/s), pour la part de marché. */
  base: number;
  factories: FactoryEstimate[];
}

/** Cache par usine (même objet usine, mêmes ouvriers, même outillage = même estimation). */
export type EstimateCache = Map<Factory, FactoryEstimate>;

export function estimateSite(s: GameState, cache?: EstimateCache): SiteEstimate {
  const act = ACTS[s.act];
  const est = s.factories.map((f, fi) => {
    const hit = cache?.get(f);
    if (hit) return hit;
    const e = estimateFactory(s, fi);
    cache?.set(f, e);
    return e;
  });
  let V = 0;
  s.factories.forEach((f, i) => (V += est[i].x * MATERIALS[f.material].price));
  const fr = V > 0 ? Math.min(1, act.market / V) : 0;
  const mult = priceMult(s);
  let revenue = 0;
  let raw = 0;
  let energy = 0;
  let maintenance = 0;
  const kwSave = 1 - knowHow(s, 'energy');
  s.factories.forEach((f, i) => {
    const e = est[i];
    const q = e.x * fr;
    const m = MATERIALS[f.material];
    revenue += q * m.price * mult;
    raw += q * m.raw;
    f.lines.forEach((line, l) => {
      line.slots.forEach((mc, st) => {
        if (!mc || mc.tier === 0) return;
        const full = e.rate[l][st];
        const occ = full > 0 ? Math.min(1, (e.flow[l][st] * fr) / full) : 0;
        energy += TIER_KW[mc.tier] * kwSave * (ENERGY.idleShare + (1 - ENERGY.idleShare) * occ) * ENERGY.gridPrice;
        maintenance += (unitPrice(mc.tier, st, machineRank(f, l, st)) * WEAR.serviceShare * (0.3 + 0.7 * occ)) / (WEAR.fullLoadTime * 0.5);
      });
    });
  });
  let salaries = 0;
  for (const w of s.workers) salaries += salaryOf(w);
  for (const r of ROLES) if (s.roles[r.id]) salaries += r.salary;
  const net = revenue - raw - salaries - energy - maintenance;
  return { revenue, raw, salaries, energy, maintenance, net, base: V * fr, factories: est };
}

/** Productivité qu'aurait un polyvalent standard (pour les estimations d'embauche). */
export const POLY_SKILL = POLY.productivity;
