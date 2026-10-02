import {
  ACTS, CHAIN_COPY_FACTOR, CYCLE, HALL_GROWTH, KNOW_HOW, MATERIALS, MATERIAL_STATION_SHARE, MORALE,
  PRESTIGE, REPUTATION, RESALE, SCRAP, SPEC_MAX, SPEC_STEP, SPEC_STEP_TIME, TOOL_COST_FACTOR,
  TOOL_SPEED, UNIT_GROWTH, UNIT_PRICE, FERRUM,
} from '../data/balance';
import type { KnowHowId } from '../data/balance';
import type { Chain, GameState, Station, Worker } from './types';

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

export function knowHow(s: GameState, id: KnowHowId): number {
  const def = KNOW_HOW.find((k) => k.id === id)!;
  return (s.knowHow.levels[id] ?? 0) * def.per;
}

export function matFactor(station: number, k: number): number {
  return 1 + (k - 1) * MATERIAL_STATION_SHARE[station];
}

/** Temps de cycle d'une unité du poste, sans l'ouvrier. */
export function stationCycle(s: GameState | null, chain: Pick<Chain, 'material'>, st: Pick<Station, 'tier' | 'tool'>, station: number): number {
  const k = MATERIALS[chain.material].k;
  const bonus = s ? 1 + knowHow(s, 'cadence') : 1;
  return (CYCLE[st.tier][station] * matFactor(station, k)) / Math.pow(TOOL_SPEED, st.tool) / bonus;
}

export function specBonus(w: Worker, station: number): number {
  return Math.min(SPEC_MAX, Math.floor(w.spec[station] / SPEC_STEP_TIME) * SPEC_STEP);
}

export function moraleFactor(s: GameState, w: Worker): number {
  if (!moraleActive(s)) return 1;
  return MORALE.floor + (1 - MORALE.floor) * w.morale;
}

export function moraleActive(s: GameState): boolean {
  return s.act >= MORALE.act;
}

export function moraleCap(s: GameState): number {
  return Math.min(1, MORALE.cap + (s.canteen > 0 ? MORALE.canteenCap : 0));
}

export function unitPrice(tier: number, station: number, n: number): number {
  return UNIT_PRICE[tier][station] * Math.pow(UNIT_GROWTH, Math.max(0, n - 1));
}

/** Valeur d'achat cumulée des unités d'un poste. */
export function stationValue(st: Station, station: number): number {
  let v = 0;
  for (let n = 1; n <= st.units.length; n++) v += unitPrice(st.tier, station, n);
  return v;
}

export function chainValue(c: Chain): number {
  return c.stations.reduce((a, st, i) => a + stationValue(st, i), 0);
}

export function toolCost(tier: number, station: number, level: number): number {
  return Math.round(UNIT_PRICE[tier][station] * TOOL_COST_FACTOR * Math.pow(2, level));
}

export function modernizeCost(st: Station, station: number): number {
  let c = 0;
  for (let n = 1; n <= st.units.length; n++) {
    c += unitPrice(st.tier + 1, station, n) - RESALE * unitPrice(st.tier, station, n);
  }
  return Math.max(1, Math.round(c));
}

export function hallCost(s: GameState, chainsAfter: number): number {
  const act = ACTS[s.act];
  return act.hall * Math.pow(HALL_GROWTH, Math.max(0, chainsAfter - 2)) * (1 - knowHow(s, 'hall'));
}

export function newChainCost(s: GameState, model: Chain): number {
  return Math.round(chainValue(model) * CHAIN_COPY_FACTOR + hallCost(s, s.chains.length + 1));
}

export function repLevel(s: GameState): number {
  return Math.floor(s.reputation / REPUTATION.perLevel);
}

/** Multiplicateur appliqué au prix de base des écrous. */
export function priceMult(s: GameState): number {
  const war = s.market.priceWar > 0 ? FERRUM.priceWar.factor : 1;
  return (1 + repLevel(s) * REPUTATION.pricePerLevel) * (1 + knowHow(s, 'price')) * war;
}

export function scrapRate(c: Chain, red: boolean): number {
  const tier = c.stations[3].tier;
  let r = SCRAP.base;
  if (red) r += SCRAP.redZone;
  if (c.matChange > 0) r += SCRAP.materialChange;
  return r * SCRAP.tierFactor[tier];
}

export function knowHowGain(revenue: number): number {
  if (revenue <= 0) return 0;
  return Math.floor(Math.pow(revenue / PRESTIGE.divisor, PRESTIGE.exponent));
}

export function knowHowCost(id: KnowHowId, level: number): number {
  const def = KNOW_HOW.find((k) => k.id === id)!;
  return def.base * (level + 1);
}

/** Le matériau peut-il être usiné par cette chaîne ? */
export function materialOk(s: GameState, c: Chain, m: number): boolean {
  if (m === 0) return true;
  if (!s.research.materials[m]) return false;
  const min = MATERIALS[m].minTier;
  return c.stations[1].tier >= min && c.stations[2].tier >= min;
}

export function robotChain(c: Chain): boolean {
  return c.stations.some((st) => st.tier === 3);
}
