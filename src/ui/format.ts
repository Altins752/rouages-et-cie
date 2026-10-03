/** Formats d'affichage français : virgule décimale, espaces fines, unités k / M / Md. */

const NBSP = ' ';

export function fmt(n: number): string {
  if (!isFinite(n)) return '—';
  const neg = n < 0;
  let v = Math.abs(n);
  let s: string;
  if (v < 1000) {
    s = (v < 10 && v % 1 > 0.05 ? v.toFixed(1) : Math.floor(v).toString()).replace('.', ',');
  } else {
    const units = ['k', 'M', 'Md', 'T'];
    let i = -1;
    while (v >= 1000 && i < units.length - 1) {
      v /= 1000;
      i++;
    }
    s = (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)).replace('.', ',') + NBSP + units[i];
  }
  return (neg ? '−' : '') + s;
}

/** Nombre entier avec séparateur de milliers. */
export function fmtInt(n: number): string {
  if (!isFinite(n)) return '—';
  const neg = n < 0;
  const s = Math.floor(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return (neg ? '−' : '') + s;
}

export function fmtMoney(n: number): string {
  return Math.abs(n) < 100000 ? fmtInt(n) : fmt(n);
}

/** Décimal court : 0,25 / 2,1 / 14. */
export function fmtP(x: number, digits = 2): string {
  if (!isFinite(x)) return '—';
  const a = Math.abs(x);
  if (a >= 1000) return fmt(x);
  const d = a >= 100 ? 0 : a >= 10 ? Math.min(1, digits) : digits;
  return x.toFixed(d).replace('.', ',');
}

/** Les cadences s'affichent par minute ; la simulation, elle, compte en secondes. */
export const PER_MIN = 60;

/** Une cadence (par seconde de jeu) affichée par minute. */
export function perMin(x: number, digits = 2): string {
  return fmtP(x * PER_MIN, digits);
}

export function pct(x: number): string {
  return isFinite(x) ? `${Math.round(x * 100)}${NBSP}%` : '—';
}

export function mmss(s: number): string {
  const v = Math.max(0, Math.ceil(s));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
}

export function dur(s: number): string {
  const v = Math.max(0, Math.round(s));
  if (v < 60) return `${v} s`;
  if (v < 3600) return `${Math.floor(v / 60)} min ${String(v % 60).padStart(2, '0')} s`;
  const h = Math.floor(v / 3600);
  const m = Math.floor((v % 3600) / 60);
  return `${h} h ${String(m).padStart(2, '0')}`;
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${Math.abs(n) >= 2 ? many : one}`;
}
