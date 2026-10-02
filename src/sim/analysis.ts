/**
 * Estimations en régime établi (sans simuler) : débit d'une chaîne, goulot,
 * profit de l'usine. Sert au contremaître, au superviseur et à l'IA du simulateur.
 */
import {
  ACTS, BLACK_TIER, ENERGY, MATERIALS, ROBOT_NO_TECH_FACTOR, ROBOT_TIER, ROLES, SCRAP, TIER_KW,
  TIER_OPERATOR_LEVEL, WALK_TIME, WEAR, WORKER_SALARY,
} from '../data/balance';
import { knowHow, moraleActive, priceMult, stationCycle, unitPrice } from './formulas';
import type { Chain, GameState } from './types';

export interface ChainPlan {
  material: number;
  tiers: number[];
  units: number[];
  tools: number[];
  /** Niveaux des ouvriers disponibles (hors formation). */
  levels: number[];
}

export function planOf(s: GameState, ci: number, includeTraining = true): ChainPlan {
  const c = s.chains[ci];
  return {
    material: c.material,
    tiers: c.stations.map((st) => st.tier),
    units: c.stations.map((st) => st.units.filter((u) => !u.broken || u.service > 0).length),
    tools: c.stations.map((st) => st.tool),
    levels: s.workers
      .filter((w) => w.chain === ci && (includeTraining || w.state !== 'train'))
      .map((w) => (w.state === 'train' ? w.trainTo : w.level)),
  };
}

export function clonePlan(p: ChainPlan): ChainPlan {
  return { material: p.material, tiers: [...p.tiers], units: [...p.units], tools: [...p.tools], levels: [...p.levels] };
}

export interface ChainEstimate {
  /** Pièces bonnes par seconde. */
  x: number;
  caps: number[];
  ops: number[];
  bottleneck: number;
  cycles: number[];
}

function efficiency(s: GameState): number {
  return (moraleActive(s) ? 0.94 : 1) * 1.04;
}

export function estimateChain(s: GameState, p: ChainPlan): ChainEstimate {
  const cyc = p.tiers.map((t, si) => stationCycle(s, { material: p.material }, { tier: t, tool: p.tools[si] }, si));
  const req = p.tiers.map((t) => TIER_OPERATOR_LEVEL[t]);
  const human = [0, 1, 2, 3].filter((si) => p.tiers[si] < ROBOT_TIER && p.units[si] > 0);
  const eff = efficiency(s);
  const tech = p.levels.some((l) => l >= 4);
  const caps = [0, 0, 0, 0];
  const ops = [0, 0, 0, 0];
  for (let si = 0; si < 4; si++) {
    if (p.tiers[si] >= ROBOT_TIER) {
      const f = p.tiers[si] >= BLACK_TIER || tech ? 1 : ROBOT_NO_TECH_FACTOR;
      caps[si] = (p.units[si] / cyc[si]) * f;
    }
  }
  const pool = [...p.levels].sort((a, b) => a - b);
  const order = [...human].sort((a, b) => req[b] - req[a] || cyc[b] - cyc[a]);
  const take = (si: number): boolean => {
    const k = pool.findIndex((l) => l >= req[si]);
    if (k < 0) return false;
    pool.splice(k, 1);
    ops[si]++;
    return true;
  };
  let covered = true;
  for (const si of order) if (!take(si)) covered = false;
  let x: number;
  if (!covered) {
    // Ouvriers polyvalents : chacun enchaîne les postes par lots (la marche s'amortit),
    // mais à plusieurs ils se gênent.
    const maxReq = Math.max(...human.map((si) => req[si]));
    const able = p.levels.filter((l) => l >= maxReq).length;
    const T = human.reduce((a, si) => a + cyc[si], 0) + WALK_TIME * human.length * 0.05;
    const robotCap = Math.min(...[0, 1, 2, 3].filter((si) => !human.includes(si)).map((si) => caps[si]), Infinity);
    x = Math.min(((able * eff) / T) * (able > 1 ? 0.77 : 1), robotCap);
    for (const si of human) caps[si] = x;
    if (p.units.some((u) => u === 0)) x = 0;
  } else {
    let guard = 0;
    while (pool.length && guard++ < 64) {
      let best = -1;
      let bv = Infinity;
      for (const si of order) {
        if (ops[si] >= p.units[si]) continue;
        if (!pool.some((l) => l >= req[si])) continue;
        const v = ops[si] / cyc[si];
        if (v < bv) {
          bv = v;
          best = si;
        }
      }
      if (best < 0 || !take(best)) break;
    }
    for (const si of human) caps[si] = (ops[si] / cyc[si]) * eff;
    x = Math.min(caps[0], caps[1], caps[2], caps[3]);
    // Un seul ouvrier par poste qui couvre plusieurs postes : marche.
    if (human.length > 0 && p.levels.length < human.length) x *= 0.85;
  }
  let bottleneck = 0;
  for (let si = 1; si < 4; si++) if (caps[si] < caps[bottleneck]) bottleneck = si;
  const scrap = SCRAP.base * SCRAP.tierFactor[p.tiers[3]];
  return { x: x * (1 - scrap), caps, ops, bottleneck, cycles: cyc };
}

/** Capacité de chaque poste d'une chaîne réelle (unités en service ÷ cycle). */
export function stationCapacities(s: GameState, c: Chain): number[] {
  return c.stations.map((st, si) => {
    const ok = st.units.filter((u) => !u.broken && u.service <= 0).length;
    return ok / stationCycle(s, c, st, si);
  });
}

export function bottleneckOf(s: GameState, c: Chain): number {
  const caps = stationCapacities(s, c);
  let b = 0;
  for (let si = 1; si < 4; si++) if (caps[si] < caps[b]) b = si;
  return b;
}

export interface FactoryEstimate {
  revenue: number;
  raw: number;
  salaries: number;
  energy: number;
  maintenance: number;
  net: number;
  /** Ventes au prix de base (€/s), pour la part de marché. */
  base: number;
  chains: ChainEstimate[];
}

export function estimateFactory(s: GameState, plans: ChainPlan[], roles = s.roles): FactoryEstimate {
  const act = ACTS[s.act];
  const est = plans.map((p) => estimateChain(s, p));
  let V = 0;
  plans.forEach((p, i) => (V += est[i].x * MATERIALS[p.material].price));
  const f = V > 0 ? Math.min(1, act.market / V) : 0;
  const mult = priceMult(s);
  let revenue = 0;
  let raw = 0;
  let salaries = 0;
  let energy = 0;
  let maintenance = 0;
  const kwSave = 1 - knowHow(s, 'energy');
  plans.forEach((p, i) => {
    const e = est[i];
    const q = e.x * f;
    const m = MATERIALS[p.material];
    revenue += q * m.price * mult;
    raw += q * m.raw;
    for (const l of p.levels) salaries += WORKER_SALARY[l];
    for (let si = 0; si < 4; si++) {
      const t = p.tiers[si];
      if (t === 0) continue;
      const full = p.units[si] / e.cycles[si];
      const occ = full > 0 ? Math.min(1, q / full) : 0;
      energy += TIER_KW[t] * kwSave * p.units[si] * (ENERGY.idleShare + (1 - ENERGY.idleShare) * occ) * ENERGY.gridPrice;
      for (let n = 1; n <= p.units[si]; n++) {
        maintenance += (unitPrice(t, si, n) * WEAR.serviceShare * (0.3 + 0.7 * occ)) / (WEAR.fullLoadTime * 0.5);
      }
    }
  });
  for (const r of ROLES) if (roles[r.id]) salaries += r.salary;
  const net = revenue - raw - salaries - energy - maintenance;
  return { revenue, raw, salaries, energy, maintenance, net, base: V * f, chains: est };
}

export function factoryPlans(s: GameState): ChainPlan[] {
  return s.chains.map((_, i) => planOf(s, i));
}
