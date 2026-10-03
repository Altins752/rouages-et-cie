/**
 * Joueur automatique du simulateur d'équilibrage : achète l'action la plus vite
 * rentabilisée (comme le simulateur Python d'origine), en jouant sur le vrai moteur.
 */
import {
  ACTS, CONTRACTS, ENERGY, KNOW_HOW, MATERIALS, METHODS, NIGHT, RESEARCH_EXTRA, ROBOT_TIER, ROLES, TIER_OPERATOR_LEVEL,
  TIER_RESEARCH,
} from '../data/balance';
import * as A from './actions';
import { bestCandidate, firstStepCost } from './advisor';
import type { Candidate } from './advisor';
import { estimateSite } from './analysis';
import { canPromote, canTrain, knowHowCost, nightCost, promotionCost, trainingCost } from './formulas';
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

/** Garde les postes tenus : embauche aux postes libres, qualifie les titulaires, technicien, relève. */
function staffing(ai: AiState, s: GameState): void {
  s.factories.forEach((f, fi) => {
    for (let k = 0; k < 8 && A.freePosts(s, fi).length; k++) run(ai, s, 'hire', A.hire(s, fi));
    // Qualification exigée par la machine du poste
    for (const w of A.unqualified(s, fi)) {
      if (canPromote(w)) run(ai, s, `promote L${w.level + 1}`, A.promote(s, w.id));
      else if (canTrain(w)) run(ai, s, 'train', A.train(s, w.id));
    }
    // Un technicien pour les robots
    const robots = f.lines.some((l) => l.slots.some((m) => m && m.tier === ROBOT_TIER));
    if (robots && !s.workers.some((w) => w.factory === fi && (w.level >= 4 || (w.state === 'train' && w.course === 'promote' && w.level === 3)))) {
      const w = s.workers.filter((x) => x.factory === fi && x.kind !== 'crank' && x.state !== 'train').sort((a, b) => b.level * 10 + b.trainings - (a.level * 10 + a.trainings))[0];
      if (!w && !s.workers.some((x) => x.factory === fi && x.state === 'train')) run(ai, s, 'hire poly (tech)', A.hirePoly(s, fi));
      if (w) {
        if (canPromote(w) && s.money >= promotionCost(s, w)) run(ai, s, 'promote tech', A.promote(s, w.id));
        else if (canTrain(w) && s.money >= trainingCost(s, w)) run(ai, s, 'train tech', A.train(s, w.id));
      }
    }
    // Relève : un polyvalent quand le moral baisse
    if (s.act >= 2) {
      const ws = s.workers.filter((w) => w.factory === fi);
      const mor = ws.reduce((a, w) => a + w.morale, 0) / Math.max(1, ws.length);
      if (mor < 0.6 && A.polyCount(s, fi) < 3) run(ai, s, 'hire poly', A.hirePoly(s, fi));
    }
  });
}

function maintenance(ai: AiState, s: GameState): void {
  s.factories.forEach((f, fi) =>
    f.lines.forEach((line, l) =>
      line.slots.forEach((m, st) => {
        if (!m) return;
        if (m.broken && m.service <= 0) run(ai, s, 'repair', A.repair(s, fi, l, st));
        else if (!s.research.preventive && m.tier > 0 && m.wear > 0.45 && m.service <= 0 && s.money > 0) run(ai, s, 'service', A.service(s, fi, l, st));
      }),
    ),
  );
}

function researchStep(ai: AiState, s: GameState, best: Candidate | null): boolean {
  const opts: { id: A.ResearchId; cost: number }[] = [];
  const allTier = s.factories.some((f) => f.lines.every((l) => l.slots.every((m) => !m || m.tier >= s.research.tier)));
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

/** Exécute la première étape payante du plan (le matériau suit, l'embauche est gratuite). */
function execute(ai: AiState, s: GameState, c: Candidate): boolean {
  for (const st of c.steps) {
    const fi = st.factory;
    switch (st.kind) {
      case 'hire':
        if (c.kind === 'hire') return run(ai, s, 'hire', A.hire(s, fi));
        continue;
      case 'poly':
        return run(ai, s, 'hire poly', A.hirePoly(s, fi));
      case 'material':
        run(ai, s, `material f${fi} ${MATERIALS[st.material].id}`, A.setMaterial(s, fi, st.material));
        continue;
      case 'unit': {
        const ok = run(ai, s, `unit f${fi} s${st.station} (${c.kind})`, A.addUnit(s, fi, st.station, st.line));
        if (ok) A.hire(s, fi);
        return ok;
      }
      case 'modernize': {
        const tgt = A.modernizeTarget(s, fi, st.station);
        const f = s.factories[fi];
        const m = tgt ? f.lines[tgt.line].slots[st.station] : null;
        const w = m && m.post >= 0 ? s.workers.find((x) => x.id === m.post) : undefined;
        if (tgt && w && tgt.tier + 1 < ROBOT_TIER && w.level < TIER_OPERATOR_LEVEL[tgt.tier + 1]) {
          // L'ouvrier d'abord : la machine ne s'arrêtera pas à la modernisation.
          if (w.state === 'train') return false;
          if (canPromote(w)) return run(ai, s, 'promote (prépare)', A.promote(s, w.id));
          if (canTrain(w)) return run(ai, s, 'train (prépare)', A.train(s, w.id));
          return false;
        }
        return run(ai, s, `modernize f${fi} s${st.station}`, A.modernize(s, fi, st.station));
      }
      case 'tool':
        return run(ai, s, `tool t${st.tier} s${st.station}`, A.upgradeTool(s, st.tier, st.station));
      case 'conveyor': {
        const ok = run(ai, s, `conveyor f${fi} l${st.line}`, A.buyConveyor(s, fi, st.line));
        if (ok) A.hire(s, fi);
        return ok;
      }
      case 'train':
        return run(ai, s, 'train bottleneck', A.train(s, st.worker));
      case 'factory':
        return run(ai, s, 'factory', A.buyFactory(s));
    }
  }
  return false;
}

function contractsStep(s: GameState): void {
  if (s.act < CONTRACTS.spotAct) return;
  for (const sc of s.spot) {
    if (sc.accepted) {
      if (!s.roles.logistics) A.deliverSpot(s, sc.id);
      continue;
    }
    // une commande à la fois par matériau, tenue avec 30 % de marge à la cadence actuelle
    if (s.spot.some((x) => x.accepted && x.material === sc.material)) continue;
    const rate = s.market.prodRate[sc.material];
    if (rate * CONTRACTS.spotShare * sc.duration >= sc.qty * 1.3 && sc.price >= MATERIALS[sc.material].price) A.acceptSpot(s, sc.id);
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
  // Encadrement : quand le salaire reste petit devant les recettes ; on congédie s'il pèse trop.
  const est = estimateSite(s);
  for (const r of ROLES) {
    if (!A.roleAvailable(s, r.id)) continue;
    if (!s.roles[r.id] && r.salary <= Math.max(0.25, est.revenue * 0.04)) {
      run(ai, s, `role ${r.id}`, A.hireRole(s, r.id));
      if (r.id === 'methods') {
        for (let st = 0; st < 4; st++) A.setMethodsTarget(s, st, s.research.tier);
        A.setMethodsBudget(s, 1);
        A.setMethodsActive(s, true);
      }
    } else if (s.roles[r.id] && r.salary > est.revenue * 0.25 && s.money < 0) run(ai, s, `dismiss ${r.id}`, A.dismissRole(s, r.id));
  }
  if (s.roles.methods) for (let st = 0; st < 4; st++) A.setMethodsTarget(s, st, s.research.tier);
  if (s.act >= 2 && s.canteen === 0 && s.money > A.canteenCost(s) * 2) run(ai, s, 'canteen', A.buyCanteen(s));
  // Équipe de nuit : petit budget, un niveau quand il pèse peu dans la caisse.
  if (A.nightAvailable(s)) {
    const kind: A.NightKind = s.night.rate > 0 && nightCost('duration', s.night.duration) < nightCost('rate', s.night.rate) ? 'duration' : 'rate';
    if (s.night[kind] < NIGHT[kind].max && nightCost(kind, s.night[kind]) < s.money * 0.02) run(ai, s, `night ${kind}`, A.upgradeNight(s, kind));
  }
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
export const AI_METHODS = METHODS;
export const AI_LEVEL = TIER_OPERATOR_LEVEL;
