/** Onglet Données : le tableau de bord commence vide et se remplit avec les rôles recrutés. */
import { ROLES } from '../data/balance';
import type { GameState } from '../sim/types';
import type { View } from './panel';
import { ROLE_DATA, ROLE_NAMES } from './text';

export function dataView(s: GameState): View {
  const sig = `D${Object.values(s.roles).map(Number).join('')}`;
  let h = '<div class="note">Sans encadrement, vous ne voyez que la caisse et le stock : l’usine se lit aux tas de pièces. Chaque rôle recruté (onglet Équipe) ajoute ses données ici.</div>';
  for (const r of ROLES) {
    h += `<div class="card ${s.roles[r.id] ? '' : 'dim'}"><div class="ic" aria-hidden="true">${s.roles[r.id] ? '📊' : '🔒'}</div><div class="info"><div class="nm">${ROLE_NAMES[r.id]}</div><div class="vis">${ROLE_DATA[r.id]}</div></div></div>`;
  }
  return { sig, html: h, k: {}, d: {}, w: {} };
}
