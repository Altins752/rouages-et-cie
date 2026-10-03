/** Carnet de Marcel : les quêtes actives, en haut à droite de la scène, avec leur aide. */
import { G } from '../game';
import { QUESTS, activeQuests, questReward } from '../story/quests';
import { $, esc } from './dom';
import { fmt } from './format';
import { startGuide } from './guide';

let lastSig = '';
let collapsed = false;

function box(): HTMLElement {
  let el = document.getElementById('quests');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'quests';
  el.className = 'quests';
  el.setAttribute('aria-label', 'Carnet de Marcel : quêtes en cours');
  $('stage').appendChild(el);
  el.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const help = t.closest<HTMLElement>('[data-q]');
    if (help) {
      const q = QUESTS.find((x) => x.id === help.dataset.q);
      if (q) startGuide(q.help, { title: `Marcel · ${q.label}` });
      return;
    }
    if (t.closest('.q-head')) {
      collapsed = !collapsed;
      lastSig = '';
      updateQuests();
    }
  });
  // le carnet ne doit pas accélérer le temps comme un clic sur l'usine
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  return el;
}

/** Met à jour le carnet (appelé quelques fois par seconde). */
export function updateQuests(): void {
  const s = G.s;
  const list = G.started ? activeQuests(s) : [];
  const el = box();
  const sig = `${s.act}|${collapsed}|${list.map((q) => q.id).join(',')}`;
  if (sig === lastSig) return;
  lastSig = sig;
  el.classList.toggle('show', list.length > 0);
  if (!list.length) return;
  let h = `<button type="button" class="q-head" aria-expanded="${!collapsed}">Carnet de Marcel <span>${collapsed ? '▸' : '▾'}</span></button>`;
  if (!collapsed) {
    h += '<ul>';
    for (const q of list) {
      const r = questReward(q);
      const reward = q.goal ? 'objectif' : r.tool ? 'outillage offert' : `+${fmt(r.money)} €`;
      h += `<li class="${q.goal ? 'goal' : ''}"><span class="q-box" aria-hidden="true">${q.goal ? '★' : '☐'}</span><span class="q-l">${esc(q.label)}<small>${reward}</small></span><button type="button" class="q-help" data-q="${q.id}" title="Aide Marcel : comment faire" aria-label="Aide Marcel : ${esc(q.label)}">?</button></li>`;
    }
    h += '</ul>';
  }
  el.innerHTML = h;
}

/** Force le prochain rafraîchissement (nouvelle partie, chargement). */
export function resetQuests(): void {
  lastSig = '';
}
