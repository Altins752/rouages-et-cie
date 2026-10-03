/**
 * État partagé du rendu d'une image : contextes (scène, émissif, lumière, signaux), état lu, options,
 * et les primitives communes (formes, lumières, voyants, ombres de contact, pièces).
 */
import type { GameState } from '../sim/types';
import type { SceneOpts } from './scene';

export const TAU = Math.PI * 2;
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** La carte de lumière est tracée à demi-résolution (elle est douce par nature). */
export const LIGHT_SCALE = 0.5;

export const MATERIAL_COLORS = ['#6f747c', '#c3ccd6', '#e0b244', '#eef2f6', '#8fb0e0', '#33363d', '#d8f6ff'];

/** Couleurs des signaux : fixes, jamais étalonnées. */
export const SIG = {
  run: '87,217,135',
  wait: '255,176,46',
  fault: '255,59,43',
  service: '79,168,255',
  select: '255,216,74',
} as const;

interface HeatSpot { x: number; y: number; r: number; k: number }

export const R = {
  ctx: null as unknown as CanvasRenderingContext2D,
  glow: null as CanvasRenderingContext2D | null,
  /** Carte de lumière (effets complets seulement). */
  light: null as CanvasRenderingContext2D | null,
  /** Couche des signaux et des textes, au-dessus de tout post-traitement. */
  ui: null as unknown as CanvasRenderingContext2D,
  S: null as unknown as GameState,
  O: null as unknown as SceneOpts,
  zoom: 1,
  cw: 1,
  ch: 1,
  /** Sources de chaleur de l'image, en pixels de l'écran. */
  heat: [] as HeatSpot[],
  /** Origine du hall en cours de dessin (coordonnées du monde, pour les particules). */
  ox: 0,
  oy: 0,
};

type M6 = [number, number, number, number, number, number];

/** Applique la même transformation du monde à toutes les couches. */
export function setWorld(m: M6): void {
  R.ctx.setTransform(...m);
  R.glow?.setTransform(...m);
  R.ui.setTransform(...m);
  if (R.light) {
    const k = LIGHT_SCALE;
    R.light.setTransform(m[0] * k, m[1] * k, m[2] * k, m[3] * k, m[4] * k, m[5] * k);
  }
}

/** Décale l'origine de toutes les couches (un hall). */
export function worldAt(m: M6, x: number, y: number): void {
  setWorld([m[0], m[1], m[2], m[3], m[4] + x * m[0], m[5] + y * m[3]]);
}

export function rr(x: number, y: number, w: number, h: number, r: number, c = R.ctx): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

// ------------------------------------------------------------------ Lumière

/** Lumière ambiante d'une zone (multiplicateur 0–2 par canal). */
export function ambientRect(x: number, y: number, w: number, h: number, m: readonly number[]): void {
  const L = R.light;
  if (!L) return;
  L.globalCompositeOperation = 'source-over';
  L.fillStyle = `rgb(${Math.round(clamp(m[0], 0, 2) * 127.5)},${Math.round(clamp(m[1], 0, 2) * 127.5)},${Math.round(clamp(m[2], 0, 2) * 127.5)})`;
  L.fillRect(x, y, w, h);
}

/** Flaque de lumière additive : ajoute `k` × couleur au multiplicateur au centre. */
export function lamp(x: number, y: number, r: number, rgb: readonly number[], k: number, sy = 1): void {
  const L = R.light;
  if (!L || k <= 0.003 || r <= 0) return;
  L.globalCompositeOperation = 'lighter';
  L.save();
  L.translate(x, y);
  if (sy !== 1) L.scale(1, sy);
  // un multiplicateur au-delà de 1 s'obtient en empilant des couches
  const n = Math.ceil(k);
  const a = k / n;
  const base = `rgba(${Math.round(rgb[0] * 0.5)},${Math.round(rgb[1] * 0.5)},${Math.round(rgb[2] * 0.5)},`;
  const g = L.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, `${base}${a})`);
  g.addColorStop(0.35, `${base}${a * 0.5})`);
  g.addColorStop(1, `${base}0)`);
  L.fillStyle = g;
  for (let i = 0; i < n; i++) L.fillRect(-r, -r, r * 2, r * 2);
  L.restore();
  L.globalCompositeOperation = 'source-over';
}

/** Lumière additive sur une forme quelconque (faisceau, tache de soleil). */
export function lightShape(path: (c: CanvasRenderingContext2D) => void, fill: (c: CanvasRenderingContext2D) => string | CanvasGradient): void {
  const L = R.light;
  if (!L) return;
  L.globalCompositeOperation = 'lighter';
  L.beginPath();
  path(L);
  L.fillStyle = fill(L);
  L.fill();
  L.globalCompositeOperation = 'source-over';
}

/** Source de chaleur (distorsion de l'air au-dessus). Coordonnées du monde courant. */
export function heat(x: number, y: number, r: number, k: number): void {
  if (R.heat.length >= 8 || R.O.reduced) return;
  const m = R.ctx.getTransform();
  const p = m.transformPoint(new DOMPoint(x, y));
  if (p.x < -r * m.a || p.x > R.cw + r * m.a || p.y < -r * m.a || p.y > R.ch + r * m.a * 2) return;
  R.heat.push({ x: p.x, y: p.y, r: r * m.a, k });
}

/** Point lumineux : dessiné dans la scène, dans la couche émissive (halo) et comme petite lampe. */
export function glowDot(x: number, y: number, r: number, rgb: string, a: number): void {
  const c = R.ctx;
  c.fillStyle = `rgba(${rgb},${a})`;
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fill();
  if (R.glow) {
    R.glow.fillStyle = `rgba(${rgb},${a})`;
    R.glow.beginPath();
    R.glow.arc(x, y, r * 1.6, 0, TAU);
    R.glow.fill();
  }
  if (R.light && a > 0.2) {
    const v = rgb.split(',').map(Number);
    lamp(x, y, r * 2.2, v, 1.4 * a);
    lamp(x, y, r * 9, v, 0.35 * a);
  }
}

/** Voyant d'état : dessiné aussi sur la couche des signaux, en couleur exacte. */
export function signal(x: number, y: number, r: number, rgb: string, on: boolean): void {
  glowDot(x, y, r, rgb, on ? 1 : 0.25);
  const u = R.ui;
  if (!on) return;
  u.fillStyle = 'rgba(10,11,12,.7)';
  u.beginPath();
  u.arc(x, y, r + 0.7, 0, TAU);
  u.fill();
  u.fillStyle = `rgb(${rgb})`;
  u.beginPath();
  u.arc(x, y, r, 0, TAU);
  u.fill();
  u.fillStyle = 'rgba(255,255,255,.65)';
  u.beginPath();
  u.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, TAU);
  u.fill();
}

/** Ombre de contact douce sur le sol. */
export function contact(x: number, y: number, rx: number, ry: number, a = 0.45, c = R.ctx): void {
  c.save();
  c.translate(x, y);
  c.scale(1, ry / rx);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(0,0,0,${a})`);
  g.addColorStop(0.6, `rgba(0,0,0,${a * 0.45})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g;
  c.fillRect(-rx, -rx, rx * 2, rx * 2);
  c.restore();
}

/** Dégradé vertical de volume (haut éclairé, bas dans l'ombre) sur la dernière forme tracée. */
export function volume(c: CanvasRenderingContext2D, y0: number, y1: number, hi = 0.18, lo = 0.28): void {
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, `rgba(255,255,255,${hi})`);
  g.addColorStop(0.45, 'rgba(255,255,255,0)');
  g.addColorStop(1, `rgba(0,0,0,${lo})`);
  c.fillStyle = g;
  c.fill();
}

/** Arêtes : liseré clair en haut, sombre en bas (biseau). */
export function bevel(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, k = 1): void {
  c.fillStyle = `rgba(255,255,255,${0.22 * k})`;
  c.fillRect(x, y, w, 0.7);
  c.fillStyle = `rgba(255,255,255,${0.1 * k})`;
  c.fillRect(x, y, 0.6, h);
  c.fillStyle = `rgba(0,0,0,${0.35 * k})`;
  c.fillRect(x, y + h - 0.7, w, 0.7);
  c.fillRect(x + w - 0.6, y, 0.6, h);
}

/** Rivets ou vis. */
export function rivets(c: CanvasRenderingContext2D, pts: [number, number][], r = 0.6): void {
  for (const [x, y] of pts) {
    c.fillStyle = 'rgba(0,0,0,.4)';
    c.beginPath();
    c.arc(x + 0.2, y + 0.25, r, 0, TAU);
    c.fill();
    c.fillStyle = 'rgba(220,226,232,.55)';
    c.beginPath();
    c.arc(x, y, r * 0.8, 0, TAU);
    c.fill();
  }
}

export function mix(a: number[], b: number[], k: number): string {
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * k)},${Math.round(a[1] + (b[1] - a[1]) * k)},${Math.round(a[2] + (b[2] - a[2]) * k)})`;
}

const shade = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(clamp(k >= 0 ? v + (255 - v) * k : v * (1 + k), 0, 255));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};

/** Écrou fini : hexagone métallique, chanfrein, trou taraudé. */
export function piece(x: number, y: number, r: number, m: number, rot = 0, c = R.ctx): void {
  const col = MATERIAL_COLORS[m];
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  const g = c.createLinearGradient(-r, -r, r, r);
  g.addColorStop(0, shade(col, m === 5 ? 0.35 : 0.4));
  g.addColorStop(0.5, col);
  g.addColorStop(1, shade(col, -0.45));
  c.fillStyle = g;
  c.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = (k * TAU) / 6;
    c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(0,0,0,.35)';
  c.lineWidth = 0.35;
  c.stroke();
  c.fillStyle = shade(col, 0.15);
  c.beginPath();
  c.arc(0, 0, r * 0.72, 0, TAU);
  c.fill();
  c.fillStyle = 'rgba(10,10,12,.7)';
  c.beginPath();
  c.arc(0, 0, r * 0.38, 0, TAU);
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,.4)';
  c.lineWidth = 0.4;
  c.beginPath();
  c.arc(0, 0, r * 0.38, Math.PI * 0.1, Math.PI * 0.7);
  c.stroke();
  c.restore();
  if (m === 6 && c === R.ctx && Math.sin(R.O.T * 7 + x * 3 + y) > 0.8) glowDot(x + r * 0.4, y - r * 0.4, 0.7, '230,250,255', 0.9);
}

/** Lopin (barre tronçonnée) : petit cylindre couché. */
export function lopin(x: number, y: number, m: number, c = R.ctx): void {
  const col = MATERIAL_COLORS[m];
  const g = c.createLinearGradient(0, y - 2, 0, y + 2);
  g.addColorStop(0, shade(col, 0.45));
  g.addColorStop(0.5, col);
  g.addColorStop(1, shade(col, -0.5));
  c.fillStyle = g;
  rr(x - 3, y - 2, 6, 4, 1.6, c);
  c.fill();
  c.fillStyle = shade(col, -0.25);
  c.beginPath();
  c.ellipse(x + 2.4, y, 0.8, 2, 0, 0, TAU);
  c.fill();
}

/** Taille de police (monde) pour qu'un texte de la couche des signaux reste lisible à l'écran. */
export function uiFont(px: number, max = 99): number {
  const dpr = R.O.dpr ?? 1;
  return Math.min(max, (px * dpr) / R.zoom);
}

/** Étiquette sur pastille sombre (couche des signaux). */
export function tag(text: string, x: number, y: number, size: number, col: string, bg = 'rgba(10,11,9,.84)'): void {
  const u = R.ui;
  u.font = `600 ${size}px "Share Tech Mono", monospace`;
  u.textAlign = 'center';
  u.textBaseline = 'middle';
  const w = u.measureText(text).width + size * 0.8;
  u.fillStyle = bg;
  rr(x - w / 2, y - size * 0.7, w, size * 1.4, size * 0.3, u);
  u.fill();
  u.fillStyle = col;
  u.fillText(text, x, y + size * 0.05);
}
