/**
 * Actions du joueur. Chaque action vérifie ses conditions, modifie l'état et
 * renvoie un résultat. Aucune action n'accède au DOM.
 */
import {
  ACTS, CANTEEN_COST, CONTRACTS, ENERGY, KNOW_HOW, MATERIALS, MAX_UNITS, MAX_WORKERS_PER_CHAIN, PRESTIGE,
  PROLOGUE, RESEARCH_EXTRA, REPUTATION, ROLES, SANDBOX_ACT, TIER_COUNT, TIER_MIN_ACT, TIER_RESEARCH, TOOL_MAX,
  TRAIN_COST, TRAIN_TIME, WEAR, DOOR_POS,
} from '../data/balance';
import type { KnowHowId, RoleId } from '../data/balance';
import { assignHomes, releaseWorker } from './engine';
import {
  chainValue, knowHow, knowHowCost, knowHowGain, materialOk, modernizeCost, newChainCost, toolCost, unitPrice,
} from './formulas';
import { newChain, newStation, newUnit, newWorker } from './state';
import type { Chain, GameState, Worker } from './types';

export type Result = { ok: true; cost?: number; info?: string } | { ok: false; reason: string };
const fail = (reason: string): Result => ({ ok: false, reason });
const ok = (cost?: number, info?: string): Result => ({ ok: true, cost, info });

function pay(s: GameState, cost: number): boolean {
  if (s.money < cost) return false;
  s.money -= cost;
  return true;
}

function chainAt(s: GameState, ci: number): Chain | null {
  return s.chains[ci] ?? null;
}

function refreshHomes(s: GameState, ci: number): void {
  if (s.roles.foreman && s.chains[ci]) assignHomes(s, ci);
}

// ---------------------------------------------------------------- Personnel

export function hire(s: GameState, ci: number): Result {
  if (!chainAt(s, ci)) return fail('chaîne');
  if (s.workers.filter((w) => w.chain === ci).length >= MAX_WORKERS_PER_CHAIN) return fail('complet');
  s.workers.push(newWorker(s, ci));
  refreshHomes(s, ci);
  return ok(0);
}

/** Licencie le dernier arrivé de la chaîne (jamais Marcel), de préférence inactif. */
export function fire(s: GameState, ci: number, id?: number): Result {
  const pool = s.workers.filter((w) => w.chain === ci && w.name !== 'Marcel');
  if (!pool.length) return fail('personne');
  let w: Worker | undefined = id !== undefined ? pool.find((x) => x.id === id) : undefined;
  if (!w) w = [...pool].reverse().find((x) => x.state === 'idle') ?? pool[pool.length - 1];
  releaseWorker(s, w);
  s.workers.splice(s.workers.indexOf(w), 1);
  if (s.act >= 3) s.stats.laidOff++;
  refreshHomes(s, ci);
  return ok(0, w.name);
}

export function trainCost(s: GameState, level: number): number {
  return Math.round(TRAIN_COST[level] * (1 - knowHow(s, 'training') * 0.5));
}

export function trainTime(s: GameState, level: number): number {
  return TRAIN_TIME[level] * (1 - knowHow(s, 'training'));
}

/** Forme un ouvrier de la chaîne au niveau `level` (depuis level − 1). */
export function train(s: GameState, ci: number, level: number, id?: number): Result {
  if (level < 2 || level > 4) return fail('niveau');
  if (level === 4 && s.act < 3) return fail('acte');
  if (level === 3 && s.act < 2) return fail('acte');
  const pool = s.workers.filter((w) => w.chain === ci && w.level === level - 1 && w.state !== 'train');
  if (!pool.length) return fail('personne');
  let w = id !== undefined ? pool.find((x) => x.id === id) : undefined;
  if (!w) w = pool.find((x) => x.state === 'idle') ?? pool[pool.length - 1];
  const cost = trainCost(s, level);
  if (!pay(s, cost)) return fail('argent');
  releaseWorker(s, w);
  w.state = 'train';
  w.timer = trainTime(s, level);
  w.trainTo = level;
  w.home = -1;
  refreshHomes(s, ci);
  return ok(cost, w.name);
}

export function moveWorker(s: GameState, id: number, toChain: number): Result {
  const w = s.workers.find((x) => x.id === id);
  if (!w || !chainAt(s, toChain) || w.chain === toChain) return fail('ouvrier');
  releaseWorker(s, w);
  const from = w.chain;
  w.chain = toChain;
  w.pos = DOOR_POS;
  w.from = DOOR_POS;
  w.home = -1;
  refreshHomes(s, from);
  refreshHomes(s, toChain);
  return ok(0);
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
  if (id === 'foreman') for (let i = 0; i < s.chains.length; i++) assignHomes(s, i);
  return ok(def.cost);
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

// ---------------------------------------------------------------- Équipement

export function addUnitCost(s: GameState, ci: number, si: number): number {
  const st = s.chains[ci].stations[si];
  return Math.round(unitPrice(st.tier, si, st.units.length + 1));
}

export function addUnit(s: GameState, ci: number, si: number): Result {
  const c = chainAt(s, ci);
  if (!c) return fail('chaîne');
  const st = c.stations[si];
  if (st.units.length >= MAX_UNITS) return fail('complet');
  const cost = addUnitCost(s, ci, si);
  if (!pay(s, cost)) return fail('argent');
  st.units.push(newUnit());
  refreshHomes(s, ci);
  return ok(cost);
}

export function upgradeTool(s: GameState, ci: number, si: number): Result {
  const c = chainAt(s, ci);
  if (!c) return fail('chaîne');
  const st = c.stations[si];
  if (st.tool >= TOOL_MAX) return fail('max');
  const cost = toolCost(st.tier, si, st.tool);
  if (!pay(s, cost)) return fail('argent');
  st.tool++;
  return ok(cost);
}

export function tierAllowed(s: GameState, tier: number): boolean {
  return tier < TIER_COUNT && s.research.tier >= tier && s.act >= TIER_MIN_ACT[tier];
}

export function modernize(s: GameState, ci: number, si: number): Result {
  const c = chainAt(s, ci);
  if (!c) return fail('chaîne');
  const st = c.stations[si];
  if (!tierAllowed(s, st.tier + 1)) return fail('recherche');
  const cost = modernizeCost(st, si);
  if (!pay(s, cost)) return fail('argent');
  for (const w of s.workers) if (w.chain === ci && w.ts === si) releaseWorker(s, w);
  c.stations[si] = newStation(st.tier + 1, st.units.length, 0);
  // Le matériau doit rester usinable : sinon retour à la fonte.
  if (!materialOk(s, c, c.material)) setMaterial(s, ci, 0);
  refreshHomes(s, ci);
  return ok(cost);
}

export function repairCost(s: GameState, ci: number, si: number, ui: number): number {
  const st = s.chains[ci].stations[si];
  const share = s.research.workshop ? WEAR.internalRepairShare : WEAR.externalRepairShare;
  return Math.round(unitPrice(st.tier, si, ui + 1) * share);
}

/** Maintenance : jamais refusée, quitte à s'endetter. */
export function repair(s: GameState, ci: number, si: number, ui: number): Result {
  const u = s.chains[ci]?.stations[si]?.units[ui];
  if (!u || !u.broken || u.service > 0) return fail('état');
  const cost = repairCost(s, ci, si, ui);
  s.money -= cost;
  u.service = s.research.workshop ? WEAR.internalRepairTime : WEAR.externalRepairTime;
  u.serviceKind = 'repair';
  return ok(cost);
}

export function serviceCost(s: GameState, ci: number, si: number, ui: number): number {
  const st = s.chains[ci].stations[si];
  return Math.round(unitPrice(st.tier, si, ui + 1) * WEAR.serviceShare);
}

/** Révision d'une machine usée (remise à zéro de l'usure). */
export function service(s: GameState, ci: number, si: number, ui: number): Result {
  const st = s.chains[ci]?.stations[si];
  const u = st?.units[ui];
  if (!st || !u || u.broken || u.service > 0 || st.tier === 0 || u.wear < 0.05) return fail('état');
  const cost = serviceCost(s, ci, si, ui);
  s.money -= cost;
  u.service = WEAR.serviceTime;
  u.serviceKind = 'service';
  return ok(cost);
}

export function setMaterial(s: GameState, ci: number, m: number): Result {
  const c = chainAt(s, ci);
  if (!c || m === c.material) return fail('même');
  if (!materialOk(s, c, m)) return fail('matériau');
  c.material = m;
  c.buf = [0, 0, 0, 0];
  for (const w of s.workers) if (w.chain === ci && (w.state === 'walk' || w.state === 'work')) {
    releaseWorker(s, w);
  }
  c.buf = [0, 0, 0, 0];
  c.matChange = 60;
  return ok(0);
}

// ---------------------------------------------------------------- Chaînes

export function bestChainIndex(s: GameState): number {
  let best = 0;
  let bv = -1;
  s.chains.forEach((c, i) => {
    const v = chainValue(c);
    if (v > bv) {
      bv = v;
      best = i;
    }
  });
  return best;
}

export function chainCost(s: GameState, model?: number): number {
  return newChainCost(s, s.chains[model ?? bestChainIndex(s)]);
}

export function maxChains(s: GameState): number {
  return ACTS[s.act].maxChains;
}

export function buyChain(s: GameState, model?: number): Result {
  if (s.chains.length >= maxChains(s)) return fail('max');
  const src = s.chains[model ?? bestChainIndex(s)];
  const cost = newChainCost(s, src);
  if (!pay(s, cost)) return fail('argent');
  const c = newChain(s.chains.length, src.material);
  c.stations = src.stations.map((st) => newStation(st.tier, st.units.length, st.tool));
  s.chains.push(c);
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
  if (id === 'tier') s.research.tier++;
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
  const value = s.chains.reduce((a, c) => a + chainValue(c), 0);
  return Math.round(value * PRESTIGE.capitalShare * (1 + knowHow(s, 'capital')));
}

export function canMove(s: GameState): boolean {
  return s.market.goalReached && s.act >= 1 && s.act <= 3;
}

function resetSite(s: GameState, capital: number): void {
  const marcel = s.workers.find((w) => w.name === 'Marcel');
  s.chains = [newChain(0)];
  s.workers = [];
  if (marcel) {
    Object.assign(marcel, { chain: 0, state: 'idle', ts: -1, tu: -1, pos: 1.5, from: 1.5, timer: 0, home: -1, load: 0 });
    s.workers.push(marcel);
  }
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
