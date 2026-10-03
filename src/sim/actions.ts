/**
 * Actions du joueur. Chaque action vérifie ses conditions, modifie l'état et
 * renvoie un résultat. Aucune action n'accède au DOM.
 */
import {
  ACTS, CANTEEN_COST, CONTRACTS, ENERGY, KNOW_HOW, LINES, MATERIALS, METHODS, NIGHT, POLY, PRESTIGE, PROLOGUE,
  RESEARCH_EXTRA, REPUTATION, ROBOT_TIER, ROLES, SANDBOX_ACT, TIER_COUNT, TIER_MIN_ACT, TIER_OPERATOR_LEVEL,
  TIER_RESEARCH, TOOL_MAX, DOOR_POS,
} from '../data/balance';
import type { KnowHowId, RoleId } from '../data/balance';
import { machineRank, modernizeMachine, releaseWorker, startCourse } from './engine';
import {
  canPromote, canTrain, conveyorCost, crankUseful, factoryValue, knowHow, knowHowCost, knowHowGain, machineCycle, materialOk,
  modernizeCost, newFactoryCost, nightCost, promotionCost, toolCost, trainingCost, unitPrice,
} from './formulas';
import { newFactory, newMachine, newWorker } from './state';
import type { Factory, GameState, Worker } from './types';

export type Result = { ok: true; cost?: number; info?: string } | { ok: false; reason: string };
const fail = (reason: string): Result => ({ ok: false, reason });
const ok = (cost?: number, info?: string): Result => ({ ok: true, cost, info });

function pay(s: GameState, cost: number): boolean {
  if (s.money < cost) return false;
  s.money -= cost;
  return true;
}

function factoryAt(s: GameState, fi: number): Factory | null {
  return s.factories[fi] ?? null;
}

// ---------------------------------------------------------------- Personnel

/** Poste libre d'une usine : machine humaine sans titulaire, puis convoyeur sans ouvrier. */
export interface FreePost {
  kind: 'post' | 'crank';
  line: number;
  station: number;
}

/**
 * Postes libres, du plus utile au moins utile. Avec le contremaître, le poste le plus lent
 * d'abord ; sans lui, dans l'ordre des chaînes.
 */
export function freePosts(s: GameState, fi: number): FreePost[] {
  const f = s.factories[fi];
  if (!f) return [];
  const out: { p: FreePost; score: number }[] = [];
  f.lines.forEach((line, l) => {
    line.slots.forEach((m, st) => {
      if (!m || m.tier >= ROBOT_TIER || m.post >= 0) return;
      const speed = 1 / machineCycle(s, f.material, m.tier, st);
      const score = s.roles.foreman ? speed : l * 10 + st;
      out.push({ p: { kind: 'post', line: l, station: st }, score });
    });
  });
  out.sort((a, b) => a.score - b.score);
  const cranks: FreePost[] = [];
  f.lines.forEach((line, l) => {
    if (crankUseful(line) && line.crank < 0) cranks.push({ kind: 'crank', line: l, station: -1 });
  });
  return [...out.map((o) => o.p), ...cranks];
}

/** Embaucher un manœuvre : il prend le poste libre le plus utile et n'en bougera plus. */
export function hire(s: GameState, fi: number): Result {
  const f = factoryAt(s, fi);
  if (!f) return fail('usine');
  const p = freePosts(s, fi)[0];
  if (!p) return fail('aucun poste');
  const w = newWorker(s, fi, p.kind === 'crank' ? 'crank' : 'post');
  w.line = p.line;
  w.station = p.station;
  if (p.kind === 'crank') f.lines[p.line].crank = w.id;
  else f.lines[p.line].slots[p.station]!.post = w.id;
  s.workers.push(w);
  return ok(0, w.name);
}

export function polyCount(s: GameState, fi: number): number {
  return s.workers.filter((w) => w.factory === fi && w.kind === 'poly' && w.name !== 'Marcel').length;
}

/** Embaucher un polyvalent : moins cher, moins productif, il circule et relève. */
export function hirePoly(s: GameState, fi: number): Result {
  if (!factoryAt(s, fi)) return fail('usine');
  if (polyCount(s, fi) >= POLY.maxPerFactory) return fail('complet');
  const w = newWorker(s, fi, 'poly');
  s.workers.push(w);
  return ok(0, w.name);
}

/** Licencier un ouvrier précis (jamais Marcel). Son poste reste vacant. */
export function fire(s: GameState, id: number): Result {
  const w = s.workers.find((x) => x.id === id);
  if (!w || w.name === 'Marcel') return fail('personne');
  releaseWorker(s, w);
  const f = s.factories[w.factory];
  if (f) {
    if (w.kind === 'crank' && f.lines[w.line]) f.lines[w.line].crank = -1;
    if (w.kind === 'post') {
      const m = f.lines[w.line]?.slots[w.station];
      if (m && m.post === w.id) m.post = -1;
    }
  }
  s.workers.splice(s.workers.indexOf(w), 1);
  if (s.act >= 3) s.stats.laidOff++;
  return ok(0, w.name);
}

/**
 * Formation d'urgence : l'ouvrier attitré d'une machine qu'il ne sait pas encore conduire
 * peut être formé ou promu même à découvert (comme la maintenance) : on n'est jamais bloqué.
 */
export function urgent(s: GameState, w: Worker): boolean {
  if (w.kind !== 'post') return false;
  const m = s.factories[w.factory]?.lines[w.line]?.slots[w.station];
  return !!m && m.tier < ROBOT_TIER && w.level < TIER_OPERATOR_LEVEL[m.tier];
}

export function train(s: GameState, id: number): Result {
  const w = s.workers.find((x) => x.id === id);
  if (!w) return fail('personne');
  if (!canTrain(w)) return fail(w.state === 'train' ? 'absent' : 'max');
  const cost = trainingCost(s, w);
  if (s.money < cost && !urgent(s, w)) return fail('argent');
  startCourse(s, w, 'train');
  return ok(cost, w.name);
}

export function promote(s: GameState, id: number): Result {
  const w = s.workers.find((x) => x.id === id);
  if (!w) return fail('personne');
  if (!canPromote(w)) return fail('formations');
  const cost = promotionCost(s, w);
  if (s.money < cost && !urgent(s, w)) return fail('argent');
  startCourse(s, w, 'promote');
  return ok(cost, w.name);
}

export function roleAvailable(s: GameState, id: RoleId): boolean {
  const def = ROLES.find((r) => r.id === id)!;
  return s.act >= def.act;
}

export function hireRole(s: GameState, id: RoleId): Result {
  const def = ROLES.find((r) => r.id === id)!;
  if (s.roles[id]) return fail('déjà');
  if (!roleAvailable(s, id)) return fail('acte');
  if (!pay(s, def.cost)) return fail('argent');
  s.roles[id] = true;
  return ok(def.cost);
}

/** Congédier un rôle d'encadrement : on n'est jamais coincé par un salaire. */
export function dismissRole(s: GameState, id: RoleId): Result {
  if (!s.roles[id]) return fail('absent');
  s.roles[id] = false;
  return ok(0);
}

export function canteenCost(s: GameState): number {
  return CANTEEN_COST[Math.min(s.act, CANTEEN_COST.length - 1)];
}

export function buyCanteen(s: GameState): Result {
  if (s.act < 2) return fail('acte');
  if (s.canteen > 0) return fail('déjà');
  const c = canteenCost(s);
  if (!pay(s, c)) return fail('argent');
  s.canteen = 1;
  return ok(c);
}

// ---------------------------------------------------------------- Ingénieur méthodes

export function setMethodsTarget(s: GameState, station: number, tier: number): Result {
  if (station < 0 || station > 3 || tier < 0 || tier >= TIER_COUNT) return fail('consigne');
  s.methods.targets[station] = tier;
  return ok(0);
}

export function setMethodsBudget(s: GameState, k: number): Result {
  if (k < 0 || k >= METHODS.budgets.length) return fail('consigne');
  s.methods.budget = k;
  return ok(0);
}

export function setMethodsActive(s: GameState, on: boolean): Result {
  s.methods.active = on;
  return ok(0);
}

// ---------------------------------------------------------------- Équipement

/** Nombre de machines d'un poste dans l'usine. */
export function stationCount(f: Factory, st: number): number {
  return f.lines.filter((l) => l.slots[st]).length;
}

/** Palier d'une nouvelle machine : celui de la plus moderne de ce poste dans l'usine. */
export function newUnitTier(f: Factory, st: number): number {
  let t = 0;
  for (const l of f.lines) if (l.slots[st]) t = Math.max(t, l.slots[st]!.tier);
  return t;
}

export function addUnitCost(s: GameState, fi: number, st: number): number {
  const f = s.factories[fi];
  return Math.round(unitPrice(newUnitTier(f, st), st, stationCount(f, st)));
}

/** Acheter un poste : il s'ajoute à la première chaîne qui ne l'a pas encore. */
export function addUnit(s: GameState, fi: number, st: number, line = -1): Result {
  const f = factoryAt(s, fi);
  if (!f) return fail('usine');
  const l = line >= 0 && !f.lines[line]?.slots[st] ? line : f.lines.findIndex((x) => !x.slots[st]);
  if (l < 0) return fail('complet');
  const tier = newUnitTier(f, st);
  const cost = addUnitCost(s, fi, st);
  if (!pay(s, cost)) return fail('argent');
  f.lines[l].slots[st] = newMachine(tier);
  return ok(cost, String(l));
}

export function tierAllowed(s: GameState, tier: number): boolean {
  return tier < TIER_COUNT && s.research.tier >= tier && s.act >= TIER_MIN_ACT[tier];
}

/** La prochaine machine à moderniser pour ce poste : la moins moderne, dans l'ordre des chaînes. */
export function modernizeTarget(s: GameState, fi: number, st: number): { line: number; tier: number; cost: number } | null {
  const f = s.factories[fi];
  if (!f) return null;
  let best = -1;
  for (let l = 0; l < f.lines.length; l++) {
    const m = f.lines[l].slots[st];
    if (!m || !tierAllowed(s, m.tier + 1)) continue;
    if (best < 0 || m.tier < f.lines[best].slots[st]!.tier) best = l;
  }
  if (best < 0) return null;
  const m = f.lines[best].slots[st]!;
  return { line: best, tier: m.tier, cost: modernizeCost(m.tier, st, machineRank(f, best, st)) };
}

/** Moderniser une machine de ce poste (la moins moderne). Son ouvrier reste ; s'il n'a pas le niveau, elle attend sa promotion. */
export function modernize(s: GameState, fi: number, st: number): Result {
  const f = factoryAt(s, fi);
  const tgt = modernizeTarget(s, fi, st);
  if (!f || !tgt) return fail('recherche');
  if (s.money < tgt.cost) return fail('argent');
  modernizeMachine(s, f, tgt.line, st, machineRank(f, tgt.line, st));
  return ok(tgt.cost, String(tgt.line));
}

export function toolLevel(s: GameState, tier: number, st: number): number {
  return s.tooling[tier]?.[st] ?? 0;
}

/** Outillage : s'applique à toutes les machines de ce poste et de ce palier, dans toute la partie. */
export function upgradeTool(s: GameState, tier: number, st: number): Result {
  if (tier > s.research.tier) return fail('recherche');
  const lvl = toolLevel(s, tier, st);
  if (lvl >= TOOL_MAX) return fail('max');
  const cost = toolCost(tier, st, lvl);
  if (!pay(s, cost)) return fail('argent');
  s.tooling[tier][st] = lvl + 1;
  return ok(cost);
}

/** Paliers présents dans au moins une usine pour ce poste. */
export function tiersInUse(s: GameState, st: number): number[] {
  const set = new Set<number>();
  for (const f of s.factories) for (const l of f.lines) if (l.slots[st]) set.add(l.slots[st]!.tier);
  return [...set].sort((a, b) => a - b);
}

export function buyConveyor(s: GameState, fi: number, l: number): Result {
  const f = factoryAt(s, fi);
  const line = f?.lines[l];
  if (!f || !line) return fail('chaîne');
  if (line.conveyor) return fail('déjà');
  if (line.slots.filter(Boolean).length < 2) return fail('chaîne');
  const cost = conveyorCost(f, l);
  if (!pay(s, cost)) return fail('argent');
  line.conveyor = true;
  return ok(cost);
}

export function repairCost(s: GameState, fi: number, l: number, st: number): number {
  const f = s.factories[fi];
  const m = f.lines[l].slots[st]!;
  const share = s.research.workshop ? 0.08 : 0.25;
  return Math.round(unitPrice(m.tier, st, machineRank(f, l, st)) * share);
}

/** Maintenance : jamais refusée, quitte à s'endetter. */
export function repair(s: GameState, fi: number, l: number, st: number): Result {
  const m = s.factories[fi]?.lines[l]?.slots[st];
  if (!m || !m.broken || m.service > 0) return fail('état');
  const cost = repairCost(s, fi, l, st);
  s.money -= cost;
  m.service = s.research.workshop ? 20 : 60;
  m.serviceKind = 'repair';
  return ok(cost);
}

export function serviceCost(s: GameState, fi: number, l: number, st: number): number {
  const f = s.factories[fi];
  const m = f.lines[l].slots[st]!;
  return Math.round(unitPrice(m.tier, st, machineRank(f, l, st)) * 0.1);
}

/** Révision d'une machine usée (remise à zéro de l'usure). */
export function service(s: GameState, fi: number, l: number, st: number): Result {
  const m = s.factories[fi]?.lines[l]?.slots[st];
  if (!m || m.broken || m.service > 0 || m.tier === 0 || m.wear < 0.05) return fail('état');
  const cost = serviceCost(s, fi, l, st);
  s.money -= cost;
  m.service = 30;
  m.serviceKind = 'service';
  return ok(cost);
}

export function setMaterial(s: GameState, fi: number, mat: number): Result {
  const f = factoryAt(s, fi);
  if (!f || mat === f.material) return fail('même');
  if (!materialOk(s, f, mat)) return fail('matériau');
  for (const w of s.workers) if (w.factory === fi && (w.state === 'walk' || w.state === 'work' || w.state === 'carry')) releaseWorker(s, w);
  f.material = mat;
  for (const l of f.lines) l.buf = [0, 0, 0, 0];
  f.matChange = 60;
  return ok(0);
}

// ---------------------------------------------------------------- Usines

export function bestFactoryIndex(s: GameState): number {
  let best = 0;
  let bv = -1;
  s.factories.forEach((f, i) => {
    const v = factoryValue(f);
    if (v > bv) {
      bv = v;
      best = i;
    }
  });
  return best;
}

export function factoryCost(s: GameState, model?: number): number {
  return newFactoryCost(s, s.factories[model ?? bestFactoryIndex(s)]);
}

export function maxFactories(s: GameState): number {
  return ACTS[s.act].maxFactories;
}

/** Bâtir une usine équipée comme la meilleure (machines et convoyeurs, sans les ouvriers). */
export function buyFactory(s: GameState, model?: number): Result {
  if (s.factories.length >= maxFactories(s)) return fail('max');
  const src = s.factories[model ?? bestFactoryIndex(s)];
  const cost = newFactoryCost(s, src);
  if (!pay(s, cost)) return fail('argent');
  const f = newFactory(s.factories.length, src.material);
  f.lines = src.lines.map((l) => ({
    slots: l.slots.map((m) => (m ? newMachine(m.tier) : null)),
    buf: [0, 0, 0, 0],
    conveyor: l.conveyor,
    crank: -1,
    produced: 0,
  }));
  s.factories.push(f);
  return ok(cost);
}

/** Les ouvriers dont la machine exige un niveau qu'ils n'ont pas encore. */
export function unqualified(s: GameState, fi: number): Worker[] {
  const f = s.factories[fi];
  if (!f) return [];
  return s.workers.filter((w) => {
    if (w.factory !== fi || w.kind !== 'post') return false;
    const m = f.lines[w.line]?.slots[w.station];
    return !!m && m.tier < ROBOT_TIER && w.level < TIER_OPERATOR_LEVEL[m.tier];
  });
}

export const LINE_COUNT = LINES;
export const DOOR = DOOR_POS;

// ---------------------------------------------------------------- Équipe de nuit

export type NightKind = 'rate' | 'duration';

export function nightAvailable(s: GameState): boolean {
  return s.act >= NIGHT.act;
}

/** Renforcer l'équipe de nuit : rendement (+0,5 %) ou durée (+15 min). La durée suppose une équipe. */
export function upgradeNight(s: GameState, kind: NightKind): Result {
  if (!nightAvailable(s)) return fail('acte');
  const lvl = s.night[kind];
  if (lvl >= NIGHT[kind].max) return fail('max');
  if (kind === 'duration' && s.night.rate === 0) return fail('équipe');
  const cost = nightCost(kind, lvl);
  if (!pay(s, cost)) return fail('argent');
  s.night[kind] = lvl + 1;
  return ok(cost);
}

// ---------------------------------------------------------------- Énergie

export type EnergyKind = 'solar' | 'wind' | 'battery';
export function energyCost(s: GameState, kind: EnergyKind): number {
  return Math.round(ENERGY[kind].cost * Math.pow(ENERGY[kind].growth, s.energy[kind]));
}

export function buyEnergy(s: GameState, kind: EnergyKind): Result {
  if (s.act < ENERGY.act) return fail('acte');
  if (s.energy[kind] >= ENERGY.max[kind]) return fail('max');
  const cost = energyCost(s, kind);
  if (!pay(s, cost)) return fail('argent');
  s.energy[kind]++;
  return ok(cost);
}

// ---------------------------------------------------------------- Recherche

export type ResearchId = 'tier' | `mat:${number}` | 'workshop' | 'preventive' | 'predictive';

export function researchCost(s: GameState, id: ResearchId): number {
  if (id === 'tier') return TIER_RESEARCH[s.research.tier + 1] ?? Infinity;
  if (id.startsWith('mat:')) return MATERIALS[+id.slice(4)].research;
  return RESEARCH_EXTRA[id as keyof typeof RESEARCH_EXTRA].cost;
}

/** Recherche disponible maintenant (acte atteint, prérequis remplis, pas déjà faite). */
export function researchAvailable(s: GameState, id: ResearchId): boolean {
  if (id === 'tier') {
    const t = s.research.tier + 1;
    return t < TIER_COUNT && s.act >= TIER_MIN_ACT[t];
  }
  if (id.startsWith('mat:')) {
    const m = +id.slice(4);
    const def = MATERIALS[m];
    if (!def || s.research.materials[m]) return false;
    return s.act >= def.act && s.research.tier >= def.minTier;
  }
  const def = RESEARCH_EXTRA[id as keyof typeof RESEARCH_EXTRA];
  if (s.research[id as 'workshop' | 'preventive' | 'predictive']) return false;
  if (id === 'predictive' && !s.research.preventive) return false;
  return s.act >= def.act;
}

export function research(s: GameState, id: ResearchId): Result {
  if (!researchAvailable(s, id)) return fail('indisponible');
  const cost = researchCost(s, id);
  if (!pay(s, cost)) return fail('argent');
  if (id === 'tier') {
    s.research.tier++;
    const t = s.research.tier;
    for (let st = 0; st < 4; st++) s.tooling[t][st] = Math.max(s.tooling[t][st], Math.floor(s.tooling[t - 1][st] / 2));
  }
  else if (id.startsWith('mat:')) s.research.materials[+id.slice(4)] = true;
  else s.research[id as 'workshop' | 'preventive' | 'predictive'] = true;
  return ok(cost);
}

// ---------------------------------------------------------------- Marché

export function payDebt(s: GameState): Result {
  if (s.act !== 0 || s.debt <= 0) return fail('dette');
  if (s.money <= 0) return fail('argent');
  const p = Math.min(s.money, s.debt);
  s.money -= p;
  s.debt = Math.round((s.debt - p) * 100) / 100;
  if (s.debt <= 0.005) {
    s.debt = 0;
    startAct(s, 1);
  }
  return ok(p);
}

function startAct(s: GameState, act: number): void {
  s.stats.actEnd[s.act] = s.t;
  s.act = act;
  s.actT = 0;
  s.stats.revenueAct = 0;
  s.market.goalT = 0;
  s.market.goalReached = false;
  s.market.ferrumDone = [false, false, false];
  s.market.priceWar = 0;
  s.market.rateEma = 0;
  s.market.shareEma = 0;
  s.crisis = { active: null, until: 0, queue: [] };
  s.nextSpot = s.t + 30;
  s.nextLong = s.t + 90;
}

export function acceptSpot(s: GameState, id: number): Result {
  const c = s.spot.find((x) => x.id === id);
  if (!c || c.accepted) return fail('contrat');
  c.accepted = true;
  c.deadline = s.t + c.duration;
  return ok(0);
}

export function declineSpot(s: GameState, id: number): Result {
  const k = s.spot.findIndex((x) => x.id === id && !x.accepted);
  if (k < 0) return fail('contrat');
  s.spot.splice(k, 1);
  return ok(0);
}

/** Livre ce qui est en stock pour un contrat ponctuel. */
export function deliverSpot(s: GameState, id: number): Result {
  const c = s.spot.find((x) => x.id === id);
  if (!c || !c.accepted) return fail('contrat');
  const d = Math.min(s.stock[c.material], c.qty - c.delivered);
  if (d <= 0) return fail('stock');
  s.stock[c.material] -= d;
  c.delivered += d;
  return ok(0, String(d));
}

export function signLong(s: GameState, id: number): Result {
  const c = s.long.find((x) => x.id === id);
  if (!c || c.accepted) return fail('contrat');
  if (s.long.filter((x) => x.accepted).length >= CONTRACTS.maxLong) return fail('max');
  c.accepted = true;
  return ok(0);
}

export function endLong(s: GameState, id: number): Result {
  const k = s.long.findIndex((x) => x.id === id && x.accepted);
  if (k < 0) return fail('contrat');
  s.long.splice(k, 1);
  return ok(0);
}

// ---------------------------------------------------------------- Prestige

/** Savoir-faire que rapporterait un déménagement maintenant. */
export function pendingKnowHow(s: GameState): number {
  return knowHowGain(s.stats.revenueAct);
}

export function moveCapital(s: GameState): number {
  const value = s.factories.reduce((a, f) => a + factoryValue(f), 0);
  return Math.round(value * PRESTIGE.capitalShare * (1 + knowHow(s, 'capital')));
}

export function canMove(s: GameState): boolean {
  return s.market.goalReached && s.act >= 1 && s.act <= 3;
}

function resetSite(s: GameState, capital: number): void {
  const marcel = s.workers.find((w) => w.name === 'Marcel');
  s.factories = [newFactory(0)];
  s.workers = [];
  if (marcel) {
    Object.assign(marcel, {
      factory: 0, kind: 'poly', line: -1, station: -1, state: 'idle', tl: -1, ts: -1, carryLine: -1, carryTo: -1,
      pos: 1.5, from: 1.5, timer: 0, load: 0, rest: 0, course: 'none',
    });
    s.workers.push(marcel);
  }
  s.methods.active = false;
  s.stock = MATERIALS.map(() => 0);
  s.reserved = MATERIALS.map(() => 0);
  s.spot = [];
  s.long = [];
  for (const r of ROLES) s.roles[r.id] = false;
  s.canteen = 0;
  s.energy = { ...s.energy, solar: 0, wind: 0, battery: 0, charge: 0, factor: 1, cut: false };
  s.money = capital;
  s.reputation = Math.round(s.reputation * REPUTATION.keepOnMove);
  s.stats.moves++;
}

/** Déménagement vers le marché suivant (fin des actes I à III). */
export function move(s: GameState): Result {
  if (!canMove(s)) return fail('objectif');
  const gain = pendingKnowHow(s);
  const capital = moveCapital(s);
  s.knowHow.points += gain;
  s.stats.knowHowEarned += gain;
  resetSite(s, capital);
  startAct(s, s.act + 1);
  return ok(0, `${gain}`);
}

export function canBuyout(s: GameState): boolean {
  const g = ACTS[4].goal;
  return s.act === 4 && g.kind === 'cash' && s.money >= g.amount;
}

/** Rachat de Ferrum : fin de l'histoire, passage au bac à sable. */
export function buyout(s: GameState): Result {
  if (!canBuyout(s)) return fail('objectif');
  const g = ACTS[4].goal;
  if (g.kind !== 'cash') return fail('objectif');
  s.money -= g.amount;
  s.ended = true;
  s.ending = s.stats.laidOff > s.stats.retrained + 2 ? 'bitter' : 'warm';
  startAct(s, SANDBOX_ACT);
  return ok(g.amount);
}

/** Prestige facultatif du bac à sable : nouveau site, savoir-faire gagné. */
export function newSite(s: GameState): Result {
  if (s.act !== SANDBOX_ACT) return fail('acte');
  const gain = pendingKnowHow(s);
  if (gain < 1) return fail('gain');
  const capital = moveCapital(s);
  s.knowHow.points += gain;
  s.stats.knowHowEarned += gain;
  resetSite(s, capital);
  startAct(s, SANDBOX_ACT);
  return ok(0, `${gain}`);
}

export function buyKnowHow(s: GameState, id: KnowHowId): Result {
  const def = KNOW_HOW.find((k) => k.id === id)!;
  const lvl = s.knowHow.levels[id];
  if (lvl >= def.max) return fail('max');
  const cost = knowHowCost(id, lvl);
  if (s.knowHow.points < cost) return fail('points');
  s.knowHow.points -= cost;
  s.knowHow.levels[id] = lvl + 1;
  return ok(cost);
}

export const PROLOGUE_DEBT = PROLOGUE.debt;
