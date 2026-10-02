export const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

export function setText(el: HTMLElement, v: string): void {
  const e = el as HTMLElement & { _v?: string };
  if (e._v !== v) {
    e._v = v;
    el.textContent = v;
  }
}

export function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
