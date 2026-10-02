/** Progression hors ligne : le temps passe à vitesse ×1, sans clic ni achat. */
import { OFFLINE_CAP } from '../data/balance';
import { step } from './engine';
import type { GameState } from './types';

export interface OfflineReport {
  seconds: number;
  produced: number;
  sold: number;
  money: number;
  breakdowns: number;
}

export function catchUp(s: GameState, seconds: number, maxSteps = 20000): OfflineReport {
  const t = Math.min(Math.max(0, seconds), OFFLINE_CAP);
  const p0 = s.stats.produced;
  const v0 = s.stats.sold;
  const m0 = s.money;
  const b0 = s.stats.breakdowns;
  if (t > 0) {
    const dt = Math.max(0.25, t / maxSteps);
    let left = t;
    while (left > 1e-6) {
      const d = Math.min(dt, left);
      step(s, d, { red: false });
      if (s.fx.length > 200) s.fx.length = 0;
      left -= d;
    }
  }
  s.fx.length = 0;
  return { seconds: t, produced: s.stats.produced - p0, sold: s.stats.sold - v0, money: s.money - m0, breakdowns: s.stats.breakdowns - b0 };
}
