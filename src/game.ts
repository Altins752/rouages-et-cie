/** État d'exécution du jeu (hors simulation) : partie en cours, compte-tours, réglages. */
import { ACTS, TACHO } from './data/balance';
import { createGame } from './sim/state';
import type { GameState } from './sim/types';

export type Tab = 'atelier' | 'equipe' | 'rd' | 'marche' | 'donnees';
export type Theme = 'auto' | 'light' | 'dark';

export interface Settings {
  sound: boolean;
  fx: boolean;
  theme: Theme;
}

export const G = {
  s: createGame(1) as GameState,
  /** Régime du compte-tours (0–1). */
  rev: 0,
  speed: 1,
  pointerHeld: false,
  spaceHeld: false,
  tab: 'atelier' as Tab,
  factory: 0,
  /** Simulation suspendue (écran titre, fin). */
  paused: true,
  started: false,
  settings: { sound: true, fx: true, theme: 'auto' } as Settings,
  /** Instant réel de la dernière action du joueur (aide contextuelle). */
  lastInput: 0,
  finale: null as null | { t: number },
  /** Élément de la scène désigné par le bouton survolé dans le panneau (voir ui/panel). */
  highlight: null as string | null,
};

export function vmax(): number {
  return ACTS[Math.min(G.s.act, ACTS.length - 1)].vmax;
}

export function inRed(): boolean {
  return G.rev > TACHO.redZone;
}

/** Un clic : le régime monte, de moins en moins vite près du maximum. */
export function tapBoost(): void {
  G.rev = Math.min(1, G.rev + TACHO.tapGain * Math.sqrt(Math.max(0, 1 - G.rev)));
}

/** Avance le compte-tours en temps réel. */
export function tachoTick(rdt: number): void {
  const holding = G.pointerHeld || G.spaceHeld;
  if (holding && G.rev < TACHO.holdTarget) G.rev = Math.min(TACHO.holdTarget, G.rev + rdt * TACHO.holdRate);
  else if (!(holding && G.rev <= TACHO.holdTarget + 1e-6)) G.rev = Math.max(0, G.rev - rdt * (TACHO.decayBase + TACHO.decayQuad * G.rev * G.rev));
  G.speed = 1 + G.rev * (vmax() - 1);
}

const SETTINGS_KEY = 'rouages-cie-reglages';

export function loadSettings(): void {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) Object.assign(G.settings, JSON.parse(raw));
  } catch {
    /* réglages par défaut */
  }
}

export function saveSettings(): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(G.settings));
  } catch {
    /* stockage indisponible */
  }
}

export function newGame(): void {
  G.s = createGame((Date.now() % 2147483647) | 1);
  G.factory = 0;
  G.tab = 'atelier';
  G.rev = 0;
  G.finale = null;
}
