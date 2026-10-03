/**
 * Succès débloqués : gardés dans ce navigateur, d'une partie à l'autre (pas dans la sauvegarde).
 */
import { sfx } from '../audio/audio';
import type { GameState } from '../sim/types';
import { ACHIEVEMENTS } from '../story/achievements';
import { toast } from './toast';

const KEY = 'rouages-cie-succes';
let got: Record<string, number> | null = null;

function load(): Record<string, number> {
  if (got) return got;
  try {
    got = JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {};
  } catch {
    got = {};
  }
  return got!;
}

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(got ?? {}));
  } catch {
    /* stockage indisponible : les succès restent pour la session */
  }
}

export function unlocked(): Record<string, number> {
  return load();
}

/** Débloque un succès (une seule fois) et l'annonce. */
export function unlock(id: string): void {
  const g = load();
  if (g[id]) return;
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (!a) return;
  g[id] = Date.now();
  save();
  sfx('milestone');
  toast(`🏆 Succès : ${a.name}`);
}

/** Vérifie les succès lisibles dans la partie (quelques fois par seconde suffit). */
export function achievementsTick(s: GameState): void {
  const g = load();
  for (const a of ACHIEVEMENTS) if (a.check && !g[a.id] && a.check(s)) unlock(a.id);
}
