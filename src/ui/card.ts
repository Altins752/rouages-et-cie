/**
 * Carte d'actions : un clic sur une machine, un emplacement, un ouvrier, une chaîne ou une usine
 * ouvre une petite carte accrochée à l'entité. Mêmes actions, mêmes verbes, mêmes prix que le panneau.
 * Elle reste ouverte après une action et se met à jour en direct ; Échap ou un clic ailleurs la ferme.
 */
import { TIER_COUNT, TIER_MIN_ACT, TIER_OPERATOR_LEVEL, TOOL_MAX, TRAINING } from '../data/balance';
import { G } from '../game';
import type { Tab } from '../game';
import { estimateFactory } from '../sim/analysis';
import * as A from '../sim/actions';
import { salaryOf } from '../sim/engine';
import { canPromote, canTrain, conveyorCost, promotionCost, toolCost, trainingCost } from '../sim/formulas';
import type { Worker } from '../sim/types';
import * as U from './actions';
import { $ } from './dom';
import { fmt, pct, perMin } from './format';
import { waitText } from './panel';
import { netRate } from './rates';
import { KIND_NAMES, LEVEL_NAMES, MACHINE_NAMES, MATERIAL_NAMES, STATION_NAMES, TIER_NAMES, TRAIT_NAMES } from './text';

export type CardRef =
  | { kind: 'machine' | 'slot'; fi: number; l: number; st: number }
  | { kind: 'chain'; fi: number; l: number }
  | { kind: 'worker'; id: number }
  | { kind: 'factory'; fi: number };

interface Act {
  id: string;
  /** Verbe de l'action (repris dans le message de confirmation). */
  label: string;
  small?: string;
  /** Prix : affiché, et délai d'attente si la caisse ne suffit pas. */
  cost?: number;
  /** Raison du grisé (prioritaire sur le prix). */
  off?: string;
  /** Avertissement sous le bouton. */
  warn?: string;
  /** Action à confirmer d'un second clic (licencier). */
  confirm?: boolean;
  /** Payable même à découvert (maintenance, formation d'urgence). */
  debt?: boolean;
  run: () => void;
}

interface View {
  title: string;
  sub: string;
  rows: [string, string][];
  acts: Act[];
  tab: Tab;
}

interface Hooks {
  focusFactory: (fi: number) => void;
  setTab: (t: Tab) => void;
  enterHall: (fi: number) => void;
}

let ref: CardRef | null = null;
let hooks: Hooks | null = null;
let acts: Act[] = [];
let lastHtml = '';
let confirmId = '';
let confirmUntil = 0;

export function setCardHooks(h: Hooks): void {
  hooks = h;
}

export function cardRef(): CardRef | null {
  return ref;
}

export function cardOpen(): boolean {
  return !!ref;
}

const el = () => $('ecard');

export function openCard(r: CardRef): void {
  ref = r;
  confirmId = '';
  lastHtml = '';
  el().classList.add('show');
  refreshCard();
}

export function closeCard(): void {
  if (!ref) return;
  ref = null;
  el().classList.remove('show');
  el().innerHTML = '';
  lastHtml = '';
}

/** Élément à mettre en valeur dans la scène tant que la carte est ouverte. */
export function cardHighlight(): string | null {
  if (!ref) return null;
  switch (ref.kind) {
    case 'machine':
    case 'slot':
      return `m:${ref.fi}:${ref.l}:${ref.st}`;
    case 'chain':
      return `c:${ref.fi}:${ref.l}`;
    case 'worker':
      return `w:${ref.id}`;
    case 'factory':
      return `c:${ref.fi}:-1`;
  }
}

/** Place la carte près de l'entité (px du stage), sans déborder. */
export function placeCard(x: number, y: number, sw: number, sh: number): void {
  if (!ref) return;
  const e = el();
  const w = e.offsetWidth || 280;
  const h = e.offsetHeight || 200;
  let left = x + 28;
  if (left + w > sw - 8) left = x - w - 28;
  left = Math.max(8, Math.min(sw - w - 8, left));
  const top = Math.max(8, Math.min(sh - h - 8, y - 30));
  e.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

// ------------------------------------------------------------------ Contenu

function crewName(id: number): Worker | undefined {
  return G.s.workers.find((w) => w.id === id);
}

function tierReason(tier: number): string {
  const s = G.s;
  const next = tier + 1;
  if (next >= TIER_COUNT) return 'palier maximal';
  if (s.act < TIER_MIN_ACT[next]) return `à l’acte ${['', 'I', 'II', 'III', 'IV'][TIER_MIN_ACT[next]]}`;
  if (s.research.tier < next) return 'recherche nécessaire (R&D)';
  return 'non permis ici';
}

/** Former / Promouvoir un ouvrier : mêmes conditions que l'onglet Équipe. */
function workerActs(w: Worker, n0: number): Act[] {
  const s = G.s;
  const urgent = A.urgent(s, w);
  const out: Act[] = [];
  out.push({
    id: `train${n0}`, label: 'Former', cost: trainingCost(s, w), debt: urgent,
    small: `formation ${Math.min(TRAINING.perLevel, w.trainings + 1)}/${TRAINING.perLevel}`,
    off: w.state === 'train' ? 'en stage' : !canTrain(w) ? 'formations faites : à promouvoir' : undefined,
    run: () => U.train(w.id),
  });
  out.push({
    id: `promote${n0}`, label: 'Promouvoir', cost: w.level < 4 ? promotionCost(s, w) : undefined, debt: urgent,
    small: w.level < 4 ? `vers ${LEVEL_NAMES[w.level + 1].toLowerCase()}` : '',
    off: w.state === 'train' ? 'en stage' : w.level >= 4 ? 'niveau maximal' : !canPromote(w) ? `formations ${w.trainings}/${TRAINING.perLevel}` : undefined,
    run: () => U.promote(w.id),
  });
  return out;
}

function machineView(fi: number, l: number, st: number): View | null {
  const s = G.s;
  const f = s.factories[fi];
  const m = f?.lines[l]?.slots[st];
  if (!f || !m) return null;
  const rows: [string, string][] = [];
  const state = m.broken ? (m.service > 0 ? `réparation ${Math.ceil(m.service)} s` : 'en panne') : m.service > 0 ? `révision ${Math.ceil(m.service)} s`
    : m.tier < 3 && m.post < 0 ? 'poste vacant' : m.busy ? 'en marche' : 'attend des pièces';
  rows.push(['État', state]);
  if (s.roles.foreman) {
    const est = estimateFactory(s, fi);
    const r = est.rate[l][st];
    rows.push(['Cadence', `${r > 0 ? `${perMin(r)}/min` : 'arrêt'}${est.lineBottleneck[l] === st && r > 0 ? ' · goulot' : ''}`]);
  }
  if (s.roles.supervisor && m.tier > 0) rows.push(['Usure', pct(m.wear)]);
  const w = m.post >= 0 ? crewName(m.post) : undefined;
  if (m.tier >= 3) rows.push(['Conduite', 'automatique']);
  else rows.push(['Opérateur', w ? `${w.name} · ${LEVEL_NAMES[w.level].toLowerCase()}` : 'aucun']);
  const lvl = A.toolLevel(s, m.tier, st);
  rows.push(['Outillage', `niveau ${lvl}/${TOOL_MAX}`]);
  const acts: Act[] = [];
  const mc = A.modernizeAtCost(s, fi, l, st);
  const next = m.tier + 1;
  acts.push({
    id: 'modern', label: 'Moderniser', cost: mc ?? undefined,
    small: next < TIER_COUNT ? MACHINE_NAMES[next][st] : '',
    off: mc === null ? tierReason(m.tier) : undefined,
    warn: mc !== null && w && next < 3 && w.level < TIER_OPERATOR_LEVEL[next] ? `${w.name} devra être promu·e ${LEVEL_NAMES[TIER_OPERATOR_LEVEL[next]].toLowerCase()}` : undefined,
    run: () => U.modernizeAt(fi, l, st),
  });
  acts.push({
    id: 'tool', label: 'Outiller', cost: lvl < TOOL_MAX ? toolCost(m.tier, st, lvl) : undefined,
    small: `niveau ${lvl + 1} · toutes les machines identiques`,
    off: lvl >= TOOL_MAX ? 'outillage au maximum' : m.tier > s.research.tier ? 'recherche nécessaire' : undefined,
    run: () => U.upgradeTool(m.tier, st),
  });
  if (m.broken) {
    acts.push({ id: 'repair', label: 'Réparer', cost: A.repairCost(s, fi, l, st), debt: true, off: m.service > 0 ? 'réparation en cours' : undefined, run: () => U.repair(l, st, fi) });
  } else if (m.tier > 0) {
    acts.push({
      id: 'service', label: 'Réviser', cost: A.serviceCost(s, fi, l, st), debt: true, small: 'remet l’usure à zéro',
      off: m.service > 0 ? 'révision en cours' : m.wear < 0.05 ? 'machine comme neuve' : undefined,
      run: () => U.service(l, st, fi),
    });
  }
  if (m.tier < 3) {
    if (w) acts.push(...workerActs(w, 0).map((a) => ({ ...a, label: `${a.label} l’opérateur` })));
    else acts.push({ id: 'hire', label: 'Embaucher', small: 'prend le poste libre le plus utile', run: () => U.hire(fi) });
  }
  return {
    title: `${STATION_NAMES[st]} · chaîne ${l + 1}${s.factories.length > 1 ? ` · usine ${fi + 1}` : ''}`,
    sub: `${MACHINE_NAMES[m.tier][st]} (${TIER_NAMES[m.tier].toLowerCase()})`,
    rows, acts, tab: 'atelier',
  };
}

function slotView(fi: number, l: number, st: number): View | null {
  const s = G.s;
  const f = s.factories[fi];
  if (!f || f.lines[l]?.slots[st]) return null;
  const tier = A.newUnitTier(f, st);
  return {
    title: `${STATION_NAMES[st]} · chaîne ${l + 1}${s.factories.length > 1 ? ` · usine ${fi + 1}` : ''}`,
    sub: 'Emplacement libre',
    rows: [['À installer', MACHINE_NAMES[tier][st]]],
    acts: [{ id: 'unit', label: 'Installer', cost: A.addUnitCost(s, fi, st), small: MACHINE_NAMES[tier][st].toLowerCase(), run: () => U.addUnit(st, fi, l) }],
    tab: 'atelier',
  };
}

function workerView(id: number): View | null {
  const s = G.s;
  const w = crewName(id);
  if (!w) return null;
  const rows: [string, string][] = [];
  const where = w.kind === 'post' ? `${STATION_NAMES[w.station].toLowerCase()}, chaîne ${w.line + 1}` : w.kind === 'crank' ? `manivelle, chaîne ${w.line + 1}` : 'relève et postes vacants';
  rows.push(['Poste', where]);
  if (w.trait) rows.push(['Caractère', TRAIT_NAMES[w.trait]]);
  rows.push(['Formations', `${w.trainings}/${TRAINING.perLevel}`]);
  if (w.state === 'train') rows.push(['En stage', `encore ${Math.ceil(w.timer)} s`]);
  if (s.roles.hr) rows.push(['Moral', pct(w.morale)]);
  rows.push(['Salaire', `${perMin(salaryOf(w))} €/min`]);
  const acts = workerActs(w, 0);
  const marcel = w.name === 'Marcel';
  const nofire = s.challenge?.state === 'on' && s.challenge.id === 'nofire';
  acts.push({
    id: 'fire', label: 'Licencier', confirm: true, small: 'son poste reste vacant',
    off: marcel ? 'Marcel ne part pas' : nofire ? 'défi « Sans licencier »' : undefined,
    run: () => U.fire(w.id),
  });
  return {
    title: w.name,
    sub: `${LEVEL_NAMES[w.level]} · ${KIND_NAMES[w.kind].toLowerCase()}`,
    rows, acts, tab: 'equipe',
  };
}

function chainView(fi: number, l: number): View | null {
  const s = G.s;
  const f = s.factories[fi];
  const line = f?.lines[l];
  if (!f || !line) return null;
  const rows: [string, string][] = [];
  const n = line.slots.filter(Boolean).length;
  let bottleneck = -1;
  if (s.roles.foreman && n) {
    const est = estimateFactory(s, fi);
    bottleneck = est.lineBottleneck[l];
    const out = bottleneck >= 0 ? est.rate[l][bottleneck] : 0;
    rows.push(['Cadence', out > 0 ? `${perMin(out)}/min · goulot : ${STATION_NAMES[bottleneck].toLowerCase()}` : 'arrêt']);
  }
  rows.push(['Postes', `${n}/4`]);
  rows.push(['Convoyeur', line.conveyor ? (line.crank >= 0 ? 'en marche' : 'sans ouvrier à la manivelle') : 'aucun']);
  if (line.produced) rows.push(['Produits', `${fmt(line.produced)} écrous`]);
  const acts: Act[] = [];
  const missing = line.slots.findIndex((m) => !m);
  if (missing >= 0) {
    const tier = A.newUnitTier(f, missing);
    acts.push({ id: 'unit', label: 'Installer', cost: A.addUnitCost(s, fi, missing), small: `${STATION_NAMES[missing].toLowerCase()} : ${MACHINE_NAMES[tier][missing].toLowerCase()}`, run: () => U.addUnit(missing, fi, l) });
  }
  if (!line.conveyor) {
    acts.push({ id: 'conv', label: 'Convoyeur à manivelle', cost: conveyorCost(f, l), off: n < 2 ? 'deux postes au moins' : undefined, run: () => U.buyConveyor(l, fi) });
  }
  const mt = A.lineModernizeTargets(s, fi, l);
  acts.push({
    id: 'modline', label: 'Moderniser la chaîne', cost: mt.length ? mt.reduce((a, x) => a + x.cost, 0) : undefined,
    small: mt.length ? `${mt.length} machine${mt.length > 1 ? 's' : ''}` : '',
    off: mt.length ? undefined : 'rien à moderniser pour l’instant',
    run: () => U.modernizeLine(fi, l),
  });
  const tr = A.lineTrainees(s, fi, l);
  acts.push({
    id: 'trainline', label: 'Former les ouvriers', cost: tr.ws.length ? tr.cost : undefined,
    small: tr.ws.length ? `${tr.ws.length} ouvrier${tr.ws.length > 1 ? 's' : ''}` : '',
    warn: tr.ws.length ? `la chaîne s’arrête environ ${Math.ceil(tr.time)} s${polyNote(fi)}` : undefined,
    off: tr.ws.length ? undefined : 'personne à former',
    run: () => U.trainLine(fi, l),
  });
  const pr = A.linePromotees(s, fi, l);
  acts.push({
    id: 'promline', label: 'Promouvoir les ouvriers', cost: pr.ws.length ? pr.cost : undefined,
    small: pr.ws.length ? `${pr.ws.length} ouvrier${pr.ws.length > 1 ? 's' : ''}` : '',
    warn: pr.ws.length ? `la chaîne s’arrête environ ${Math.ceil(pr.time)} s${polyNote(fi)}` : undefined,
    off: pr.ws.length ? undefined : 'personne à promouvoir (5 formations)',
    run: () => U.promoteLine(fi, l),
  });
  if (bottleneck >= 0 && line.slots[bottleneck]) {
    acts.push({ id: 'goto', label: 'Aller au goulot', small: STATION_NAMES[bottleneck].toLowerCase(), run: () => openCard({ kind: 'machine', fi, l, st: bottleneck }) });
  }
  return {
    title: `Chaîne ${l + 1}${s.factories.length > 1 ? ` · usine ${fi + 1}` : ''}`,
    sub: `${MATERIAL_NAMES[f.material]}`,
    rows, acts, tab: 'atelier',
  };
}

function polyNote(fi: number): string {
  const n = G.s.workers.filter((w) => w.factory === fi && w.kind === 'poly' && w.state !== 'train').length;
  return n ? ` ; ${n} polyvalent${n > 1 ? 's' : ''} pour relayer` : '';
}

function factoryView(fi: number): View | null {
  const s = G.s;
  const f = s.factories[fi];
  if (!f) return null;
  const rows: [string, string][] = [['Matériau', MATERIAL_NAMES[f.material]]];
  if (s.roles.foreman) rows.push(['Cadence', `${perMin(estimateFactory(s, fi).x)}/min`]);
  rows.push(['Effectif', `${s.workers.filter((w) => w.factory === fi).length} personnes`]);
  rows.push(['Chaînes', `${f.lines.filter((l) => l.slots.some(Boolean)).length}/4 équipées`]);
  if (f.lines.some((l) => l.slots.some((m) => m && m.broken))) rows.push(['Alerte', 'machine en panne']);
  return {
    title: `Usine ${fi + 1}`, sub: 'Vue d’ensemble', rows,
    acts: [
      { id: 'enter', label: 'Entrer', small: 'voir l’atelier de près', run: () => hooks?.enterHall(fi) },
    ],
    tab: 'atelier',
  };
}

function view(): View | null {
  if (!ref) return null;
  switch (ref.kind) {
    case 'machine': {
      // la machine a pu être retirée ; l'emplacement vide a pu être équipé
      const v = machineView(ref.fi, ref.l, ref.st);
      if (v) return v;
      return slotView(ref.fi, ref.l, ref.st);
    }
    case 'slot':
      return slotView(ref.fi, ref.l, ref.st) ?? machineView(ref.fi, ref.l, ref.st);
    case 'worker':
      return workerView(ref.id);
    case 'chain':
      return chainView(ref.fi, ref.l);
    case 'factory':
      return factoryView(ref.fi);
  }
}

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Reconstruit la carte si son contenu a changé (appelé quelques fois par seconde et après chaque action). */
export function refreshCard(): void {
  if (!ref) return;
  const v = view();
  if (!v) {
    closeCard();
    return;
  }
  acts = v.acts;
  const money = G.s.money;
  const rate = netRate();
  const now = performance.now();
  if (confirmId && now > confirmUntil) confirmId = '';
  let h = `<div class="ec-head"><div><div class="ec-title">${esc(v.title)}</div><div class="ec-sub">${esc(v.sub)}</div></div>`
    + '<button type="button" class="ec-x" data-cx="1" aria-label="Fermer la carte">×</button></div>';
  h += '<div class="ec-rows">';
  for (const [k, x] of v.rows) h += `<div class="ec-row"><span>${esc(k)}</span><b>${esc(x)}</b></div>`;
  h += '</div><div class="ec-acts">';
  v.acts.forEach((a, i) => {
    const short = a.cost !== undefined && money < a.cost && !a.debt;
    const dis = !!a.off || short;
    const confirming = a.confirm && confirmId === a.id;
    const label = confirming ? `Confirmer : ${a.label.toLowerCase()}` : a.label;
    const price = a.cost !== undefined ? `${fmt(a.cost)} €` : '';
    const line2 = a.off ? a.off : short ? waitText(a.cost! - money, rate) : a.small ?? '';
    h += `<button type="button" class="buy ec-act${a.confirm ? ' alt' : ''}${confirming ? ' confirm' : ''}" data-ca="${a.id}"${dis ? ' disabled' : ''}>`
      + `<kbd>${i + 1}</kbd><span class="ec-l"><span class="c">${esc(label)}</span>${line2 ? `<small${short && !a.off ? ' class="eta"' : ''}>${esc(line2)}</small>` : ''}</span>`
      + `${price ? `<span class="ec-p">${price}</span>` : ''}</button>`;
    if (a.warn && !dis) h += `<div class="ec-warn">⚠ ${esc(a.warn)}</div>`;
  });
  h += '</div><button type="button" class="ec-link" data-cl="1">Voir dans le panneau →</button>';
  if (h === lastHtml) return;
  const e = el();
  const focused = (document.activeElement as HTMLElement | null)?.dataset?.ca;
  e.innerHTML = h;
  e.setAttribute('aria-label', v.title);
  lastHtml = h;
  if (focused) e.querySelector<HTMLElement>(`[data-ca="${focused}"]`)?.focus();
  (e as HTMLElement & { _tab?: Tab })._tab = v.tab;
}

function runAct(id: string): void {
  const a = acts.find((x) => x.id === id);
  if (!a) return;
  if (a.confirm && confirmId !== id) {
    confirmId = id;
    confirmUntil = performance.now() + 3000;
    lastHtml = '';
    refreshCard();
    return;
  }
  confirmId = '';
  a.run();
  lastHtml = '';
  refreshCard();
}

/** Raccourcis : 1 à 9 pour les actions de la carte ouverte. Renvoie vrai si la touche est prise. */
export function cardKey(key: string): boolean {
  if (!ref) return false;
  const i = Number(key) - 1;
  if (!Number.isInteger(i) || i < 0 || i >= acts.length) return false;
  const b = el().querySelector<HTMLButtonElement>(`[data-ca="${acts[i].id}"]`);
  if (b && !b.disabled) runAct(acts[i].id);
  return true;
}

export function initCard(): void {
  const e = el();
  e.addEventListener('pointerdown', (ev) => ev.stopPropagation());
  e.addEventListener('click', (ev) => {
    const t = (ev.target as HTMLElement).closest<HTMLElement>('[data-ca],[data-cx],[data-cl]');
    if (!t) return;
    if (t.dataset.cx) closeCard();
    else if (t.dataset.cl) {
      const r = ref;
      const tab = (e as HTMLElement & { _tab?: Tab })._tab ?? 'atelier';
      if (r && 'fi' in r) hooks?.focusFactory(r.fi);
      else if (r?.kind === 'worker') {
        const w = crewName(r.id);
        if (w) hooks?.focusFactory(w.factory);
      }
      hooks?.setTab(tab);
    } else if (t.dataset.ca && !(t as HTMLButtonElement).disabled) runAct(t.dataset.ca);
  });
}
