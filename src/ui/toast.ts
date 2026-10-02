import { $ } from './dom';

const MAX = 4;

export function toast(text: string, bad = false): void {
  const box = $('toasts');
  // pas de doublon immédiat
  const last = box.firstElementChild as HTMLElement | null;
  if (last && last.textContent === text) return;
  const el = document.createElement('div');
  el.className = 'toast' + (bad ? ' bad' : '');
  el.textContent = text;
  box.prepend(el);
  while (box.children.length > MAX) box.lastElementChild!.remove();
  window.setTimeout(() => el.classList.add('out'), 2600);
  window.setTimeout(() => el.remove(), 3100);
}
