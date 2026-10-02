import { ENERGY } from '../data/balance';

/** Phase de la journée (0 = aube, 0,25 = midi, 0,5 = crépuscule, 0,75 = minuit). */
export function dayPhase(t: number): number {
  return (t / ENERGY.dayLength + 0.08) % 1;
}

/** Ensoleillement 0–1. */
export function daylight(t: number): number {
  return Math.max(0, Math.sin(dayPhase(t) * Math.PI * 2));
}

/** Lumière ambiante 0 (nuit) – 1 (plein jour), adoucie pour le rendu. */
export function ambient(t: number): number {
  const s = Math.sin(dayPhase(t) * Math.PI * 2);
  return Math.min(1, Math.max(0, 0.5 + s * 1.4));
}

/** Vent 0–1, déterministe. */
export function windFactor(t: number): number {
  const v = 0.5 + 0.5 * Math.sin(t / 37) * Math.sin(t / 91 + 1);
  return ENERGY.wind.min + (1 - ENERGY.wind.min) * v;
}
