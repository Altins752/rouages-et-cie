/**
 * Scène de l'usine (canvas 2D). Lit l'état de la simulation, ne le modifie jamais.
 * De près : l'intérieur de chaque hall (repris du POC). De loin : les bâtiments.
 */
import { BUFFER_CAP, MATERIALS, MAX_UNITS } from '../data/balance';
import { bottleneckOf, stationCapacities } from '../sim/analysis';
import { ambient, daylight } from '../sim/env';
import { robotChain, stationCycle } from '../sim/formulas';
import type { Chain, GameState, Worker } from '../sim/types';
import { STATION_NAMES } from '../ui/text';
import { FLOOR, HALL_H, HALL_W, LY, SX, gridCols, hallOrigin, posX, siteBounds } from './layout';
import { particles, smoke } from './particles';

const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export const MATERIAL_COLORS = ['#6f747c', '#c3ccd6', '#e0b244', '#eef2f6', '#8fb0e0', '#33363d', '#d8f6ff'];

// ------------------------------------------------------------------ Caméra

export class Camera {
  x = HALL_W / 2;
  y = HALL_H / 2;
  zoom = 1;
  tx = this.x;
  ty = this.y;
  tz = 1;
  /** Le joueur a déplacé ou zoomé : on ne recadre plus automatiquement. */
  user = false;
  private lastN = -1;
  private lastW = 0;
  private lastH = 0;

  fitZoom(n: number, cw: number, ch: number): number {
    const b = siteBounds(n);
    const m = n === 1 ? 1.0 : 1.08;
    return Math.min(cw / (b.w * m + 20), ch / (b.h * m + (n === 1 ? 0 : 60)));
  }

  /** Recadre sur tout le site (la caméra recule quand l'usine grandit). */
  fit(n: number, cw: number, ch: number, instant = false): void {
    const b = siteBounds(n);
    this.tx = b.x + b.w / 2;
    this.ty = b.y + b.h / 2 + (n === 1 ? 0 : -10);
    this.tz = this.fitZoom(n, cw, ch);
    this.user = false;
    if (instant) {
      this.x = this.tx;
      this.y = this.ty;
      this.zoom = this.tz;
    }
  }

  update(n: number, cw: number, ch: number, dt: number): void {
    if (n !== this.lastN || cw !== this.lastW || ch !== this.lastH) {
      const first = this.lastN < 0;
      if (!this.user || n !== this.lastN) this.fit(n, cw, ch, first);
      this.lastN = n;
      this.lastW = cw;
      this.lastH = ch;
    }
    const k = 1 - Math.exp(-dt * 4);
    this.x += (this.tx - this.x) * k;
    this.y += (this.ty - this.y) * k;
    this.zoom *= Math.pow(this.tz / this.zoom, k);
  }

  zoomAt(factor: number, px: number, py: number, cw: number, ch: number, n: number): void {
    const fit = this.fitZoom(n, cw, ch);
    const nz = clamp(this.tz * factor, fit * 0.85, Math.max(fit * 4, 3.2));
    const w = this.toWorld(px, py, cw, ch);
    this.tz = nz;
    // garder le point sous le curseur
    this.tx = w.x - (px - cw / 2) / nz;
    this.ty = w.y - (py - ch / 2) / nz;
    this.user = true;
  }

  pan(dx: number, dy: number): void {
    this.tx -= dx / this.zoom;
    this.ty -= dy / this.zoom;
    this.x = this.tx;
    this.y = this.ty;
    this.user = true;
  }

  toWorld(px: number, py: number, cw: number, ch: number): { x: number; y: number } {
    return { x: (px - cw / 2) / this.zoom + this.x, y: (py - ch / 2) / this.zoom + this.y };
  }
}

// ------------------------------------------------------------------ Options

export interface SceneOpts {
  /** Temps de rendu (s réelles), pour les animations. */
  T: number;
  red: boolean;
  rev: number;
  selected: number;
  reduced: boolean;
  /** Fin : lumières de l'usine noire (1 → 0) puis de la vieille forge (0 → 1). */
  finale?: { phase: 'off' | 'forge'; k: number };
  hover: Hover | null;
}

export interface Hover {
  hall: number;
  station: number;
  unit: number;
  worker: number;
}

/** Positions de rendu des ouvriers (lissage vertical). */
const WPOS = new Map<number, { x: number; y: number; anim: number }>();

let ctx: CanvasRenderingContext2D;
let glow: CanvasRenderingContext2D | null = null;
let S: GameState;
let O: SceneOpts;

function rr(x: number, y: number, w: number, h: number, r: number, c = ctx): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** Point lumineux, dessiné aussi dans la couche émissive (bloom). */
function glowDot(x: number, y: number, r: number, rgb: string, a: number): void {
  ctx.fillStyle = `rgba(${rgb},${a})`;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  if (glow) {
    glow.fillStyle = `rgba(${rgb},${a})`;
    glow.beginPath();
    glow.arc(x, y, r * 1.6, 0, TAU);
    glow.fill();
  }
}

function piece(x: number, y: number, r: number, m: number, rot = 0): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = MATERIAL_COLORS[m];
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = (k * TAU) / 6;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.4, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = m === 5 ? 'rgba(160,170,190,.6)' : 'rgba(255,255,255,.35)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.75, Math.PI * 1.1, Math.PI * 1.6);
  ctx.stroke();
  ctx.restore();
  if (m === 6 && Math.sin(O.T * 7 + x * 3 + y) > 0.75) glowDot(x + r * 0.4, y - r * 0.4, 0.8, '230,250,255', 0.9);
}

function lopin(x: number, y: number, m: number): void {
  ctx.fillStyle = MATERIAL_COLORS[m];
  rr(x - 3, y - 2, 6, 4, 1);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.3)';
  ctx.fillRect(x - 3, y - 2, 6, 1);
}

// ------------------------------------------------------------------ Intérieur

function hallStyle(c: Chain): 'forge' | 'plant' | 'black' {
  if (c.stations.every((st) => st.tier === 4)) return 'black';
  return S.act <= 1 && S.stats.moves === 0 ? 'forge' : 'plant';
}

function lightLevel(style: string): number {
  if (O.finale) {
    if (O.finale.phase === 'off') return style === 'black' ? 0 : 1 - O.finale.k;
    return O.finale.k;
  }
  return style === 'black' ? 0 : 1;
}

function drawRoom(c: Chain, ci: number): void {
  const style = hallStyle(c);
  const amb = ambient(S.t);
  const lights = lightLevel(style);
  // mur
  const g = ctx.createLinearGradient(0, 0, 0, FLOOR);
  if (style === 'forge') {
    g.addColorStop(0, '#45362e');
    g.addColorStop(1, '#2f2520');
  } else if (style === 'black') {
    g.addColorStop(0, '#0d0f12');
    g.addColorStop(1, '#08090b');
  } else {
    g.addColorStop(0, '#3c4047');
    g.addColorStop(1, '#2a2d32');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, HALL_W, FLOOR);
  ctx.strokeStyle = style === 'forge' ? 'rgba(0,0,0,.25)' : 'rgba(0,0,0,.16)';
  ctx.lineWidth = 0.6;
  if (style === 'forge') {
    for (let y = 8, r = 0; y < FLOOR; y += 8, r++) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(HALL_W, y);
      ctx.stroke();
      for (let x = (r % 2) * 10; x < HALL_W; x += 20) {
        ctx.beginPath();
        ctx.moveTo(x, y - 8);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    }
  } else {
    for (let x = 0; x < HALL_W; x += 25) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, FLOOR);
      ctx.stroke();
    }
  }
  // verrières : le ciel suit le jour et la nuit
  const sky1 = mix([22, 26, 48], [156, 200, 232], amb);
  const sky2 = mix([40, 34, 60], [217, 236, 246], amb);
  for (let i = 0; i < 5; i++) {
    const x = 20 + i * 76;
    ctx.fillStyle = '#1e2126';
    rr(x - 2, 10, 58, 46, 2);
    ctx.fill();
    const sg = ctx.createLinearGradient(0, 12, 0, 54);
    sg.addColorStop(0, sky1);
    sg.addColorStop(1, sky2);
    ctx.fillStyle = style === 'black' ? '#0b0d10' : sg;
    ctx.fillRect(x, 12, 54, 42);
    ctx.fillStyle = '#1e2126';
    ctx.fillRect(x + 26, 12, 2, 42);
    ctx.fillRect(x, 32, 54, 2);
    ctx.fillStyle = `rgba(255,255,255,${0.1 + 0.25 * amb})`;
    ctx.fillRect(x + 3, 14, 4, 38);
    if (amb < 0.3 && style !== 'black') {
      // étoiles
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      for (let k = 0; k < 3; k++) ctx.fillRect(x + ((k * 17 + i * 11) % 50) + 2, 15 + ((k * 13 + i * 7) % 16), 1, 1);
    }
  }
  // poutre et lampes
  ctx.fillStyle = '#24272c';
  ctx.fillRect(0, 62, HALL_W, 7);
  for (let s = 0; s < 4; s++) {
    const x = SX[s];
    ctx.strokeStyle = '#15171a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, 69);
    ctx.lineTo(x, 76);
    ctx.stroke();
    ctx.fillStyle = '#5b6068';
    ctx.beginPath();
    ctx.moveTo(x - 8, 82);
    ctx.lineTo(x - 3, 76);
    ctx.lineTo(x + 3, 76);
    ctx.lineTo(x + 8, 82);
    ctx.fill();
    if (lights > 0.01) {
      const a = (0.12 + 0.16 * (1 - amb)) * lights;
      const lg = ctx.createRadialGradient(x, 84, 2, x, 190, 120);
      lg.addColorStop(0, `rgba(255,224,160,${a})`);
      lg.addColorStop(1, 'rgba(255,224,160,0)');
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.moveTo(x - 6, 82);
      ctx.lineTo(x + 6, 82);
      ctx.lineTo(x + 46, FLOOR);
      ctx.lineTo(x - 46, FLOOR);
      ctx.fill();
      glowDot(x, 82, 2.2, '255,226,170', 0.85 * lights);
    }
  }
  // plaques de poste
  ctx.font = '600 8px "Chakra Petch", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let s = 0; s < 4; s++) {
    ctx.fillStyle = style === 'black' ? '#1b1e22' : '#d8d2c2';
    rr(SX[s] - 26, 88, 52, 11, 1.5);
    ctx.fill();
    ctx.fillStyle = style === 'black' ? '#4fd8ff' : '#2a2620';
    ctx.fillText(STATION_NAMES[s], SX[s], 93.8);
  }
  // sol
  const fg = ctx.createLinearGradient(0, FLOOR, 0, HALL_H);
  fg.addColorStop(0, style === 'black' ? '#14161a' : '#55585e');
  fg.addColorStop(1, style === 'black' ? '#0b0c0e' : '#3b3e43');
  ctx.fillStyle = fg;
  ctx.fillRect(0, FLOOR, HALL_W, HALL_H - FLOOR);
  ctx.fillStyle = style === 'black' ? '#1d6c80' : '#f2b705';
  ctx.fillRect(0, FLOOR + 2, HALL_W, 2);
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  for (let x = 0; x < HALL_W; x += 40) ctx.fillRect(x, FLOOR + 4, 1, HALL_H - FLOOR - 4);
  // porte
  ctx.fillStyle = '#22252a';
  ctx.fillRect(374, 206, 26, FLOOR - 206);
  ctx.fillStyle = style === 'black' ? '#2a2e34' : '#6d737b';
  ctx.fillRect(377, 209, 23, FLOOR - 209);
  ctx.strokeStyle = 'rgba(0,0,0,.25)';
  for (let y = 212; y < FLOOR; y += 5) {
    ctx.beginPath();
    ctx.moveTo(377, y);
    ctx.lineTo(400, y);
    ctx.stroke();
  }
  // rack de barres
  ctx.fillStyle = '#3a3d42';
  ctx.fillRect(4, 220, 28, FLOOR - 220);
  for (let k = 0; k < 6; k++) {
    ctx.fillStyle = MATERIAL_COLORS[c.material];
    ctx.fillRect(7, 226 + k * 8, 22, 3);
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.fillRect(7, 228.5 + k * 8, 22, 0.6);
  }
  ctx.fillStyle = '#d8d2c2';
  ctx.font = '600 6px "Chakra Petch", sans-serif';
  ctx.fillText('Barres', 18, 214);
  // numéro de chaîne
  if (S.chains.length > 1) {
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    rr(6, 64, 40, 13, 2);
    ctx.fill();
    ctx.fillStyle = '#ffb02e';
    ctx.font = '8px "Share Tech Mono", monospace';
    ctx.fillText(`CHAÎNE ${ci + 1}`, 26, 71);
  }
}

function mix(a: number[], b: number[], k: number): string {
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * k)},${Math.round(a[1] + (b[1] - a[1]) * k)},${Math.round(a[2] + (b[2] - a[2]) * k)})`;
}

function drawUnit(c: Chain, ci: number, s: number, i: number): void {
  const st = c.stations[s];
  const u = st.units[i];
  const x = SX[s];
  const y = LY[i];
  const t = st.tier;
  const busy = u.busy && !u.broken && u.service <= 0;
  const T = O.T;
  const sw = busy ? Math.sin(T * 14 + i) : 0;
  if (t === 0) {
    ctx.fillStyle = '#6b4a2b';
    ctx.fillRect(x - 20, y + 8, 40, 5);
    ctx.fillStyle = '#4f361f';
    ctx.fillRect(x - 18, y + 13, 3, 20);
    ctx.fillRect(x + 15, y + 13, 3, 20);
    ctx.fillStyle = 'rgba(255,255,255,.12)';
    ctx.fillRect(x - 20, y + 8, 40, 1);
    if (s === 0) {
      ctx.save();
      ctx.translate(x + 4, y + 2);
      ctx.rotate(sw * 0.12);
      ctx.fillStyle = '#b8bfc7';
      ctx.fillRect(-10, 0, 18, 3);
      ctx.fillStyle = '#6b4a2b';
      ctx.fillRect(8, -1, 5, 5);
      ctx.restore();
    } else if (s === 1) {
      ctx.fillStyle = '#4a4e55';
      ctx.fillRect(x - 5, y + 2, 12, 6);
      ctx.save();
      ctx.translate(x + 10, y - 6);
      ctx.rotate(-0.6 + (busy ? Math.abs(sw) : 0) * 1.1);
      ctx.fillStyle = '#6b4a2b';
      ctx.fillRect(-1, 0, 2, 12);
      ctx.fillStyle = '#5b6068';
      ctx.fillRect(-4, 10, 8, 4);
      ctx.restore();
    } else if (s === 2) {
      ctx.fillStyle = '#4a4e55';
      ctx.fillRect(x - 6, y + 1, 8, 7);
      ctx.save();
      ctx.translate(x - 2, y - 2);
      ctx.rotate(busy ? T * 4 : 0);
      ctx.fillStyle = '#b8bfc7';
      ctx.fillRect(-9, -1, 18, 2);
      ctx.restore();
    } else {
      ctx.fillStyle = '#b8bfc7';
      ctx.fillRect(x - 8, y + 3, 14, 2);
      ctx.fillRect(x - 8, y, 2, 5);
      ctx.fillRect(x + 4, y, 2, 5);
    }
  } else if (t === 1) {
    const body = '#5d7a6c';
    const dark = '#3f5449';
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.fillRect(x - 20, y + 31, 40, 3);
    if (s === 0) {
      ctx.fillStyle = body;
      rr(x - 18, y - 6, 30, 37, 3);
      ctx.fill();
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.arc(x - 3, y + 2, 8, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#d0d6dc';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x - 3, y + 2, 8, busy ? T * 12 : 0, (busy ? T * 12 : 0) + 5);
      ctx.stroke();
      ctx.fillStyle = '#c8ced5';
      ctx.fillRect(x - 14, y + 12, 24, 2);
    } else if (s === 1) {
      const ram = busy ? Math.max(0, Math.sin(T * 9 + i)) * 7 : 0;
      ctx.fillStyle = body;
      ctx.fillRect(x - 17, y - 4, 5, 36);
      ctx.fillRect(x + 9, y - 4, 5, 36);
      ctx.fillRect(x - 17, y - 6, 31, 6);
      ctx.fillStyle = '#c9ced5';
      ctx.fillRect(x - 3, y - 4, 4, 4 + ram);
      ctx.fillStyle = dark;
      ctx.fillRect(x - 9, y + ram, 16, 5);
      ctx.fillStyle = '#3a3d42';
      ctx.fillRect(x - 11, y + 16, 20, 5);
      ctx.fillStyle = '#f2b705';
      for (let k = 0; k < 4; k++) ctx.fillRect(x - 17 + k * 8, y - 6, 4, 2);
    } else if (s === 2) {
      ctx.fillStyle = body;
      ctx.fillRect(x + 4, y - 8, 6, 40);
      ctx.fillRect(x - 12, y - 8, 22, 8);
      ctx.fillStyle = dark;
      ctx.fillRect(x - 6, y, 6, 8 + (busy ? Math.sin(T * 6) * 2 : 0));
      ctx.fillStyle = '#3a3d42';
      ctx.fillRect(x - 14, y + 16, 24, 5);
      ctx.strokeStyle = '#c9ced5';
      ctx.lineWidth = 1;
      const a = busy ? T * 20 : 0;
      ctx.beginPath();
      ctx.moveTo(x - 3 + Math.cos(a) * 3, y + 10);
      ctx.lineTo(x - 3 - Math.cos(a) * 3, y + 10);
      ctx.stroke();
    } else {
      ctx.fillStyle = body;
      rr(x - 18, y + 6, 34, 25, 2);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.fillRect(x - 14, y - 8, 16, 12);
      ctx.fillStyle = busy ? `rgba(90,255,150,${0.6 + 0.3 * Math.sin(T * 8)})` : 'rgba(90,255,150,.2)';
      ctx.fillRect(x - 12, y - 6, 12, 8);
      ctx.fillStyle = '#c9ced5';
      ctx.fillRect(x + 4, y + 2, 8, 3);
    }
  } else if (t === 2) {
    // Semi-automatique : carter orange, pupitre, voyant
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(x - 21, y + 31, 42, 3);
    ctx.fillStyle = '#c4621f';
    rr(x - 20, y - 8, 36, 39, 3);
    ctx.fill();
    ctx.fillStyle = '#8a3f12';
    ctx.fillRect(x - 20, y + 22, 36, 9);
    ctx.fillStyle = '#1b1d21';
    rr(x - 15, y - 3, 22, 16, 2);
    ctx.fill();
    // fenêtre d'usinage
    ctx.fillStyle = busy ? 'rgba(255,190,90,.35)' : 'rgba(120,140,160,.2)';
    ctx.fillRect(x - 13, y - 1, 18, 12);
    if (busy) {
      const k = (T * 3 + i) % 1;
      if (s === 1) ctx.fillStyle = '#d9dde2', ctx.fillRect(x - 6, y - 1 + Math.abs(Math.sin(T * 10)) * 5, 4, 4);
      else if (s === 2) ctx.fillStyle = '#d9dde2', ctx.fillRect(x - 5 + Math.sin(T * 30) * 1, y, 2, 9);
      else ctx.fillStyle = '#d9dde2', ctx.fillRect(x - 12 + k * 14, y + 6, 3, 2);
    }
    ctx.fillStyle = '#2a2d32';
    ctx.fillRect(x + 8, y - 6, 6, 10);
    glowDot(x + 11, y - 3, 1.3, busy ? '90,255,150' : '255,176,46', busy ? 0.9 : 0.6);
    ctx.fillStyle = '#e8e2d0';
    ctx.fillRect(x - 18, y + 24, 10, 3);
  } else if (t === 3) {
    // Robotisé : bras articulé jaune sur socle
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(x - 20, y + 31, 40, 3);
    ctx.fillStyle = '#3a3d42';
    ctx.fillRect(x - 18, y + 16, 34, 15);
    ctx.fillStyle = '#f2b705';
    for (let k = 0; k < 5; k++) ctx.fillRect(x - 18 + k * 7, y + 16, 3.5, 2);
    ctx.fillStyle = '#25282d';
    ctx.fillRect(x - 6, y + 8, 12, 9);
    const a1 = -1.2 + (busy ? Math.sin(T * 6 + i * 1.3) * 0.5 : 0);
    const a2 = 1.4 + (busy ? Math.cos(T * 6 + i * 1.3) * 0.6 : 0);
    const bx = x;
    const by = y + 8;
    const ex = bx + Math.cos(a1) * 16;
    const ey = by + Math.sin(a1) * 16;
    const hx = ex + Math.cos(a1 + a2) * 13;
    const hy = ey + Math.sin(a1 + a2) * 13;
    ctx.strokeStyle = '#e8a90a';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(ex, ey);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.fillStyle = '#2b2e33';
    ctx.beginPath();
    ctx.arc(bx, by, 3, 0, TAU);
    ctx.arc(ex, ey, 2.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#9aa1aa';
    ctx.fillRect(hx - 2, hy - 1, 4, 4);
    if (busy && s === 1 && Math.sin(T * 6 + i * 1.3) > 0.95) glowDot(hx, hy + 3, 1.5, '255,200,120', 0.8);
    glowDot(x + 12, y + 20, 1, busy ? '90,255,150' : '255,176,46', 0.8);
  } else {
    // Usine noire : carter intégré, bandeau de LED
    ctx.fillStyle = '#17191d';
    rr(x - 21, y - 6, 42, 37, 2);
    ctx.fill();
    ctx.strokeStyle = '#262a30';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 20.5, y - 5.5, 41, 36);
    const n = 6;
    for (let k = 0; k < n; k++) {
      const on = busy && ((T * 8 + k + i) % n) < 3;
      glowDot(x - 15 + k * 6, y - 1, 1, '79,216,255', on ? 0.95 : 0.25);
    }
    ctx.fillStyle = busy ? 'rgba(79,216,255,.12)' : 'rgba(79,216,255,.04)';
    ctx.fillRect(x - 17, y + 4, 34, 14);
    if (i < MAX_UNITS - 1 || s < 3) {
      ctx.fillStyle = '#0d0e10';
      ctx.fillRect(x + 21, y + 10, 18, 4);
    }
  }
  // pièce en cours
  if (busy && t < 4) {
    const m = c.material;
    if (s === 0) lopin(x, y + 5, m);
    else if (s === 1) lopin(x + 1, y + (t ? 14 : 5), m);
    else piece(x - 1, y + (t ? 13 : 4), 3.6, m, s === 2 ? T * 3 : 0);
  } else if (busy) {
    piece(x, y + 11, 3, c.material, T * 5);
  }
  // progression
  if (busy && t < 3) {
    ctx.fillStyle = '#16181b';
    ctx.fillRect(x - 16, y + 35, 32, 2);
    ctx.fillStyle = '#f2b705';
    ctx.fillRect(x - 16, y + 35, 32 * clamp(u.prog / stationCycle(S, c, st, s), 0, 1), 2);
  }
  // usure (visible avec le superviseur) ; sinon fumée quand une machine fatigue
  if (t > 0 && !u.broken && u.service <= 0) {
    if (S.roles.supervisor && u.wear > 0.25) {
      ctx.fillStyle = '#16181b';
      ctx.fillRect(x + 19, y + 4, 2.5, 24);
      ctx.fillStyle = u.wear > 0.7 ? '#ff5a4a' : u.wear > 0.5 ? '#ffb02e' : '#57d987';
      ctx.fillRect(x + 19, y + 4 + 24 * (1 - u.wear), 2.5, 24 * u.wear);
    }
    if (u.wear > 0.6 && busy && Math.random() < 0.04 * (u.wear - 0.5) * 4 && !O.reduced) {
      smoke(hallX(ci) + x + 8, hallY(ci) + y - 4, 'rgba(70,70,74,.45)', 2.2, 1.1);
    }
  }
  if (u.broken) {
    const on = Math.sin(T * 8) > 0;
    glowDot(x + 14, y - 4, 2.5, on ? '255,59,43' : '90,21,16', on ? 1 : 0.8);
    if (Math.random() < 0.12 && !O.reduced) smoke(hallX(ci) + x, hallY(ci) + y);
  }
  if (u.service > 0) {
    ctx.fillStyle = '#ffb02e';
    ctx.font = '7px "Share Tech Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${u.serviceKind === 'repair' ? 'réparation' : 'révision'} ${Math.ceil(u.service)} s`, x, y - 12);
    glowDot(x - 14, y - 4, 1.8, '255,176,46', Math.sin(T * 6) > 0 ? 1 : 0.3);
  }
  if (O.hover && O.hover.hall === ci && O.hover.station === s && O.hover.unit === i) {
    ctx.strokeStyle = '#ffd84a';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 2]);
    ctx.strokeRect(x - 24, y - 12, 48, 50);
    ctx.setLineDash([]);
  }
}

let curHall = 0;
const hallX = (i: number) => hallOrigin(i, S.chains.length).x;
const hallY = (i: number) => hallOrigin(i, S.chains.length).y;

function workerXY(w: Worker): { x: number; y: number; moving: boolean } {
  let pos = w.pos;
  let moving = false;
  let targetY = FLOOR + 14;
  if (w.state === 'walk' && w.walkTotal > 0) {
    pos = w.ts - (w.ts - w.from) * (w.timer / w.walkTotal);
    moving = true;
  }
  if ((w.state === 'walk' || w.state === 'work') && w.tu >= 0) targetY = LY[w.tu] + 34;
  return { x: posX(pos), y: targetY, moving };
}

function drawWorker(w: Worker, idx: number, dt: number): void {
  if (w.state === 'train') return;
  const p = workerXY(w);
  let r = WPOS.get(w.id);
  if (!r) {
    r = { x: p.x, y: p.y, anim: Math.random() * 6 };
    WPOS.set(w.id, r);
  }
  const idleOff = w.state === 'idle' ? ((idx % 5) - 2) * 5 : 0;
  r.x = p.x + idleOff;
  r.y += (p.y - r.y) * (1 - Math.exp(-dt * 10));
  r.anim += dt * 6 * (O.rev > 0.5 ? 1.8 : 1);
  const x = r.x;
  const y = r.y;
  const moving = p.moving || Math.abs(p.y - r.y) > 1;
  const step = moving ? Math.sin(r.anim * 2) * 1.6 : 0;
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.beginPath();
  ctx.ellipse(x, y + 0.5, 4, 1.2, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#23262b';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x - 1, y - 7);
  ctx.lineTo(x - 1 + step, y);
  ctx.moveTo(x + 1, y - 7);
  ctx.lineTo(x + 1 - step, y);
  ctx.stroke();
  const coat = ['#7a5c3e', '#7a5c3e', '#2f5fa8', '#c4621f', '#2b8a5a'][w.level];
  ctx.fillStyle = coat;
  rr(x - 3, y - 15, 6, 9, 1.5);
  ctx.fill();
  if (w.level >= 2) {
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    ctx.fillRect(x - 3, y - 11, 6, 0.8);
  }
  ctx.strokeStyle = '#e7b892';
  ctx.lineWidth = 1.3;
  const sw = w.state === 'work' ? Math.sin(r.anim * 2.4) * 3 : 0;
  ctx.beginPath();
  ctx.moveTo(x + 2, y - 13);
  ctx.lineTo(x + 6, y - 10 + sw);
  ctx.stroke();
  ctx.fillStyle = '#e7b892';
  ctx.beginPath();
  ctx.arc(x, y - 18, 2.3, 0, TAU);
  ctx.fill();
  ctx.fillStyle = w.level >= 2 ? '#f2b705' : '#5a4632';
  if (w.name === 'Marcel') ctx.fillStyle = '#9aa1aa';
  ctx.beginPath();
  ctx.arc(x, y - 18.6, 2.6, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(x - 3, y - 19, 6.6, 0.8);
  if (w.state === 'walk' && w.ts > 0) lopin(x + 6, y - 9, S.chains[w.chain].material);
  if (w.name === 'Marcel' || (O.hover && O.hover.worker === w.id)) {
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.font = '6px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(w.name, x, y - 25);
  }
  if (O.hover && O.hover.worker === w.id) {
    ctx.strokeStyle = '#ffd84a';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(x, y - 9, 7, 14, 0, 0, TAU);
    ctx.stroke();
  }
}

function drawBuffers(c: Chain, ci: number): void {
  const m = c.material;
  for (let s = 1; s < 4; s++) {
    const x = (SX[s - 1] + SX[s]) / 2;
    const n = c.buf[s];
    for (let k = 0; k < Math.min(n, BUFFER_CAP); k++) {
      const cx = x - 6 + (k % 3) * 6;
      const cy = FLOOR + 12 - Math.floor(k / 3) * 4.5;
      if (s === 1) lopin(cx, cy, m);
      else piece(cx, cy, 2.7, m, 0);
    }
    if (n >= BUFFER_CAP) {
      ctx.fillStyle = '#ff5a4a';
      ctx.font = '7px "Share Tech Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('plein', x, FLOOR + 24);
    }
  }
  // caisse de produits finis
  const x = 356;
  const y = FLOOR + 4;
  ctx.fillStyle = '#8a6440';
  ctx.fillRect(x - 14, y, 28, 16);
  ctx.strokeStyle = '#5a3f24';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 13.5, y + 0.5, 27, 15);
  ctx.beginPath();
  ctx.moveTo(x - 14, y + 8);
  ctx.lineTo(x + 14, y + 8);
  ctx.stroke();
  const n = Math.min(S.stock[m], 6);
  for (let k = 0; k < n; k++) piece(x - 9 + k * 3.6, y - 2, 2.4, m, k);
  if (ci === 0) {
    ctx.fillStyle = '#d8d2c2';
    ctx.font = '600 7px "Share Tech Mono", monospace';
    ctx.textAlign = 'center';
    const total = S.stock.reduce((a, b) => a + b, 0);
    ctx.fillText(`${total} prêts`, x, y + 24);
  }
}

function drawOverlay(c: Chain): void {
  if (!S.roles.foreman) return;
  const caps = stationCapacities(S, c);
  const b = bottleneckOf(S, c);
  ctx.font = '600 7px "Share Tech Mono", monospace';
  ctx.textAlign = 'center';
  for (let s = 0; s < 4; s++) {
    const x = SX[s];
    ctx.fillStyle = 'rgba(10,11,9,.82)';
    rr(x - 27, 74, 54, 11, 2);
    ctx.fill();
    ctx.fillStyle = s === b ? '#ff6b5a' : '#ffb02e';
    ctx.fillText((s === b ? 'GOULOT ' : '') + caps[s].toFixed(2).replace('.', ',') + '/s', x, 79.8);
  }
}

function drawRoles(): void {
  // L'encadrement se tient près de la porte du premier hall.
  const order: [keyof GameState['roles'], string][] = [
    ['foreman', '#e9ecef'], ['supervisor', '#d0e4ff'], ['hr', '#ffd0e0'], ['logistics', '#ffe6a8'], ['sales', '#c8f0d0'], ['controller', '#e0d0ff'],
  ];
  let k = 0;
  for (const [id, col] of order) {
    if (!S.roles[id]) continue;
    const x = 368 - k * 9;
    const y = FLOOR - 4;
    ctx.fillStyle = col;
    rr(x - 3, y - 15, 6, 9, 1.5);
    ctx.fill();
    ctx.fillStyle = '#e7b892';
    ctx.beginPath();
    ctx.arc(x, y - 18, 2.3, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#c9a46a';
    ctx.fillRect(x - 7, y - 13, 4, 5);
    ctx.strokeStyle = '#23262b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 1, y - 7);
    ctx.lineTo(x - 1, y);
    ctx.moveTo(x + 1, y - 7);
    ctx.lineTo(x + 1, y);
    ctx.stroke();
    k++;
  }
}

function drawInterior(c: Chain, ci: number, dt: number): void {
  drawRoom(c, ci);
  for (let s = 0; s < 4; s++) {
    const st = c.stations[s];
    for (let i = 0; i < st.units.length; i++) drawUnit(c, ci, s, i);
    for (let i = st.units.length; i < MAX_UNITS; i++) {
      ctx.strokeStyle = 'rgba(255,255,255,.07)';
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(SX[s] - 20, LY[i] + 6, 40, 28);
      ctx.setLineDash([]);
    }
  }
  drawBuffers(c, ci);
  if (ci === 0) drawRoles();
  const ws = S.workers.filter((w) => w.chain === ci);
  ws.sort((a, b) => (WPOS.get(a.id)?.y ?? 0) - (WPOS.get(b.id)?.y ?? 0));
  ws.forEach((w, k) => drawWorker(w, k, dt));
  drawOverlay(c);
  // pénombre de nuit
  const amb = ambient(S.t);
  const style = hallStyle(c);
  const lights = lightLevel(style);
  const dark = style === 'black' ? 0.55 : (1 - amb) * 0.18 + (1 - lights) * 0.6;
  if (dark > 0.01) {
    ctx.fillStyle = `rgba(4,6,14,${dark})`;
    ctx.fillRect(0, 0, HALL_W, HALL_H);
  }
}

// ------------------------------------------------------------------ Extérieur

function drawExterior(c: Chain, ci: number): void {
  const style = hallStyle(c);
  const amb = ambient(S.t);
  const lights = lightLevel(style);
  const wall = style === 'black' ? '#15171b' : style === 'forge' ? '#7a4a36' : '#8b939c';
  // toit en sheds
  ctx.fillStyle = style === 'black' ? '#0c0d10' : '#4b5259';
  for (let k = 0; k < 5; k++) {
    ctx.beginPath();
    ctx.moveTo(k * 80, 60);
    ctx.lineTo(k * 80 + 60, 20);
    ctx.lineTo(k * 80 + 80, 20);
    ctx.lineTo(k * 80 + 80, 60);
    ctx.fill();
    ctx.fillStyle = style === 'black' ? '#10141a' : mix([60, 70, 90], [170, 205, 230], amb);
    ctx.beginPath();
    ctx.moveTo(k * 80 + 62, 22);
    ctx.lineTo(k * 80 + 78, 22);
    ctx.lineTo(k * 80 + 78, 58);
    ctx.fill();
    ctx.fillStyle = style === 'black' ? '#0c0d10' : '#4b5259';
  }
  ctx.fillStyle = wall;
  ctx.fillRect(0, 60, HALL_W, FLOOR - 40);
  ctx.strokeStyle = 'rgba(0,0,0,.18)';
  ctx.lineWidth = 2;
  for (let x = 6; x < HALL_W; x += 12) {
    ctx.beginPath();
    ctx.moveTo(x, 62);
    ctx.lineTo(x, FLOOR + 20);
    ctx.stroke();
  }
  // fenêtres éclairées
  const working = c.stations.some((st) => st.units.some((u) => u.busy));
  for (let k = 0; k < 6; k++) {
    const x = 24 + k * 62;
    const lit = (1 - amb) * 0.8 * lights * (working ? 1 : 0.4);
    ctx.fillStyle = style === 'black' ? '#0a0b0d' : `rgba(${Math.round(60 + 195 * lit)},${Math.round(70 + 150 * lit)},${Math.round(90 + 40 * lit)},1)`;
    ctx.fillRect(x, 110, 40, 60);
    ctx.fillStyle = 'rgba(0,0,0,.4)';
    ctx.fillRect(x + 19, 110, 2, 60);
    ctx.fillRect(x, 139, 40, 2);
    if (style === 'black') glowDot(x + 20, 140, 2, '79,216,255', working ? 0.6 + 0.3 * Math.sin(O.T * 3 + k) : 0.15);
    else if (lit > 0.3 && glow) {
      glow.fillStyle = `rgba(255,200,120,${lit * 0.5})`;
      glow.fillRect(x, 110, 40, 60);
    }
  }
  // portail
  ctx.fillStyle = style === 'black' ? '#1c1f24' : '#5d646d';
  ctx.fillRect(160, 200, 80, FLOOR + 20 - 200);
  ctx.strokeStyle = 'rgba(0,0,0,.3)';
  for (let y = 205; y < FLOOR + 20; y += 7) {
    ctx.beginPath();
    ctx.moveTo(160, y);
    ctx.lineTo(240, y);
    ctx.stroke();
  }
  // bandeau matériau et numéro
  ctx.fillStyle = MATERIAL_COLORS[c.material];
  ctx.fillRect(0, 74, HALL_W, 10);
  ctx.fillStyle = 'rgba(0,0,0,.65)';
  rr(150, 86, 100, 20, 3);
  ctx.fill();
  ctx.fillStyle = '#ffb02e';
  ctx.font = '14px "Share Tech Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`CHAÎNE ${ci + 1}`, 200, 96.5);
  // cheminée et fumée
  if (style !== 'black') {
    ctx.fillStyle = '#5a4a40';
    ctx.fillRect(330, -10, 18, 40);
    if (working && Math.random() < 0.25 && !O.reduced) smoke(hallX(ci) + 339, hallY(ci) - 12, 'rgba(200,200,205,.35)', 6, 3);
  }
  // voyant de panne
  const broken = c.stations.some((st) => st.units.some((u) => u.broken));
  if (broken) glowDot(380, 70, 6, '255,59,43', Math.sin(O.T * 8) > 0 ? 1 : 0.3);
  else glowDot(380, 70, 4, working ? '90,255,150' : '255,176,46', 0.7);
  if (robotChain(c)) glowDot(20, 70, 3, '79,216,255', 0.6);
  // sol
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.fillRect(-10, FLOOR + 20, HALL_W + 20, 6);
}

function drawGround(): void {
  const n = S.chains.length;
  const b = siteBounds(n);
  const amb = ambient(S.t);
  ctx.fillStyle = mix([28, 32, 30], [96, 104, 96], amb);
  ctx.fillRect(b.x - 2000, b.y - 60, b.w + 4000, b.h + 2000);
  // routes entre les rangées
  const cols = gridCols(n);
  const rows = Math.ceil(n / cols);
  ctx.fillStyle = mix([22, 24, 28], [70, 74, 80], amb);
  for (let r = 0; r < rows; r++) {
    const y = r * (HALL_H + 90) + HALL_H + 18;
    ctx.fillRect(b.x - 2000, y, b.w + 4000, 40);
    ctx.fillStyle = mix([120, 100, 30], [242, 183, 5], amb);
    for (let x = b.x - 2000; x < b.x + b.w + 2000; x += 40) ctx.fillRect(x, y + 19, 20, 2);
    ctx.fillStyle = mix([22, 24, 28], [70, 74, 80], amb);
  }
}

function drawSky(cw: number, ch: number): void {
  const amb = ambient(S.t);
  const g = ctx.createLinearGradient(0, 0, 0, ch);
  g.addColorStop(0, mix([10, 14, 30], [120, 170, 215], amb));
  g.addColorStop(1, mix([30, 26, 44], [200, 222, 236], amb));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cw, ch);
  const d = daylight(S.t);
  if (d > 0.02) {
    ctx.fillStyle = `rgba(255,236,190,${0.6 * d})`;
    ctx.beginPath();
    ctx.arc(cw * 0.82, ch * 0.12, 26, 0, TAU);
    ctx.fill();
  }
}

// ------------------------------------------------------------------ Entrée

export interface DrawTarget {
  ctx: CanvasRenderingContext2D;
  glow: CanvasRenderingContext2D | null;
  cw: number;
  ch: number;
}

export function drawScene(t: DrawTarget, s: GameState, cam: Camera, o: SceneOpts, dt: number): void {
  ctx = t.ctx;
  glow = t.glow;
  S = s;
  O = o;
  const { cw, ch } = t;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (glow) {
    glow.setTransform(1, 0, 0, 1, 0, 0);
    glow.clearRect(0, 0, cw, ch);
  }
  const n = s.chains.length;
  const single = n === 1;
  if (single) {
    ctx.fillStyle = '#15171a';
    ctx.fillRect(0, 0, cw, ch);
  } else drawSky(cw, ch);
  const base = (wx: number, wy: number) => {
    const m: [number, number, number, number, number, number] = [cam.zoom, 0, 0, cam.zoom, cw / 2 + (wx - cam.x) * cam.zoom, ch / 2 + (wy - cam.y) * cam.zoom];
    ctx.setTransform(...m);
    if (glow) glow.setTransform(...m);
  };
  if (!single) {
    base(0, 0);
    drawGround();
  }
  const hallPx = HALL_W * cam.zoom;
  const interior = hallPx >= 330;
  for (let ci = 0; ci < n; ci++) {
    const o2 = hallOrigin(ci, n);
    // hors écran ?
    const sx = cw / 2 + (o2.x - cam.x) * cam.zoom;
    const sy = ch / 2 + (o2.y - cam.y) * cam.zoom;
    if (sx > cw || sy > ch || sx + hallPx < 0 || sy + HALL_H * cam.zoom < -60 * cam.zoom) continue;
    curHall = ci;
    base(o2.x, o2.y);
    ctx.save();
    ctx.beginPath();
    ctx.rect(-2, interior ? 0 : -40, HALL_W + 4, HALL_H + (interior ? 0 : 60));
    ctx.clip();
    if (interior) drawInterior(s.chains[ci], ci, dt);
    else drawExterior(s.chains[ci], ci);
    ctx.restore();
    if (o.selected === ci && n > 1) {
      ctx.strokeStyle = '#f2b705';
      ctx.lineWidth = 3 / cam.zoom;
      ctx.strokeRect(-3, interior ? -3 : 17, HALL_W + 6, interior ? HALL_H + 6 : HALL_H - 14);
    }
  }
  void curHall;
  // particules
  base(0, 0);
  for (const p of particles) {
    const a = p.life / p.max;
    ctx.globalAlpha = a;
    ctx.fillStyle = p.col;
    if (p.smoke) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size + (1 - a) * 4, 0, TAU);
      ctx.fill();
    } else {
      ctx.fillRect(p.x, p.y, p.size, p.size);
      if (glow && p.glow) {
        glow.globalAlpha = a;
        glow.fillStyle = p.col;
        glow.fillRect(p.x - 1, p.y - 1, p.size + 2, p.size + 2);
        glow.globalAlpha = 1;
      }
    }
  }
  ctx.globalAlpha = 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // vignettage rouge en zone rouge
  if (o.red) {
    const g = ctx.createRadialGradient(cw / 2, ch / 2, ch * 0.3, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
    g.addColorStop(0, 'rgba(255,40,20,0)');
    g.addColorStop(1, `rgba(255,40,20,${0.18 + 0.08 * Math.sin(o.T * 10)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, ch);
  }
  if (glow) glow.setTransform(1, 0, 0, 1, 0, 0);
}

/** Élément sous le curseur (coordonnées écran en pixels du canvas). */
export function hitTest(s: GameState, cam: Camera, px: number, py: number, cw: number, ch: number): Hover | null {
  const n = s.chains.length;
  const w = cam.toWorld(px, py, cw, ch);
  for (let ci = 0; ci < n; ci++) {
    const o = hallOrigin(ci, n);
    const lx = w.x - o.x;
    const ly = w.y - o.y;
    if (lx < 0 || ly < 0 || lx > HALL_W || ly > HALL_H) continue;
    if (HALL_W * cam.zoom < 330) return { hall: ci, station: -1, unit: -1, worker: -1 };
    // ouvriers d'abord
    let best = -1;
    let bd = 9;
    for (const wk of s.workers) {
      if (wk.chain !== ci || wk.state === 'train') continue;
      const r = WPOS.get(wk.id);
      if (!r) continue;
      const d = Math.hypot(lx - r.x, ly - (r.y - 10));
      if (d < bd) {
        bd = d;
        best = wk.id;
      }
    }
    if (best >= 0) return { hall: ci, station: -1, unit: -1, worker: best };
    for (let st = 0; st < 4; st++) {
      if (Math.abs(lx - SX[st]) > 26) continue;
      for (let i = 0; i < s.chains[ci].stations[st].units.length; i++) {
        if (ly >= LY[i] - 12 && ly < LY[i] + 38) return { hall: ci, station: st, unit: i, worker: -1 };
      }
      if (ly > FLOOR - 10) return { hall: ci, station: st, unit: -1, worker: -1 };
    }
    return { hall: ci, station: -1, unit: -1, worker: -1 };
  }
  return null;
}

/** Position écran (px canvas) d'un point d'un hall, pour placer les effets. */
export function worldOfStation(s: GameState, ci: number, st: number, unit: number): { x: number; y: number } {
  const o = hallOrigin(ci, s.chains.length);
  return { x: o.x + SX[st], y: o.y + LY[Math.max(0, unit)] + 4 };
}

export function materialColor(m: number): string {
  return MATERIAL_COLORS[m] ?? MATERIALS[0].id;
}
