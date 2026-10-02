/** Télex : file de messages tapés à la machine sur le pupitre. Entrée/Échap pour passer. */
import { sfx } from '../audio/audio';
import type { Msg } from '../story/script';
import { $, reducedMotion } from './dom';

const queue: Msg[] = [];
let busy = false;
let timer = 0;
let full = '';
let shown = 0;
let onIdle: (() => void) | null = null;

export function telex(msgs: Msg | Msg[]): void {
  for (const m of Array.isArray(msgs) ? msgs : [msgs]) queue.push(m);
  if (!busy) next();
  else count();
}

export function telexOpen(): boolean {
  return busy;
}

export function onTelexIdle(fn: () => void): void {
  onIdle = fn;
}

function count(): void {
  $('tCount').textContent = queue.length ? `${queue.length} message${queue.length > 1 ? 's' : ''} en attente` : '';
}

function next(): void {
  const box = $('telex');
  window.clearInterval(timer);
  const m = queue.shift();
  if (!m) {
    busy = false;
    box.classList.remove('show');
    onIdle?.();
    return;
  }
  busy = true;
  $('tFrom').textContent = `TÉLEX — ${m.from}`;
  box.classList.add('show');
  const el = $('tTxt');
  full = m.text;
  count();
  if (reducedMotion()) {
    el.textContent = full;
    shown = full.length;
    return;
  }
  el.textContent = '';
  shown = 0;
  timer = window.setInterval(() => {
    shown = Math.min(full.length, shown + 2);
    el.textContent = full.slice(0, shown);
    if (shown % 4 === 0) sfx('type');
    if (shown >= full.length) window.clearInterval(timer);
  }, 18);
}

/** Termine la frappe, ou passe au message suivant. */
export function telexAdvance(): void {
  if (!busy) return;
  if (shown < full.length) {
    window.clearInterval(timer);
    shown = full.length;
    $('tTxt').textContent = full;
    return;
  }
  sfx('click');
  next();
}

/** Ferme tous les messages en attente. */
export function telexClose(): void {
  queue.length = 0;
  window.clearInterval(timer);
  shown = full.length;
  next();
}

export function initTelex(): void {
  $('tOk').addEventListener('click', (e) => {
    e.stopPropagation();
    telexAdvance();
  });
  $('telex').addEventListener('pointerdown', (e) => e.stopPropagation());
}
