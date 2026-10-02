/** Moyennes glissantes des recettes et du bénéfice (€/s de jeu), pour l'afficheur et les onglets. */
import { estimateSite } from '../sim/analysis';
import type { GameState } from '../sim/types';

const TAU = 8;
let last: { s: GameState | null; t: number; rev: number } = { s: null, t: 0, rev: 0 };
let revenue = 0;
let net = 0;

/** À appeler à chaque image : met à jour les moyennes à partir de l'état. */
export function trackRates(s: GameState): void {
  if (last.s !== s || s.t < last.t) {
    last = { s, t: s.t, rev: s.stats.revenueTotal };
    // départ sur l'estimation en régime établi, puis la mesure prend le relais
    const e = estimateSite(s);
    revenue = e.revenue;
    net = e.net;
    return;
  }
  const dt = s.t - last.t;
  if (dt <= 0) return;
  const k = 1 - Math.exp(-dt / TAU);
  revenue += ((s.stats.revenueTotal - last.rev) / dt - revenue) * k;
  const f = s.flow;
  net += (f.revenue + f.contracts - f.raw - f.salaries - f.energy - f.maintenance - net) * k;
  last = { s, t: s.t, rev: s.stats.revenueTotal };
}

/** Recettes des ventes et contrats (€/s). */
export function revenueRate(): number {
  return Math.max(0, revenue);
}

/** Bénéfice d'exploitation (€/s) : recettes moins matière, salaires, énergie, maintenance. */
export function netRate(): number {
  return net;
}
