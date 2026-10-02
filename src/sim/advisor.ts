/**
 * Conseiller : propose des plans d'achat et leur temps de retour estimé.
 * Chaque plan est joué sur une copie légère de l'usine concernée, avec les vraies
 * actions, puis évalué en régime établi. On n'exécute que la première étape payante.
 * Utilisé par le superviseur de chaîne (recommandations) et l'IA du simulateur.
 */
import { MATERIALS, ROBOT_TIER, TIER_OPERATOR_LEVEL, TOOL_MAX, TRAINING } from '../data/balance';
import * as A from './actions';
import { estimateFactory, estimateSite } from './analysis';
import type { EstimateCache } from './analysis';
import { canTrain, conveyorCost, materialOk, promotionCost, toolCost, trainingCost } from './formulas';
import type { Factory, GameState, Worker } from './types';

export type StepKind = 'hire' | 'poly' | 'unit' | 'modernize' | 'tool' | 'conveyor' | 'train' | 'material' | 'factory';

export interface PlanStep {
  kind: StepKind;
  factory: number;
  station: number;
  line: number;
  tier: number;
  material: number;
  worker: number;
  cost: number;
}

export interface Candidate {
  kind: 'hire' | 'poly' | 'unit' | 'line' | 'modernize' | 'upgrade' | 'tool' | 'conveyor' | 'train' | 'material' | 'factory';
  factory: number;
  steps: PlanStep[];
  cost: number;
  gain: number;
  payback: number;
}

const step = (kind: StepKind, factory: number, o: Partial<PlanStep> = {}): PlanStep => ({
  kind, factory, station: -1, line: -1, tier: -1, material: -1, worker: -1, cost: 0, ...o,
});

function deepFactory(f: Factory): Factory {
  return { ...f, lines: f.lines.map((l) => ({ ...l, buf: [...l.buf], slots: l.slots.map((m) => (m ? { ...m } : null)) })) };
}

/** Copie légère : l'usine fi et ses ouvriers sont copiés, le reste est partagé (lecture seule). */
function cloneFor(s: GameState, fi: number, tooling = false): GameState {
  const c: GameState = {
    ...s,
    money: Infinity,
    factories: s.factories.slice(),
    workers: s.workers.map((w) => (w.factory === fi ? { ...w } : w)),
    stats: { ...s.stats },
    fx: [],
  };
  if (fi >= 0 && fi < s.factories.length) c.factories[fi] = deepFactory(s.factories[fi]);
  if (tooling) c.tooling = s.tooling.map((r) => [...r]);
  return c;
}

/** Coût pour qualifier un ouvrier jusqu'au niveau voulu (formations restantes et promotions), appliqué tout de suite. */
function qualify(s: GameState, w: Worker, level: number): number {
  let cost = 0;
  let guard = 0;
  while (w.level < level && guard++ < 40) {
    while (w.trainings < TRAINING.perLevel) {
      cost += trainingCost(s, w);
      w.trainings++;
      w.trained++;
    }
    cost += promotionCost(s, w);
    w.level++;
    w.trainings = 0;
  }
  return cost;
}

/** Remplit les postes vacants de l'usine et qualifie chaque titulaire pour sa machine. */
function staffAll(s: GameState, fi: number): number {
  let cost = 0;
  for (let k = 0; k < 24 && A.freePosts(s, fi).length; k++) A.hire(s, fi);
  const f = s.factories[fi];
  for (const w of s.workers) {
    if (w.factory !== fi || w.kind !== 'post') continue;
    const m = f.lines[w.line]?.slots[w.station];
    if (m && m.tier < ROBOT_TIER) cost += qualify(s, w, TIER_OPERATOR_LEVEL[m.tier]);
  }
  if (f.lines.some((l) => l.slots.some((m) => m && m.tier === ROBOT_TIER)) && !s.workers.some((w) => w.factory === fi && w.level >= 4)) {
    let w = s.workers.filter((x) => x.factory === fi && x.kind !== 'crank').sort((a, b) => b.level - a.level)[0];
    if (!w) {
      A.hirePoly(s, fi);
      w = s.workers[s.workers.length - 1];
    }
    if (w) cost += qualify(s, w, 4);
  }
  return cost;
}

function bestMaterial(s: GameState, fi: number, cache: EstimateCache): number {
  const f = s.factories[fi];
  let best = f.material;
  let bv = -Infinity;
  for (let m = 0; m < MATERIALS.length; m++) {
    if (!materialOk(s, f, m)) continue;
    const prev = f.material;
    f.material = m;
    cache.delete(f);
    const v = estimateSite(s, cache).net;
    cache.delete(f);
    f.material = prev;
    if (v > bv) {
      bv = v;
      best = m;
    }
  }
  return best;
}

export function candidates(s: GameState): Candidate[] {
  const cache: EstimateCache = new Map();
  const base = estimateSite(s, cache).net;
  const out: Candidate[] = [];
  const push = (kind: Candidate['kind'], fi: number, c: GameState, steps: PlanStep[], cost: number, useCache = true) => {
    if (!steps.length) return;
    let local: EstimateCache | undefined;
    if (useCache) {
      local = new Map(cache);
      if (fi >= 0 && fi < s.factories.length) local.delete(s.factories[fi]);
    }
    const gain = estimateSite(c, local).net - base;
    if (gain <= 1e-6) return;
    const cc = Math.max(cost, 0.01);
    out.push({ kind, factory: fi, steps, cost: cc, gain, payback: cc / gain });
  };

  s.factories.forEach((f, fi) => {
    // Embaucher au poste libre
    if (A.freePosts(s, fi).length) {
      const c = cloneFor(s, fi);
      A.hire(c, fi);
      push('hire', fi, c, [step('hire', fi)], 0.03 * 120);
    }
    // Un polyvalent de plus
    if (A.polyCount(s, fi) < 6) {
      const c = cloneFor(s, fi);
      A.hirePoly(c, fi);
      push('poly', fi, c, [step('poly', fi)], 0.03 * 0.7 * 120);
    }
    for (let st = 0; st < 4; st++) {
      // Un poste de plus (sur la première chaîne qui ne l'a pas) et son ouvrier
      if (A.stationCount(f, st) < f.lines.length) {
        const c = cloneFor(s, fi);
        const cost = A.addUnitCost(c, fi, st);
        A.addUnit(c, fi, st);
        const q = staffAll(c, fi);
        push('unit', fi, c, [step('unit', fi, { station: st, cost }), step('hire', fi)], cost + q);
      }
      // Moderniser la moins moderne de ce poste
      const tgt = A.modernizeTarget(s, fi, st);
      if (tgt) {
        const c = cloneFor(s, fi);
        A.modernize(c, fi, st);
        const q = staffAll(c, fi);
        push('modernize', fi, c, [step('modernize', fi, { station: st, line: tgt.line, cost: tgt.cost })], tgt.cost + q);
      }
    }
    // Compléter la prochaine chaîne (tous ses postes manquants et leurs ouvriers)
    for (let next = 0; next < f.lines.length; next++) {
      if (!f.lines[next].slots.some((m) => !m)) continue;
      const c = cloneFor(s, fi);
      const steps: PlanStep[] = [];
      let cost = 0;
      for (let st = 0; st < 4; st++) {
        if (c.factories[fi].lines[next].slots[st]) continue;
        const uc = A.addUnitCost(c, fi, st);
        A.addUnit(c, fi, st, next);
        cost += uc;
        steps.push(step('unit', fi, { station: st, line: next, cost: uc }));
      }
      cost += staffAll(c, fi);
      push('line', fi, c, steps, cost);
      if (!f.lines[next].slots.some(Boolean)) break; // une seule chaîne vide à la fois
    }
    // Moderniser toute l'usine jusqu'à un palier (+ meilleur matériau)
    let minTier = 9;
    for (const l of f.lines) for (const m of l.slots) if (m) minTier = Math.min(minTier, m.tier);
    for (let T = minTier + 1; minTier < 9 && A.tierAllowed(s, T); T++) {
      const c = cloneFor(s, fi);
      const steps: PlanStep[] = [];
      let cost = 0;
      for (let st = 3; st >= 0; st--) {
        for (let k = 0; k < 16; k++) {
          const tgt = A.modernizeTarget(c, fi, st);
          if (!tgt || tgt.tier >= T) break;
          steps.push(step('modernize', fi, { station: st, line: tgt.line, cost: tgt.cost }));
          cost += tgt.cost;
          A.modernize(c, fi, st);
        }
      }
      cost += staffAll(c, fi);
      const localCache: EstimateCache = new Map(cache);
      localCache.delete(s.factories[fi]);
      const m = bestMaterial(c, fi, localCache);
      if (m !== c.factories[fi].material) {
        c.factories[fi].material = m;
        steps.push(step('material', fi, { material: m }));
      }
      push('upgrade', fi, c, steps, cost);
    }
    // Convoyeurs (et l'ouvrier à la manivelle)
    f.lines.forEach((line, l) => {
      if (line.conveyor || line.slots.filter(Boolean).length < 2) return;
      const cost = conveyorCost(f, l);
      const c = cloneFor(s, fi);
      A.buyConveyor(c, fi, l);
      A.hire(c, fi);
      push('conveyor', fi, c, [step('conveyor', fi, { line: l, cost }), step('hire', fi)], cost);
    });
    // Former l'ouvrier qui freine sa chaîne
    const est = estimateFactory(s, fi);
    f.lines.forEach((line, l) => {
      const b = est.lineBottleneck[l];
      if (b < 0) return;
      const m = line.slots[b];
      if (!m || m.post < 0) return;
      const w = s.workers.find((x) => x.id === m.post);
      if (!w || !canTrain(w) || w.level < TIER_OPERATOR_LEVEL[m.tier]) return;
      const c = cloneFor(s, fi);
      const cw = c.workers.find((x) => x.id === w.id)!;
      const cost = trainingCost(s, w);
      cw.trainings++;
      cw.trained++;
      push('train', fi, c, [step('train', fi, { worker: w.id, cost })], cost);
    });
    // Former d'un coup tous les ouvriers d'une chaîne (chaîne équilibrée)
    f.lines.forEach((line) => {
      const ws = line.slots
        .map((m) => (m && m.post >= 0 ? s.workers.find((x) => x.id === m.post) : undefined))
        .filter((w): w is Worker => !!w && canTrain(w));
      if (ws.length < 2) return;
      const c = cloneFor(s, fi);
      const steps: PlanStep[] = [];
      let cost = 0;
      for (const w of ws) {
        const cw = c.workers.find((x) => x.id === w.id)!;
        const k = trainingCost(s, w);
        cost += k;
        cw.trainings++;
        cw.trained++;
        steps.push(step('train', fi, { worker: w.id, cost: k }));
      }
      push('train', fi, c, steps, cost);
    });
    // Changer de matériau
    for (let m = 0; m < MATERIALS.length; m++) {
      if (m === f.material || !materialOk(s, f, m)) continue;
      const c = cloneFor(s, fi);
      c.factories[fi].material = m;
      push('material', fi, c, [step('material', fi, { material: m })], 0.01);
    }
  });
  // Outillage (toutes les usines)
  for (let st = 0; st < 4; st++) {
    for (const tier of A.tiersInUse(s, st)) {
      const lvl = A.toolLevel(s, tier, st);
      if (lvl >= TOOL_MAX || tier > s.research.tier) continue;
      const c = cloneFor(s, -1, true);
      c.tooling[tier][st] = lvl + 1;
      const cost = toolCost(tier, st, lvl);
      push('tool', -1, c, [step('tool', -1, { station: st, tier, cost })], cost, false);
    }
  }
  // Outillage de tous les postes d'un palier, d'un niveau (lignes équilibrées)
  for (let tier = 0; tier <= s.research.tier; tier++) {
    const sts = [0, 1, 2, 3].filter((st) => A.tiersInUse(s, st).includes(tier) && A.toolLevel(s, tier, st) < TOOL_MAX);
    if (sts.length < 2) continue;
    const c = cloneFor(s, -1, true);
    const steps: PlanStep[] = [];
    let cost = 0;
    for (const st of sts) {
      const lvl = A.toolLevel(s, tier, st);
      const k = toolCost(tier, st, lvl);
      c.tooling[tier][st] = lvl + 1;
      cost += k;
      steps.push(step('tool', -1, { station: st, tier, cost: k }));
    }
    steps.sort((a, b) => a.cost - b.cost);
    push('tool', -1, c, steps, cost, false);
  }
  // Nouvelle usine
  if (s.factories.length < A.maxFactories(s)) {
    const c = cloneFor(s, -1);
    const cost = A.factoryCost(s);
    A.buyFactory(c);
    const fi = c.factories.length - 1;
    const q = staffAll(c, fi);
    push('factory', fi, c, [step('factory', fi, { cost }), step('hire', fi)], cost + q);
  }
  out.sort((a, b) => a.payback - b.payback);
  return out;
}

/** Meilleur plan (le plus court temps de retour) sous l'horizon donné. */
export function bestCandidate(s: GameState, horizon = Infinity): Candidate | null {
  const c = candidates(s).filter((x) => x.payback < horizon);
  return c[0] ?? null;
}

const PAYING: StepKind[] = ['unit', 'modernize', 'tool', 'conveyor', 'train', 'factory'];

/** Coût de la première étape payante d'un plan. */
export function firstStepCost(c: Candidate): number {
  const st = c.steps.find((x) => PAYING.includes(x.kind));
  return st ? st.cost : 0;
}
