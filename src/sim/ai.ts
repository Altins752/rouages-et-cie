/**
 * Joueur automatique du simulateur d'équilibrage : achète l'action la plus vite
 * rentabilisée (comme le simulateur Python d'origine), en jouant sur le vrai moteur.
 */
import {
  ACTS, CONTRACTS, ENERGY, KNOW_HOW, MATERIALS, MAX_WORKERS_PER_CHAIN, RESEARCH_EXTRA, ROBOT_TIER, ROLES, TIER_OPERATOR_LEVEL,
  TIER_RESEARCH,
} from '../data/balance';
import * as A from './actions';
import { bestCandidate, firstStepCost } from './advisor';
import type { Candidate } from './advisor';
import { estimateFactory, factoryPlans } from './analysis';
import { knowHowCost } from './formulas';
import type { GameState } from './types';

export interface AiLog {
  t: number;
  act: number;
  what: string;
  cost: number;
}

export interface AiState {
  log: AiLog[];
  lastBuyT: number;
  /** Plus longue attente sans achat (s de jeu) dans l'acte courant. */
  maxGap: number;
  firstBuyT: number;
}

export function newAi(): AiState {
  return { log: [], lastBuyT: 0, maxGap: 0, firstBuyT: -1 };
}

function note(ai: AiState, s: GameState, what: string, cost: number): void {
  ai.log.push({ t: s.t, act: s.act, what, cost });
  if (cost > 0) {
    if (ai.firstBuyT < 0) ai.firstBuyT = s.t;
    ai.maxGap = Math.max(ai.maxGap, s.t - ai.lastBuyT);
    ai.lastBuyT = s.t;
  }
}

function run(ai: AiState, s: GameState, what: string, r: A.Result): boolean {
  if (r.ok) note(ai, s, what, r.cost ?? 0);
  return r.ok;
}

/** Garde les postes servis : forme ou embauche les opérateurs manquants. */
function staffing(ai: AiState, s: GameState): void {
  s.chains.forEach((c, ci) => {
    const ws = s.workers.filter((w) => w.chain === ci);
    const lv = (w: (typeof ws)[number]) => (w.state === 'train' ? w.trainTo : w.level);
    const human = c.stations.filter((st) => st.tier < ROBOT_TIER);
    const humanUnits = human.reduce((a, st) => a + st.units.length, 0);
    const humanStations = human.filter((st) => st.units.length > 0).length;
    // Au moins un ouvrier par poste humain.
    if (ws.length < humanStations) {
      run(ai, s, 'hire', A.hire(s, ci));
      return;
    }
    // Relève : quand le moral baisse, quelques ouvriers de plus que de machines.
    if (s.act >= 2 && humanUnits > 0 && ws.length < Math.min(MAX_WORKERS_PER_CHAIN, Math.ceil(humanUnits * 1.25) + 1)) {
      const mor = ws.reduce((a, w) => a + w.morale, 0) / Math.max(1, ws.length);
      if (mor < 0.6) {
        run(ai, s, 'hire relief', A.hire(s, ci));
        return;
      }
    }
    for (const req of [4, 3, 2]) {
      let need = 0;
      if (req === 4) need = c.stations.some((st) => st.tier === ROBOT_TIER) ? 1 : 0;
      else for (const st of human) if (TIER_OPERATOR_LEVEL[st.tier] >= req) need += st.units.length;
      const have = ws.filter((w) => lv(w) >= req).length;
      if (have >= need) continue;
      const cand = ws.filter((w) => w.state !== 'train' && w.level === req - 1);
      if (cand.length) {
        run(ai, s, `train${req}`, A.train(s, ci, req, cand[0].id));
        return;
      }
      if (ws.length < humanUnits + 1 || req === 4) {
        const lower = ws.filter((w) => w.state !== 'train' && w.level < req - 1);
        if (lower.length) run(ai, s, `train${lower[0].level + 1}`, A.train(s, ci, lower[0].level + 1, lower[0].id));
        else run(ai, s, 'hire', A.hire(s, ci));
        return;
      }
    }
  });
}

function maintenance(ai: AiState, s: GameState): void {
  s.chains.forEach((c, ci) =>
    c.stations.forEach((st, si) =>
      st.units.forEach((u, ui) => {
        if (u.broken && u.service <= 0) run(ai, s, 'repair', A.repair(s, ci, si, ui));
        else if (!s.research.preventive && st.tier > 0 && u.wear > 0.45 && u.service <= 0 && s.money > 0) {
          run(ai, s, 'service', A.service(s, ci, si, ui));
        }
      }),
    ),
  );
}

function researchStep(ai: AiState, s: GameState, best: Candidate | null): boolean {
  const opts: { id: A.ResearchId; cost: number }[] = [];
  const allTier = s.chains.some((c) => c.stations.every((st) => st.tier >= s.research.tier));
  if (A.researchAvailable(s, 'tier') && (allTier || s.research.tier === 0)) opts.push({ id: 'tier', cost: TIER_RESEARCH[s.research.tier + 1] });
  for (let m = 1; m < MATERIALS.length; m++) {
    const id = `mat:${m}` as A.ResearchId;
    if (A.researchAvailable(s, id)) opts.push({ id, cost: MATERIALS[m].research });
  }
  for (const id of ['workshop', 'preventive', 'predictive'] as const) {
    if (A.researchAvailable(s, id) && s.money > RESEARCH_EXTRA[id].cost * 3) opts.push({ id, cost: RESEARCH_EXTRA[id].cost });
  }
  opts.sort((a, b) => a.cost - b.cost);
  const o = opts[0];
  if (!o) return false;
  if (s.money >= o.cost && (!best || best.payback > 180 || o.cost < 0.2 * s.money)) {
    return run(ai, s, `research ${o.id}`, A.research(s, o.id));
  }
  return false;
}

/** Exécute la première étape payante du plan (le matériau suit, la formation est gérée à part). */
function execute(ai: AiState, s: GameState, c: Candidate): boolean {
  for (const st of c.steps) {
    switch (st.kind) {
      case 'hire':
        if (c.kind === 'hire') return run(ai, s, 'hire', A.hire(s, st.chain));
        continue;
      case 'material':
        run(ai, s, `material c${st.chain} ${MATERIALS[st.material].id}`, A.setMaterial(s, st.chain, st.material));
        continue;
      case 'unit':
        return run(ai, s, `unit c${st.chain} s${st.station} (${c.kind})`, A.addUnit(s, st.chain, st.station));
      case 'tool':
        return run(ai, s, `tool c${st.chain} s${st.station} (${c.kind})`, A.upgradeTool(s, st.chain, st.station));
      case 'modernize':
        return run(ai, s, `modernize c${st.chain} s${st.station}`, A.modernize(s, st.chain, st.station));
      case 'chain':
        return run(ai, s, 'chain', A.buyChain(s));
    }
  }
  return false;
}

function contractsStep(s: GameState): void {
  if (s.act < CONTRACTS.act) return;
  for (const sc of s.spot) {
    if (sc.accepted) {
      if (!s.roles.logistics) A.deliverSpot(s, sc.id);
      continue;
    }
    const rate = s.market.prodRate[sc.material];
    if (rate * sc.duration * 0.4 >= sc.qty && sc.price >= MATERIALS[sc.material].price) A.acceptSpot(s, sc.id);
  }
  if (!s.roles.sales) {
    for (const lc of s.long) {
      if (lc.accepted) continue;
      const used = s.long.filter((x) => x.accepted && x.material === lc.material).reduce((a, x) => a + x.rate, 0);
      if (used + lc.rate <= s.market.prodRate[lc.material] * 0.5) A.signLong(s, lc.id);
    }
  }
}

function knowHowStep(s: GameState): void {
  const order = ['cadence', 'price', 'capital', 'wear', 'hall', 'training', 'energy'] as const;
  let guard = 0;
  while (guard++ < 50) {
    let bought = false;
    for (const id of order) {
      const def = KNOW_HOW.find((k) => k.id === id)!;
      const lvl = s.knowHow.levels[id];
      if (lvl < def.max && knowHowCost(id, lvl) <= s.knowHow.points) {
        A.buyKnowHow(s, id);
        bought = true;
        break;
      }
    }
    if (!bought) break;
  }
}

/** Une décision du joueur automatique. */
export function aiStep(ai: AiState, s: GameState): void {
  // Fin d'acte
  if (s.act === 0 && s.money >= s.debt) {
    run(ai, s, 'payDebt', A.payDebt(s));
    return;
  }
  if (A.canMove(s)) {
    knowHowStep(s);
    run(ai, s, 'move', A.move(s));
    knowHowStep(s);
    return;
  }
  if (A.canBuyout(s)) {
    run(ai, s, 'buyout', A.buyout(s));
    return;
  }
  maintenance(ai, s);
  staffing(ai, s);
  contractsStep(s);
  // Encadrement : contremaître dès que possible, les autres quand la masse salariale le permet.
  const est = estimateFactory(s, factoryPlans(s));
  for (const r of ROLES) {
    if (s.roles[r.id] || !A.roleAvailable(s, r.id)) continue;
    if (r.salary <= Math.max(0.25, est.revenue * 0.04)) run(ai, s, `role ${r.id}`, A.hireRole(s, r.id));
  }
  if (s.act >= 2 && s.canteen === 0 && s.money > A.canteenCost(s) * 2) run(ai, s, 'canteen', A.buyCanteen(s));
  // Énergie : éolien si la facture pèse.
  if (s.act >= ENERGY.act && s.energy.cost > 5) {
    const c = A.energyCost(s, 'wind');
    const save = ENERGY.wind.kw * 0.775 * ENERGY.gridPrice;
    if (c / save < 600 && s.money > c * 1.5) run(ai, s, 'wind', A.buyEnergy(s, 'wind'));
  }
  const horizon = s.act === 0 ? Math.max(30, (s.due - s.t) / 2) : 3600;
  const best = bestCandidate(s, horizon);
  if (researchStep(ai, s, best)) return;
  if (best && s.money >= firstStepCost(best)) execute(ai, s, best);
}

export function actName(act: number): string {
  return ['Prologue', 'Acte I', 'Acte II', 'Acte III', 'Acte IV', 'Bac à sable'][act] ?? `Acte ${act}`;
}

export const AI_ACTS = ACTS.length;
