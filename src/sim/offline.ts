/**
 * Progression hors ligne. Une absence courte (onglet en arrière-plan) est rattrapée à plein
 * régime ; au-delà, seule l'équipe de nuit travaille : à son rendement, pendant sa durée.
 * La part de marché ne progresse pas hors ligne : on ne gagne pas un acte en dormant.
 */
import { NIGHT } from '../data/balance';
import { estimateSite } from './analysis';
import { step } from './engine';
import { nightDuration, nightRate } from './formulas';
import type { GameState, SimEvent } from './types';

/** Événements à garder pour l'histoire et les messages (les autres sont visuels). */
const important = (e: SimEvent): boolean => e.type !== 'piece' && e.type !== 'sale' && e.type !== 'scrap' && e.type !== 'goal';

export interface OfflineReport {
  /** Durée de l'absence (s réelles). */
  seconds: number;
  /** 'grace' : absence courte rattrapée en entier ; 'night' : équipe de nuit ; 'none' : rien n'a tourné. */
  mode: 'grace' | 'night' | 'none';
  /** Temps pendant lequel l'usine a travaillé, et à quel rendement. */
  worked: number;
  rate: number;
  produced: number;
  sold: number;
  money: number;
  breakdowns: number;
  /** Ce qu'aurait rapporté l'absence passée à jouer, au bénéfice actuel, moins ce qui a été gagné. */
  missed: number;
}

/** Fait tourner l'usine pendant `t` s de jeu, sans clic ni achat. */
function run(s: GameState, t: number, maxSteps: number): void {
  const dt = Math.max(0.25, t / maxSteps);
  let left = t;
  while (left > 1e-6) {
    const d = Math.min(dt, left);
    step(s, d, { red: false });
    if (s.fx.length > 200) s.fx = s.fx.filter(important);
    left -= d;
  }
}

export function catchUp(s: GameState, seconds: number, maxSteps = 20000): OfflineReport {
  const abs = Math.max(0, seconds);
  const p0 = s.stats.produced;
  const v0 = s.stats.sold;
  const m0 = s.money;
  const b0 = s.stats.breakdowns;
  const potential = Math.max(0, estimateSite(s).net) * abs;
  let mode: OfflineReport['mode'] = 'none';
  let worked = 0;
  let rate = 0;
  if (abs > 0 && abs <= NIGHT.grace) {
    mode = 'grace';
    worked = abs;
    rate = 1;
    run(s, abs, maxSteps);
  } else if (abs > 0 && nightRate(s) > 0) {
    mode = 'night';
    worked = Math.min(abs, nightDuration(s));
    rate = nightRate(s);
    // L'équipe de nuit tient une fraction de la cadence : autant de temps de jeu à plein régime.
    const mk = s.market;
    const keep = { goalT: mk.goalT, goalReached: mk.goalReached, shareEma: mk.shareEma, rateEma: mk.rateEma };
    run(s, worked * rate, maxSteps);
    Object.assign(mk, keep);
  }
  s.fx = s.fx.filter(important);
  const money = s.money - m0;
  return {
    seconds: abs, mode, worked, rate, money, missed: Math.max(0, potential - Math.max(0, money)),
    produced: s.stats.produced - p0, sold: s.stats.sold - v0, breakdowns: s.stats.breakdowns - b0,
  };
}
