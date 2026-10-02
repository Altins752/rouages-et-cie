/**
 * Conseiller : propose des plans d'achat et leur temps de retour estimé.
 * Un plan peut compter plusieurs étapes (équilibrer une chaîne, la moderniser
 * entièrement) ; on n'exécute que la première, puis on réévalue.
 * Utilisé par le superviseur de chaîne (recommandations) et l'IA du simulateur.
 */
import { MATERIALS, MAX_UNITS, MAX_WORKERS_PER_CHAIN, ROBOT_TIER, TIER_OPERATOR_LEVEL, TOOL_MAX } from '../data/balance';
import { bestChainIndex, maxChains, tierAllowed, trainCost } from './actions';
import { clonePlan, estimateChain, estimateFactory, factoryPlans } from './analysis';
import type { ChainPlan } from './analysis';
import { materialOk, modernizeCost, newChainCost, toolCost, unitPrice } from './formulas';
import type { GameState } from './types';

export type StepKind = 'hire' | 'unit' | 'tool' | 'modernize' | 'material' | 'chain';

export interface PlanStep {
  kind: StepKind;
  chain: number;
  station: number;
  material: number;
  cost: number;
}

export interface Candidate {
  kind: 'hire' | 'unit' | 'tool' | 'modernize' | 'material' | 'chain' | 'balance' | 'upgrade';
  chain: number;
  steps: PlanStep[];
  cost: number;
  gain: number;
  payback: number;
}

/** Coût cumulé de formation d'un manœuvre jusqu'au niveau `level`. */
function trainUpTo(s: GameState, level: number): number {
  let c = 0;
  for (let l = 2; l <= level; l++) c += trainCost(s, l);
  return c;
}

function humanUnits(p: ChainPlan): number {
  let n = 0;
  for (let si = 0; si < 4; si++) if (p.tiers[si] < ROBOT_TIER) n += p.units[si];
  return n;
}

function requiredOps(p: ChainPlan, req: number): number {
  let n = 0;
  for (let si = 0; si < 4; si++) if (p.tiers[si] < ROBOT_TIER && TIER_OPERATOR_LEVEL[p.tiers[si]] >= req) n += p.units[si];
  return n;
}

/**
 * Complète l'équipe du plan : un opérateur qualifié par unité humaine, un technicien
 * si robots. Former un ouvrier ne lui retire pas ses compétences : on forme si
 * l'équipe est assez nombreuse, sinon on embauche.
 */
function staffPlan(s: GameState, p: ChainPlan): number {
  let cost = 0;
  const robot = p.tiers.some((t) => t === ROBOT_TIER);
  const bodies = humanUnits(p) + (robot ? 1 : 0);
  for (const req of robot ? [4, 3, 2, 1] : [3, 2, 1]) {
    const need = req === 4 ? 1 : requiredOps(p, req);
    let have = p.levels.filter((l) => l >= req).length;
    while (have < need) {
      let k = -1;
      for (let i = 0; i < p.levels.length; i++) if (p.levels[i] < req && (k < 0 || p.levels[i] > p.levels[k])) k = i;
      if (k >= 0 && p.levels.length >= bodies) {
        cost += trainUpTo(s, req) - trainUpTo(s, p.levels[k]);
        p.levels[k] = req;
      } else {
        cost += trainUpTo(s, req);
        p.levels.push(req);
      }
      have++;
    }
  }
  return cost;
}

function bestMaterial(s: GameState, p: ChainPlan, others: ChainPlan[], ci: number): number {
  let best = p.material;
  let bv = -Infinity;
  for (let m = 0; m < MATERIALS.length; m++) {
    if (!s.research.materials[m]) continue;
    if (p.tiers[1] < MATERIALS[m].minTier || p.tiers[2] < MATERIALS[m].minTier) continue;
    const np = { ...p, material: m };
    const v = estimateFactory(s, others.map((x, i) => (i === ci ? np : x))).net;
    if (v > bv) {
      bv = v;
      best = m;
    }
  }
  return best;
}

/** Ajoute des unités au poste le plus faible jusqu'à dépasser `target` pièces/s. */
function balancePlan(s: GameState, p: ChainPlan, target: number, ci: number, steps: PlanStep[]): number | null {
  let cost = 0;
  for (let k = 0; k < 16; k++) {
    const e = estimateChain(s, p);
    if (e.x >= target) return cost;
    // capacité brute de chaque poste
    const raw = [0, 1, 2, 3].map((si) => p.units[si] / e.cycles[si]);
    let si = 0;
    for (let j = 1; j < 4; j++) if (raw[j] < raw[si]) si = j;
    if (p.units[si] >= MAX_UNITS) {
      // goulot plein : outillage
      if (p.tools[si] < TOOL_MAX) {
        const c = toolCost(p.tiers[si], si, p.tools[si]);
        p.tools[si]++;
        cost += c;
        steps.push({ kind: 'tool', chain: ci, station: si, material: p.material, cost: c });
        continue;
      }
      return null;
    }
    const c = unitPrice(p.tiers[si], si, p.units[si] + 1);
    p.units[si]++;
    cost += c;
    steps.push({ kind: 'unit', chain: ci, station: si, material: p.material, cost: c });
    const sc = staffPlan(s, p);
    cost += sc;
    if (sc > 0) steps.push({ kind: 'hire', chain: ci, station: -1, material: p.material, cost: sc });
  }
  return estimateChain(s, p).x >= target ? cost : null;
}

export function candidates(s: GameState): Candidate[] {
  const plans = factoryPlans(s);
  const base = estimateFactory(s, plans).net;
  const out: Candidate[] = [];
  const push = (kind: Candidate['kind'], chain: number, ps: ChainPlan[], steps: PlanStep[], cost: number) => {
    if (!steps.length) return;
    const gain = estimateFactory(s, ps).net - base;
    if (gain <= 1e-6) return;
    out.push({ kind, chain, steps, cost: Math.max(cost, 0.01), gain, payback: Math.max(cost, 0.01) / gain });
  };
  plans.forEach((p, ci) => {
    const swap = (np: ChainPlan) => plans.map((x, i) => (i === ci ? np : x));
    const cur = estimateChain(s, p).x;
    // Embaucher un manœuvre
    if (p.levels.length < MAX_WORKERS_PER_CHAIN) {
      const np = clonePlan(p);
      np.levels.push(1);
      push('hire', ci, swap(np), [{ kind: 'hire', chain: ci, station: -1, material: p.material, cost: 0 }], 0.03 * 120);
    }
    for (let si = 0; si < 4; si++) {
      const t = p.tiers[si];
      if (p.units[si] < MAX_UNITS) {
        const np = clonePlan(p);
        np.units[si]++;
        const c = unitPrice(t, si, p.units[si] + 1);
        const steps: PlanStep[] = [{ kind: 'unit', chain: ci, station: si, material: p.material, cost: c }];
        const sc = staffPlan(s, np);
        if (sc > 0) steps.push({ kind: 'hire', chain: ci, station: -1, material: p.material, cost: sc });
        push('unit', ci, swap(np), steps, c + sc);
      }
      if (p.tools[si] < TOOL_MAX) {
        const np = clonePlan(p);
        np.tools[si]++;
        const c = toolCost(t, si, p.tools[si]);
        push('tool', ci, swap(np), [{ kind: 'tool', chain: ci, station: si, material: p.material, cost: c }], c);
      }
    }
    // Équilibrer la chaîne
    for (const f of [1.15, 1.5, 2]) {
      const np = clonePlan(p);
      const steps: PlanStep[] = [];
      const c = balancePlan(s, np, cur * f + 1e-3, ci, steps);
      if (c !== null) push('balance', ci, swap(np), steps, c);
    }
    // Moderniser toute la chaîne jusqu'à un palier (+ meilleur matériau + équilibrage)
    const minTier = Math.min(...p.tiers);
    for (let T = minTier + 1; tierAllowed(s, T); T++) {
      for (const f of [0, 1.3, 2, 3]) {
        const np = clonePlan(p);
        const steps: PlanStep[] = [];
        let cost = 0;
        const c = s.chains[ci];
        const order = [0, 1, 2, 3].filter((si) => p.tiers[si] < T).sort((a, b) => b - a);
        for (const si of order) {
          for (let t = p.tiers[si]; t < T; t++) {
            const mc = modernizeCost({ tier: t, tool: 0, units: c.stations[si].units }, si);
            cost += mc;
            steps.push({ kind: 'modernize', chain: ci, station: si, material: p.material, cost: mc });
          }
          np.tiers[si] = T;
          np.tools[si] = 0;
        }
        const sc = staffPlan(s, np);
        cost += sc;
        if (sc > 0) steps.push({ kind: 'hire', chain: ci, station: -1, material: np.material, cost: sc });
        const m = bestMaterial(s, np, plans, ci);
        if (m !== np.material) {
          np.material = m;
          steps.push({ kind: 'material', chain: ci, station: -1, material: m, cost: 0 });
        }
        // Objectif en valeur : un matériau plus cher peut sortir moins de pièces.
        const target = (cur * MATERIALS[p.material].price * f) / MATERIALS[np.material].price;
        const bc = f === 0 ? 0 : balancePlan(s, np, Math.max(target, 1e-3), ci, steps);
        if (bc === null) continue;
        push('upgrade', ci, swap(np), steps, cost + bc);
      }
    }
    // Changer de matériau
    for (let m = 0; m < MATERIALS.length; m++) {
      if (m === p.material || !materialOk(s, s.chains[ci], m)) continue;
      const np = clonePlan(p);
      np.material = m;
      push('material', ci, swap(np), [{ kind: 'material', chain: ci, station: -1, material: m, cost: 0 }], 0.01);
    }
  });
  if (s.chains.length < maxChains(s)) {
    const bi = bestChainIndex(s);
    const np: ChainPlan = { ...clonePlan(plans[bi]), levels: [] };
    const cc = newChainCost(s, s.chains[bi]);
    const sc = staffPlan(s, np);
    const steps: PlanStep[] = [{ kind: 'chain', chain: s.chains.length, station: -1, material: np.material, cost: cc }];
    if (sc > 0) steps.push({ kind: 'hire', chain: s.chains.length, station: -1, material: np.material, cost: sc });
    push('chain', s.chains.length, [...plans, np], steps, cc + sc);
  }
  out.sort((a, b) => a.payback - b.payback);
  return out;
}

/** Meilleur plan (le plus court temps de retour) sous l'horizon donné. */
export function bestCandidate(s: GameState, horizon = Infinity): Candidate | null {
  const c = candidates(s).filter((x) => x.payback < horizon);
  return c[0] ?? null;
}

/** Coût de la première étape réellement payante d'un plan (avec la formation qui la suit). */
export function firstStepCost(c: Candidate): number {
  let cost = 0;
  for (const st of c.steps) {
    cost += st.cost;
    if (st.kind !== 'hire' && st.kind !== 'material' && cost > 0) {
      const next = c.steps[c.steps.indexOf(st) + 1];
      if (next && next.kind === 'hire') cost += next.cost;
      break;
    }
  }
  return cost;
}
