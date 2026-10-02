import type { GameState } from './types';

/** Générateur mulberry32 dont l'état vit dans la partie (sauvegardé, déterministe). */
export function rand(s: GameState): number {
  let t = (s.rng = (s.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randRange(s: GameState, a: number, b: number): number {
  return a + (b - a) * rand(s);
}

export function randInt(s: GameState, n: number): number {
  return Math.floor(rand(s) * n);
}
