/** Pages du carnet du grand-père trouvées : gardées dans ce navigateur, d'une partie à l'autre. */
import { sfx } from '../audio/audio';
import type { GameState } from '../sim/types';
import { PAGES } from '../story/notebook';
import { toast } from './toast';

const KEY = 'rouages-cie-carnet';
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

export function pagesFound(): Record<string, number> {
  return load();
}

/** Vérifie les pages à trouver (quelques fois par seconde). */
export function notebookTick(s: GameState): void {
  const g = load();
  for (const p of PAGES) {
    if (g[p.id] || !p.when(s)) continue;
    g[p.id] = Date.now();
    try {
      localStorage.setItem(KEY, JSON.stringify(g));
    } catch {
      /* stockage indisponible */
    }
    sfx('research');
    toast(`📖 Une page du carnet du grand-père : « ${p.title} » (menu)`);
  }
}
