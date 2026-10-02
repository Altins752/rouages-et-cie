/**
 * Sauvegarde locale versionnée. Chaque changement de format ajoute une migration
 * (version n → n + 1) : une partie existante n'est jamais cassée.
 */
import { SAVE_VERSION, createGame } from '../sim/state';
import type { GameState } from '../sim/types';

export const SAVE_KEY = 'rouages-cie-pc';

export interface SaveFile {
  version: number;
  /** Horodatage réel de la sauvegarde (ms), pour la progression hors ligne. */
  savedAt: number;
  state: GameState;
}

type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

/** migrations[n] transforme une partie de version n en version n + 1. */
export const migrations: Record<number, Migration> = {
  // v1 → v2 : les contrats ponctuels comptent leurs pièces dans la part de marché au fil de l'eau.
  1: (d) => {
    const st = d.state as { spot?: { delivered: number; counted?: number }[]; workers?: { rest?: number }[] };
    for (const c of st.spot ?? []) c.counted ??= c.delivered;
    for (const w of st.workers ?? []) w.rest ??= 0;
    return d;
  },
};

/** Complète récursivement les champs manquants avec les valeurs par défaut. */
function fill<T>(def: T, cur: unknown): T {
  if (Array.isArray(def)) return (Array.isArray(cur) ? cur : def) as T;
  if (def && typeof def === 'object') {
    const out: Record<string, unknown> = {};
    const c = (cur && typeof cur === 'object' ? cur : {}) as Record<string, unknown>;
    for (const k of Object.keys(def as object)) out[k] = fill((def as Record<string, unknown>)[k], c[k]);
    for (const k of Object.keys(c)) if (!(k in out)) out[k] = c[k];
    return out as T;
  }
  return (cur === undefined || cur === null || typeof cur !== typeof def ? def : cur) as T;
}

export function serialize(s: GameState, now: number): string {
  const fx = s.fx;
  s.fx = [];
  const out = JSON.stringify({ version: SAVE_VERSION, savedAt: now, state: s } satisfies SaveFile);
  s.fx = fx;
  return out;
}

export function deserialize(raw: string): SaveFile | null {
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!d || typeof d !== 'object' || typeof d.version !== 'number' || !d.state) return null;
  let v = d.version as number;
  if (v > SAVE_VERSION) return null;
  while (v < SAVE_VERSION) {
    const m = migrations[v];
    if (!m) return null;
    d = m(d);
    v++;
    d.version = v;
  }
  const state = fill(createGame(1), d.state) as GameState;
  state.fx = [];
  state.version = SAVE_VERSION;
  return { version: SAVE_VERSION, savedAt: typeof d.savedAt === 'number' ? d.savedAt : 0, state };
}

export function saveLocal(s: GameState, now: number): boolean {
  try {
    localStorage.setItem(SAVE_KEY, serialize(s, now));
    return true;
  } catch {
    return false;
  }
}

export function loadLocal(): SaveFile | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? deserialize(raw) : null;
  } catch {
    return null;
  }
}

export function hasSave(): boolean {
  try {
    return !!localStorage.getItem(SAVE_KEY);
  } catch {
    return false;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* stockage indisponible */
  }
}
