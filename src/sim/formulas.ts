import {
  ACTS, CONVEYOR, CYCLE, FACTORY_COPY_FACTOR, FERRUM, HALL_GROWTH, KNOW_HOW, MARCEL_PRODUCTIVITY, MATERIALS,
  MATERIAL_STATION_SHARE, MORALE, NIGHT, POLY, TRAITS, PRESTIGE, PROMOTION, REPUTATION, RESALE, ROBOT_TIER, SCRAP, TOOL_COST_FACTOR,
  TOOL_COST_GROWTH, TOOL_GAIN, TOOL_TAU, TRAINING, UNIT_GROWTH, UNIT_PRICE,
} from '../data/balance';
import type { KnowHowId } from '../data/balance';
import type { Factory, GameState, Worker } from './types';

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

export function knowHow(s: GameState, id: KnowHowId): number {
  const def = KNOW_HOW.find((k) => k.id === id)!;
  return (s.knowHow.levels[id] ?? 0) * def.per;
}

export function matFactor(station: number, k: number): number {
  return 1 + (k - 1) * MATERIAL_STATION_SHARE[station];
}

/** Gain de vitesse de l'outillage au niveau n. */
export function toolSpeed(n: number): number {
  return 1 + TOOL_GAIN * (1 - Math.exp(-n / TOOL_TAU));
}

/** Temps de cycle d'une machine (palier, poste) dans une usine, sans l'ouvrier. */
export function machineCycle(s: GameState, material: number, tier: number, station: number): number {
  const k = MATERIALS[material].k;
  const tool = s.tooling[tier]?.[station] ?? 0;
  return (CYCLE[tier][station] * matFactor(station, k)) / toolSpeed(tool) / (1 + knowHow(s, 'cadence'));
}

export function moraleActive(s: GameState): boolean {
  return s.act >= MORALE.act;
}

export function moraleFactor(s: GameState, w: Worker): number {
  if (!moraleActive(s)) return 1;
  return MORALE.floor + (1 - MORALE.floor) * w.morale;
}

export function moraleCap(s: GameState): number {
  return Math.min(1, MORALE.cap + (s.canteen > 0 ? MORALE.canteenCap : 0));
}

/** Productivité propre d'un ouvrier (formations, polyvalence), hors moral. */
export function trait(w: Worker): (typeof TRAITS)[number] {
  return TRAITS.find((t) => t.id === (w.trait ?? '')) ?? TRAITS[0];
}

export function skill(w: Worker): number {
  const base = w.name === 'Marcel' && w.kind === 'poly' ? MARCEL_PRODUCTIVITY : w.kind === 'poly' ? POLY.productivity : 1;
  return base * trait(w).speed * (1 + TRAINING.perTraining * w.trained);
}

export function workerSpeed(s: GameState, w: Worker): number {
  return skill(w) * moraleFactor(s, w);
}

// ------------------------------------------------------------------ Prix

/** Prix d'une machine (palier, poste) au rang `rank` (0 = première de ce type dans l'usine). */
export function unitPrice(tier: number, station: number, rank: number): number {
  return UNIT_PRICE[tier][station] * Math.pow(UNIT_GROWTH, Math.max(0, rank));
}

export function toolCost(tier: number, station: number, level: number): number {
  return Math.round(UNIT_PRICE[tier][station] * TOOL_COST_FACTOR * Math.pow(TOOL_COST_GROWTH, level));
}

/** Moderniser la machine du rang `rank` : prix du palier suivant moins la revente. */
export function modernizeCost(tier: number, station: number, rank: number): number {
  return Math.max(1, Math.round(unitPrice(tier + 1, station, rank) - RESALE * unitPrice(tier, station, rank)));
}

export function conveyorCount(f: Factory): number {
  return f.lines.filter((l) => l.conveyor).length;
}

/** Prix du convoyeur d'une chaîne : il vaut ce que vaut la chaîne qu'il sert. */
export function conveyorCost(f: Factory, l: number): number {
  let v = 0;
  f.lines[l].slots.forEach((m, st) => {
    if (m) v += unitPrice(m.tier, st, 0);
  });
  return Math.round(Math.max(CONVEYOR.min, v * CONVEYOR.share));
}

/** Valeur d'achat de l'équipement d'une usine. */
export function factoryValue(f: Factory): number {
  let v = 0;
  for (let st = 0; st < 4; st++) {
    let rank = 0;
    for (const l of f.lines) {
      const m = l.slots[st];
      if (m) v += unitPrice(m.tier, st, rank++);
    }
  }
  return v + f.lines.reduce((a, _, l) => a + (f.lines[l].conveyor ? conveyorCost(f, l) : 0), 0);
}

export function hallCost(s: GameState, factoriesAfter: number): number {
  const act = ACTS[s.act];
  return act.hall * Math.pow(HALL_GROWTH, Math.max(0, factoriesAfter - 2)) * (1 - knowHow(s, 'hall'));
}

export function newFactoryCost(s: GameState, model: Factory): number {
  return Math.round(factoryValue(model) * FACTORY_COPY_FACTOR + hallCost(s, s.factories.length + 1));
}

// ------------------------------------------------------------------ Équipe de nuit

/** Part de la cadence normale tenue par l'équipe de nuit (0 avant l'acte II ou sans niveau). */
export function nightRate(s: GameState): number {
  return s.act >= NIGHT.act ? s.night.rate * NIGHT.rate.per : 0;
}

/** Temps de travail maximal de l'équipe de nuit pendant une absence (s). */
export function nightDuration(s: GameState): number {
  return s.act >= NIGHT.act && s.night.rate > 0 ? NIGHT.duration.base + s.night.duration * NIGHT.duration.per : 0;
}

export function nightCost(kind: 'rate' | 'duration', level: number): number {
  const d = NIGHT[kind];
  return Math.round(d.cost * Math.pow(d.growth, level));
}

export function trainingCost(s: GameState, w: Worker): number {
  return Math.round(TRAINING.cost[w.level] * Math.pow(TRAINING.growth, w.trainings) * (1 - knowHow(s, 'training') * 0.5) * trait(w).training);
}

export function trainingTime(s: GameState, w: Worker): number {
  return TRAINING.time[w.level] * (1 - knowHow(s, 'training')) * trait(w).training;
}

export function promotionCost(s: GameState, w: Worker): number {
  return Math.round((PROMOTION.cost[w.level + 1] ?? Infinity) * (1 - knowHow(s, 'training') * 0.5));
}

export function promotionTime(s: GameState, w: Worker): number {
  return (PROMOTION.time[w.level + 1] ?? 0) * (1 - knowHow(s, 'training'));
}

export function canTrain(w: Worker): boolean {
  return w.state !== 'train' && w.trainings < TRAINING.perLevel;
}

export function canPromote(w: Worker): boolean {
  return w.state !== 'train' && w.trainings >= TRAINING.perLevel && w.level < 4;
}

// ------------------------------------------------------------------ Marché

export function repLevel(s: GameState): number {
  return Math.floor(s.reputation / REPUTATION.perLevel);
}

/** Multiplicateur appliqué au prix de base des écrous. */
export function priceMult(s: GameState): number {
  const war = s.market.priceWar > 0 ? FERRUM.priceWar.factor : 1;
  return (1 + repLevel(s) * REPUTATION.pricePerLevel) * (1 + knowHow(s, 'price')) * war;
}

export function scrapRate(f: Factory, controlTier: number, red: boolean): number {
  let r = SCRAP.base;
  if (red) r += SCRAP.redZone;
  if (f.matChange > 0) r += SCRAP.materialChange;
  return r * SCRAP.tierFactor[controlTier];
}

export function knowHowGain(revenue: number): number {
  if (revenue <= 0) return 0;
  return Math.floor(Math.pow(revenue / PRESTIGE.divisor, PRESTIGE.exponent));
}

export function knowHowCost(id: KnowHowId, level: number): number {
  const def = KNOW_HOW.find((k) => k.id === id)!;
  return def.base * (level + 1);
}

/** Le matériau peut-il être usiné : toutes les frappes et tous les taraudages au palier requis. */
export function materialOk(s: GameState, f: Factory, m: number): boolean {
  if (m === 0) return true;
  if (!s.research.materials[m]) return false;
  const min = MATERIALS[m].minTier;
  for (const l of f.lines) for (const st of [1, 2]) {
    const mc = l.slots[st];
    if (mc && mc.tier < min) return false;
  }
  return true;
}

export function robotFactory(f: Factory): boolean {
  return f.lines.some((l) => l.slots.some((m) => m && m.tier === 3));
}

/** Le convoyeur d'une chaîne sert-il (au moins un poste tenu par un humain) ? */
export function crankUseful(line: Factory['lines'][number]): boolean {
  return line.conveyor && line.slots.some((m) => m && m.tier < ROBOT_TIER);
}

export function lineComplete(f: Factory, l: number): boolean {
  return f.lines[l].slots.every((m) => m !== null);
}
