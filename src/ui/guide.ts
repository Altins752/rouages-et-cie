/**
 * Marcel guide pas à pas : une bulle près de l'élément à utiliser, qui clignote. Une étape se
 * valide en la faisant (condition « until ») ou d'un « Compris ». Sert à l'aide des quêtes et
 * au tutoriel (rail). La bulle ne bloque rien : le joueur peut toujours la fermer.
 */
import { G } from '../game';
import type { Tab } from '../game';
import type { GuideStep } from '../story/quests';
import { $ } from './dom';

const TAB_LABEL: Record<Tab, string> = { atelier: 'Atelier', equipe: 'Équipe', rd: 'R&D', marche: 'Marché', donnees: 'Données' };

interface Run {
  steps: GuideStep[];
  i: number;
  title: string;
  /** Rail : le reste du panneau est grisé tant que l'étape n'est pas faite (tutoriel). */
  rail: boolean;
  onEnd?: (skipped: boolean) => void;
}

let run: Run | null = null;
let el: HTMLElement | null = null;
let target: HTMLElement | null = null;
let lastKey = '';

function bubble(): HTMLElement {
  if (el) return el;
  el = document.createElement('div');
  el.className = 'guide';
  el.id = 'guide';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = '<div class="g-from"><span class="g-face" aria-hidden="true"></span><span id="guideTitle"></span></div><div class="g-txt" id="guideTxt"></div><div class="g-btns"><button type="button" id="guideSkip" class="g-skip">Je connais, Marcel</button><button type="button" id="guideOk">Compris</button></div>';
  document.body.appendChild(el);
  el.querySelector('#guideOk')!.addEventListener('click', () => next());
  el.querySelector('#guideSkip')!.addEventListener('click', () => stopGuide(true));
  return el;
}

export function guideActive(): boolean {
  return run !== null;
}

export function railActive(): boolean {
  return !!run && run.rail;
}

/** Lance une suite d'étapes. Remplace celle en cours. */
export function startGuide(steps: GuideStep[], opts: { title?: string; rail?: boolean; onEnd?: (skipped: boolean) => void } = {}): void {
  if (!steps.length) return;
  if (run) stopGuide(true);
  run = { steps, i: 0, title: opts.title ?? 'Marcel', rail: !!opts.rail, onEnd: opts.onEnd };
  lastKey = '';
  bubble().classList.add('show');
  guideTick();
}

export function stopGuide(skipped = false): void {
  const r = run;
  run = null;
  setTarget(null);
  G.highlight = null;
  document.body.classList.remove('railing');
  el?.classList.remove('show');
  r?.onEnd?.(skipped);
}

function next(): void {
  if (!run) return;
  run.i++;
  lastKey = '';
  if (run.i >= run.steps.length) stopGuide(false);
  else guideTick();
}

function setTarget(t: HTMLElement | null): void {
  if (target === t) return;
  target?.classList.remove('guide-target');
  target = t;
  target?.classList.add('guide-target');
}

function resolve(step: GuideStep): { node: HTMLElement | null; text: string } {
  if (step.tab && G.tab !== step.tab) {
    return { node: document.querySelector<HTMLElement>(`#tabs button[data-t="${step.tab}"]`), text: `Ouvre l’onglet ${TAB_LABEL[step.tab]}. ${step.text}` };
  }
  const t = step.target ?? '';
  if (t === 'scene') return { node: $('stage'), text: step.text };
  if (t.startsWith('act:')) return { node: document.querySelector<HTMLElement>(`#list [data-act="${t.slice(4)}"]`), text: step.text };
  if (t.startsWith('sel:')) return { node: document.querySelector<HTMLElement>(t.slice(4)), text: step.text };
  return { node: null, text: step.text };
}

/** À appeler à chaque image : valide l'étape, suit la cible, place la bulle. */
export function guideTick(): void {
  if (!run) return;
  const step = run.steps[run.i];
  if (step.until?.(G.s)) {
    next();
    return;
  }
  const b = bubble();
  const { node, text } = resolve(step);
  const key = `${run.i}|${text}`;
  if (key !== lastKey) {
    lastKey = key;
    ($('guideTitle') as HTMLElement).textContent = run.steps.length > 1 ? `${run.title} · ${run.i + 1}/${run.steps.length}` : run.title;
    ($('guideTxt') as HTMLElement).textContent = text;
    // « Compris » seulement pour les étapes d'explication ; les autres se valident en agissant.
    ($('guideOk') as HTMLElement).style.display = step.until ? 'none' : '';
    if (node && node.closest('#list')) node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  const inPanel = !!node?.closest('#panel');
  setTarget(node && node.id !== 'stage' ? node : null);
  document.body.classList.toggle('railing', run.rail && inPanel);
  // Placement : à gauche du panneau pour une cible du panneau, sous le pupitre pour l'afficheur, en bas de la scène sinon.
  const st = $('stage').getBoundingClientRect();
  const w = b.offsetWidth || 320;
  const h = b.offsetHeight || 120;
  let x = st.left + 16;
  let y = st.bottom - h - 16;
  if (node && inPanel) {
    const r = node.getBoundingClientRect();
    x = st.right - w - 16;
    y = Math.min(Math.max(st.top + 12, r.top + r.height / 2 - h / 2), st.bottom - h - 12);
  } else if (node && node.id !== 'stage') {
    const r = node.getBoundingClientRect();
    x = Math.min(Math.max(st.left + 12, r.left), st.right - w - 12);
    y = Math.max(st.top + 12, r.bottom + 10);
  }
  // ne pas recouvrir le carnet de Marcel
  const q = document.getElementById('quests');
  if (q && q.classList.contains('show')) {
    const r = q.getBoundingClientRect();
    if (x < r.right && x + w > r.left && y < r.bottom + 8 && y + h > r.top) y = Math.min(r.bottom + 8, st.bottom - h - 8);
  }
  b.style.left = `${Math.round(x)}px`;
  b.style.top = `${Math.round(y)}px`;
}
