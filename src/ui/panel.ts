/**
 * Panneau de gestion : onglets reconstruits seulement quand leur structure change
 * (signature), valeurs mises à jour en place (data-k texte, data-b désactivé, data-w jauges).
 */
import { sfx } from '../audio/audio';
import { G } from '../game';
import type { Tab } from '../game';
import { $ } from './dom';
import { VIEWS, onPanelAction, tabAlerts, tabLocked } from './views';

export interface View {
  sig: string;
  html: string;
  k: Record<string, string>;
  d: Record<string, boolean>;
  w: Record<string, number>;
  /** Classes à basculer : data-c="clé" → { clé: [classe, actif] } */
  c?: Record<string, [string, boolean]>;
  after?: (list: HTMLElement) => void;
}

type ListEl = HTMLElement & {
  _sig?: string | null;
  _els?: { k: HTMLElement[]; b: HTMLButtonElement[]; w: HTMLElement[]; c: HTMLElement[] };
};

function apply(L: ListEl, v: View): void {
  if (L._sig !== v.sig) {
    L._sig = v.sig;
    const st = L.scrollTop;
    const focusKey = (document.activeElement as HTMLElement | null)?.dataset?.fk;
    L.innerHTML = v.html;
    L.scrollTop = st;
    L._els = {
      k: [...L.querySelectorAll<HTMLElement>('[data-k]')],
      b: [...L.querySelectorAll<HTMLButtonElement>('[data-b]')],
      w: [...L.querySelectorAll<HTMLElement>('[data-w]')],
      c: [...L.querySelectorAll<HTMLElement>('[data-c]')],
    };
    if (focusKey) L.querySelector<HTMLElement>(`[data-fk="${focusKey}"]`)?.focus();
  }
  const E = L._els!;
  for (const e of E.k) {
    const x = v.k[e.dataset.k!];
    if (x !== undefined && (e as HTMLElement & { _v?: string })._v !== x) {
      (e as HTMLElement & { _v?: string })._v = x;
      e.textContent = x;
    }
  }
  for (const e of E.b) {
    const x = !!v.d[e.dataset.b!];
    if (e.disabled !== x) e.disabled = x;
  }
  for (const e of E.w) {
    const x = v.w[e.dataset.w!];
    if (x === undefined) continue;
    const s = `${(Math.max(0, Math.min(1, x)) * 100).toFixed(1)}%`;
    if (e.style.width !== s) e.style.width = s;
  }
  if (v.c) for (const e of E.c) {
    const x = v.c[e.dataset.c!];
    if (x) e.classList.toggle(x[0], x[1]);
  }
  v.after?.(L);
}

export function renderPanel(): void {
  const L = $('list') as ListEl;
  apply(L, VIEWS[G.tab](G.s));
  const alerts = tabAlerts(G.s);
  document.querySelectorAll<HTMLButtonElement>('#tabs button').forEach((b) => {
    const t = b.dataset.t as Tab;
    const on = t === G.tab;
    b.setAttribute('aria-selected', on ? 'true' : 'false');
    b.tabIndex = on ? 0 : -1;
    b.classList.toggle('alert-on', !!alerts[t] && !on);
    b.classList.toggle('locked', tabLocked(G.s, t));
  });
}

export function setTab(t: Tab): void {
  if (G.tab === t) return;
  G.tab = t;
  const L = $('list') as ListEl;
  L._sig = null;
  L.scrollTop = 0;
  sfx('click');
  renderPanel();
}

export function invalidatePanel(): void {
  ($('list') as ListEl)._sig = null;
}

export function initPanel(): void {
  $('tabs').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-t]');
    if (b) setTab(b.dataset.t as Tab);
  });
  $('tabs').addEventListener('keydown', (e) => {
    const order: Tab[] = ['atelier', 'equipe', 'rd', 'marche', 'donnees'];
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const i = order.indexOf(G.tab);
    const n = order[(i + (e.key === 'ArrowRight' ? 1 : 4)) % 5];
    setTab(n);
    document.querySelector<HTMLElement>(`#tabs button[data-t="${n}"]`)?.focus();
    e.preventDefault();
  });
  $('list').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!b || (b as HTMLButtonElement).disabled) return;
    onPanelAction(b.dataset.act!, b.dataset);
    renderPanel();
  });
}
