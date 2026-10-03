/**
 * Vue de loin : ciel, horizon (la vieille forge au loin, la tour de Ferrum), terrain, routes et
 * réverbères, bâtiments texturés selon l'époque, parkings qui se remplissent avec les embauches,
 * camions qui viennent charger quand l'usine produit, annexe (énergie, cantine).
 */
import { ambient, dayPhase, daylight, windFactor } from '../sim/env';
import { robotFactory } from '../sim/formulas';
import type { Factory } from '../sim/types';
import { ERAS, eraOf } from './era';
import { hallStyle, lightLevel } from './interior';
import type { HallStyle } from './interior';
import { ANNEX_W, FLOOR, GAP_X, HALL_H, HALL_W, ROOF_H, gridCols, hallOrigin, siteBounds, turbinePos } from './layout';
import { smoke } from './particles';
import { MATERIAL_COLORS, R, SIG, TAU, ambientRect, bevel, contact, glowDot, lamp, mix, rr, signal, tag, uiFont, volume } from './rctx';
import type { Camera } from './scene';
import { pat } from './textures';
import { guardX, guards } from './workers';

const hash = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Multiplicateur de lumière dehors (effets complets) : jour plein à 1, nuit bleutée. */
function outdoorLight(): number[] {
  const amb = ambient(R.S.t);
  return [0.3 + 0.7 * amb, 0.34 + 0.66 * amb, 0.52 + 0.48 * amb];
}

/** Voile de nuit pour le rendu 2D seul (avec la carte de lumière, inutile). */
function nightVeil(x: number, y: number, w: number, h: number, k = 1): void {
  if (R.light) return;
  const a = (1 - ambient(R.S.t)) * 0.55 * k;
  if (a < 0.01) return;
  R.ctx.fillStyle = `rgba(8,12,30,${a})`;
  R.ctx.fillRect(x, y, w, h);
}

// ------------------------------------------------------------------ Ciel et horizon

export function drawSky(cw: number, ch: number): void {
  const ctx = R.ctx;
  const S = R.S;
  const amb = ambient(S.t);
  const p = dayPhase(S.t);
  const d = daylight(S.t);
  const low = 1 - Math.min(1, d * 2.2);
  const g = ctx.createLinearGradient(0, 0, 0, ch);
  g.addColorStop(0, mix([8, 12, 28], [104, 160, 212], amb));
  g.addColorStop(0.6, mix([24, 22, 44], [176, 208, 232], amb));
  // lever et coucher : l'horizon rougit
  g.addColorStop(1, mix(mix3([30, 26, 44], [255, 170, 110], d > 0 ? low * 0.8 : 0), [214, 230, 240], amb * (1 - low * 0.6)));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cw, ch);
  // étoiles et lune
  if (amb < 0.45) {
    const a = (0.45 - amb) / 0.45;
    for (let k = 0; k < 90; k++) {
      const tw = R.O.reduced ? 1 : 0.6 + 0.4 * Math.sin(R.O.T * (1 + hash(k) * 3) + k);
      ctx.fillStyle = `rgba(255,255,240,${a * tw * (0.4 + hash(k + 9) * 0.6)})`;
      ctx.fillRect(hash(k + 1) * cw, hash(k + 2) * ch * 0.55, 1.2, 1.2);
    }
    ctx.fillStyle = `rgba(240,240,225,${0.85 * a})`;
    ctx.beginPath();
    ctx.arc(cw * 0.18, ch * 0.14, 14, 0, TAU);
    ctx.fill();
    ctx.fillStyle = mix([8, 12, 28], [104, 160, 212], amb);
    ctx.beginPath();
    ctx.arc(cw * 0.18 + 6, ch * 0.14 - 3, 12, 0, TAU);
    ctx.fill();
  }
  // soleil : il traverse le ciel
  if (d > 0.02) {
    const sx = cw * (0.1 + 0.8 * (p / 0.5));
    const sy = ch * (0.42 - 0.34 * Math.sin(p * TAU));
    const sg = ctx.createRadialGradient(sx, sy, 4, sx, sy, 90);
    sg.addColorStop(0, `rgba(255,244,214,${0.55 * d})`);
    sg.addColorStop(1, 'rgba(255,244,214,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(sx - 90, sy - 90, 180, 180);
    ctx.fillStyle = `rgba(255,248,226,${0.85 * d})`;
    ctx.beginPath();
    ctx.arc(sx, sy, 20, 0, TAU);
    ctx.fill();
    if (R.glow) {
      R.glow.fillStyle = `rgba(255,236,190,${0.6 * d})`;
      R.glow.beginPath();
      R.glow.arc(sx, sy, 26, 0, TAU);
      R.glow.fill();
    }
  }
  // nuages qui dérivent avec le vent
  const wind = windFactor(S.t);
  for (let k = 0; k < 7; k++) {
    const w = 140 + hash(k + 30) * 160;
    const speed = R.O.reduced ? 0 : (4 + wind * 10) * (0.6 + hash(k + 40));
    const x = ((hash(k + 50) * (cw + w * 2) + R.O.T * speed) % (cw + w * 2)) - w;
    const y = ch * (0.06 + hash(k + 60) * 0.3);
    const col = mix([40, 42, 60], [250, 250, 252], amb);
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.18 + 0.3 * amb;
    for (let j = 0; j < 5; j++) {
      ctx.beginPath();
      ctx.ellipse(x + (j - 2) * w * 0.18, y + Math.sin(j * 2.3 + k) * 6, w * (0.16 + 0.06 * Math.sin(j + k)), 14 + 6 * Math.cos(j + k), 0, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

const mix3 = (a: number[], b: number[], k: number) => a.map((v, i) => v + (b[i] - v) * k);

/** Silhouettes à l'horizon : elles changent avec le marché conquis (parallaxe légère). */
export function drawBackdrop(cw: number, hy: number, cam: Camera): void {
  const ctx = R.ctx;
  const S = R.S;
  const act = Math.min(S.act, 4);
  const amb = ambient(S.t);
  const z = Math.min(1.6, cam.zoom);
  const par = -cam.x * cam.zoom * 0.15;
  const far = mix([18, 22, 34], [150, 172, 190], amb);
  const near = mix([14, 18, 26], [118, 136, 150], amb);
  // brume au ras de l'horizon
  const haze = ctx.createLinearGradient(0, hy - 80 * z, 0, hy);
  haze.addColorStop(0, 'rgba(255,255,255,0)');
  haze.addColorStop(1, mix([30, 30, 50], [220, 228, 232], amb).replace('rgb', 'rgba').replace(')', ',.35)'));
  ctx.fillStyle = haze;
  ctx.fillRect(0, hy - 80 * z, cw, 80 * z);
  // collines
  ctx.fillStyle = far;
  ctx.beginPath();
  ctx.moveTo(0, hy);
  for (let x = 0; x <= cw + 20; x += 20) {
    const w = (x - par * 0.5) / (180 * z);
    ctx.lineTo(x, hy - (22 + 18 * Math.sin(w) + 10 * Math.sin(w * 2.3 + 1)) * z);
  }
  ctx.lineTo(cw, hy);
  ctx.fill();
  // la vieille forge du grand-père, là-bas, dont la cheminée fume encore
  if (S.act >= 2) {
    const fx = par * 0.5 + cw * 0.12;
    const fy = hy - (16 + 4 * Math.sin(fx / (180 * z))) * z;
    ctx.fillStyle = near;
    ctx.fillRect(fx, fy - 10 * z, 22 * z, 10 * z);
    ctx.beginPath();
    ctx.moveTo(fx - 2 * z, fy - 10 * z);
    ctx.lineTo(fx + 11 * z, fy - 17 * z);
    ctx.lineTo(fx + 24 * z, fy - 10 * z);
    ctx.fill();
    ctx.fillRect(fx + 16 * z, fy - 22 * z, 3 * z, 10 * z);
    if (amb < 0.5) {
      ctx.fillStyle = `rgba(255,190,110,${0.7 * (1 - amb * 2)})`;
      ctx.fillRect(fx + 4 * z, fy - 7 * z, 3 * z, 3 * z);
    }
  }
  if (act < 2) return;
  const unit = 26 * z;
  const start = Math.floor(-par / unit) - 2;
  const count = Math.ceil(cw / unit) + 4;
  if (act === 2) {
    ctx.fillStyle = near;
    for (let k = 0; k < count; k++) {
      const i = start + k;
      if (hash(i) < 0.45) continue;
      const x = i * unit + par;
      const h = (10 + 14 * hash(i + 7)) * z;
      ctx.beginPath();
      ctx.arc(x, hy - h, h * 0.55, 0, TAU);
      ctx.arc(x + h * 0.3, hy - h * 0.8, h * 0.4, 0, TAU);
      ctx.fill();
      ctx.fillRect(x - 1.5 * z, hy - h, 3 * z, h);
    }
    return;
  }
  // ville (acte III) ou mégapole (acte IV)
  const maxH = act === 3 ? 46 : 120;
  let ferrumX = -1;
  for (let k = 0; k < count; k++) {
    const i = start + k;
    if (hash(i) < (act === 3 ? 0.5 : 0.2)) continue;
    const x = i * unit + par;
    const h = (12 + maxH * Math.pow(hash(i + 3), act === 3 ? 1.6 : 2.2)) * z;
    const w = unit * (0.6 + 0.35 * hash(i + 11));
    ctx.fillStyle = near;
    ctx.fillRect(x, hy - h, w, h);
    if (amb < 0.5) {
      ctx.fillStyle = `rgba(255,214,140,${0.5 * (1 - amb * 2)})`;
      for (let r = 0; r < h / (7 * z) - 1; r++) if (hash(i * 31 + r) > 0.6) ctx.fillRect(x + w * 0.3, hy - h + 4 * z + r * 7 * z, 2 * z, 2 * z);
    }
    if (act === 4 && hash(i + 19) > 0.93) {
      ctx.fillStyle = near;
      ctx.fillRect(x + w / 2, hy - h - 30 * z, 2 * z, 30 * z);
      ctx.fillRect(x + w / 2 - 20 * z, hy - h - 30 * z, 40 * z, 2 * z);
      glowDot(x + w / 2 + 19 * z, hy - h - 30 * z, 1.4 * z, '255,60,40', Math.sin(R.O.T * 2 + i) > 0.5 ? 0.9 : 0.15);
    }
    if (act === 4 && ferrumX < 0 && x > cw * 0.55 && x < cw * 0.8) ferrumX = x;
  }
  if (act === 3) {
    ctx.strokeStyle = near;
    ctx.lineWidth = 1;
    for (let k = 0; k < count; k += 5) {
      const x = (start + k) * unit + par;
      ctx.beginPath();
      ctx.moveTo(x - 6 * z, hy);
      ctx.lineTo(x, hy - 40 * z);
      ctx.lineTo(x + 6 * z, hy);
      ctx.moveTo(x - 8 * z, hy - 32 * z);
      ctx.lineTo(x + 8 * z, hy - 32 * z);
      ctx.stroke();
    }
  }
  if (act === 4 && ferrumX >= 0) ferrumTower(ferrumX, hy, z, near, amb);
}

/** Le siège de Ferrum Industries ; après le rachat, l'enseigne change. */
function ferrumTower(x: number, hy: number, z: number, col: string, amb: number): void {
  const ctx = R.ctx;
  const ours = R.S.ended;
  const h = 170 * z;
  const w = 34 * z;
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(x, hy);
  ctx.lineTo(x, hy - h + 20 * z);
  ctx.lineTo(x + w / 2, hy - h);
  ctx.lineTo(x + w, hy - h + 20 * z);
  ctx.lineTo(x + w, hy);
  ctx.fill();
  ctx.fillRect(x + w / 2 - 0.8 * z, hy - h - 26 * z, 1.6 * z, 26 * z);
  glowDot(x + w / 2, hy - h - 26 * z, 1.6 * z, '255,60,40', Math.sin(R.O.T * 1.5) > 0 ? 0.95 : 0.2);
  const text = ours ? 'ROUAGES & CIE' : 'FERRUM';
  const rgb = ours ? '255,176,46' : '255,70,60';
  const a = 0.55 + 0.45 * (1 - amb);
  ctx.font = `700 ${Math.max(4, 6.5 * z)}px "Saira Stencil One", "Chakra Petch", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = `rgba(${rgb},${a})`;
  ctx.save();
  ctx.translate(x + w / 2, hy - h + 40 * z);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(text, -20 * z, 0);
  ctx.restore();
  if (R.glow) {
    R.glow.fillStyle = `rgba(${rgb},${a * 0.6})`;
    R.glow.fillRect(x + w / 2 - 4 * z, hy - h + 6 * z, 8 * z, 70 * z);
  }
}

// ------------------------------------------------------------------ Terrain

/** Terrain, routes, trottoirs, réverbères et arbres d'alignement. */
export function drawGround(top: number): void {
  const ctx = R.ctx;
  const S = R.S;
  const n = S.factories.length;
  const b = siteBounds(n);
  const amb = ambient(S.t);
  const X0 = b.x - 3000;
  const W = b.w + 6000;
  ctx.fillStyle = pat(ctx, 'grass');
  ctx.fillRect(X0, top, W, b.h + 3000);
  // talus à l'horizon
  const g = ctx.createLinearGradient(0, top, 0, top + 24);
  g.addColorStop(0, 'rgba(0,0,0,.25)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(X0, top, W, 24);
  ambientRect(X0, top, W, b.h + 3000, outdoorLight());
  // routes entre les rangées de halls
  const cols = gridCols(n);
  const rows = Math.ceil(n / cols);
  for (let r = 0; r < rows; r++) {
    const y = r * (HALL_H + 90) + HALL_H + 18;
    ctx.fillStyle = pat(ctx, 'gravel');
    ctx.fillRect(b.x - 2000, y - 4, b.w + 4000, 4);
    ctx.fillRect(b.x - 2000, y + 40, b.w + 4000, 4);
    ctx.fillStyle = pat(ctx, 'asphalt');
    ctx.fillRect(b.x - 2000, y, b.w + 4000, 40);
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.fillRect(b.x - 2000, y, b.w + 4000, 1.4);
    ctx.fillStyle = 'rgba(230,226,210,.75)';
    for (let x = b.x - 2000; x < b.x + b.w + 2000; x += 40) ctx.fillRect(x, y + 19, 20, 1.6);
    ctx.fillStyle = 'rgba(230,226,210,.5)';
    ctx.fillRect(b.x - 2000, y + 2.5, b.w + 4000, 0.8);
    ctx.fillRect(b.x - 2000, y + 36.7, b.w + 4000, 0.8);
    // réverbères le long de la route
    for (let x = Math.floor((b.x - 400) / 140) * 140; x < b.x + b.w + 400; x += 140) streetLamp(x + 30, y - 2, amb);
  }
  nightVeil(X0, top, W, b.h + 3000, 0.9);
  // arbres d'alignement entre les halls (jusqu'aux années 90)
  if (S.act <= 3) {
    for (let i = 0; i < n; i++) {
      const o = hallOrigin(i, n);
      if (i % cols === cols - 1) continue;
      for (const k of [0, 1]) tree(o.x + HALL_W + GAP_X / 2 + (k ? 14 : -14), o.y + FLOOR + 28 - k * 6, 1 + hash(i * 3 + k) * 0.35);
    }
  }
}

function streetLamp(x: number, y: number, amb: number): void {
  const ctx = R.ctx;
  ctx.fillStyle = '#3a3d42';
  ctx.fillRect(x - 0.8, y - 34, 1.6, 34);
  ctx.fillRect(x - 0.8, y - 34, 9, 1.4);
  ctx.fillStyle = '#2b2e33';
  ctx.fillRect(x + 5, y - 34, 6, 2.6);
  const on = amb < 0.55;
  if (on) {
    const k = Math.min(1, (0.55 - amb) / 0.3);
    glowDot(x + 8, y - 31, 1.6, '255,206,140', 0.95 * k);
    lamp(x + 8, y + 10, 34, [255, 200, 130], 0.9 * k, 0.6);
    if (!R.light) {
      const g = R.ctx.createRadialGradient(x + 8, y + 12, 2, x + 8, y + 12, 34);
      g.addColorStop(0, `rgba(255,206,140,${0.22 * k})`);
      g.addColorStop(1, 'rgba(255,206,140,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 26, y - 22, 68, 68);
    }
  }
}

function tree(x: number, y: number, s: number): void {
  const ctx = R.ctx;
  const amb = ambient(R.S.t);
  contact(x, y, 12 * s, 3 * s, 0.35);
  ctx.fillStyle = '#4a3626';
  ctx.fillRect(x - 1.2 * s, y - 12 * s, 2.4 * s, 12 * s);
  const leaf = mix([20, 30, 22], [74, 104, 58], amb);
  const hi = mix([30, 42, 30], [110, 140, 74], amb);
  const sway = R.O.reduced ? 0 : Math.sin(R.O.T * 0.8 + x) * 0.8 * windFactor(R.S.t);
  for (const [dx, dy, r, c] of [[-4, -16, 7, leaf], [4, -17, 7, leaf], [0, -22, 7.5, leaf], [-1.5, -21, 4, hi], [3, -18, 3.5, hi]] as const) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(x + (dx + sway) * s, y + dy * s, r * s, 0, TAU);
    ctx.fill();
  }
}

// ------------------------------------------------------------------ Bâtiments

/** Matière de la façade selon l'époque. */
function facade(style: HallStyle): { tex: Parameters<typeof pat>[1]; band: string; roof: string } {
  if (style === 'black') return { tex: 'graphite', band: '#0e1013', roof: '#0c0d10' };
  const ei = style === 'forge' ? 0 : eraOf(R.S.act);
  return [
    { tex: 'brick' as const, band: '#5a3a2a', roof: '#4b4f55' },
    { tex: 'blockCream' as const, band: '#4f7a62', roof: '#50565c' },
    { tex: 'cladding' as const, band: '#2b3a4a', roof: '#5a616a' },
    { tex: 'panel' as const, band: '#2f3640', roof: '#6a7078' },
  ][ei];
}

export function drawExterior(f: Factory, ci: number, panels: number): void {
  const ctx = R.ctx;
  const S = R.S;
  const style = hallStyle(f);
  const black = style === 'black';
  const ei = style === 'forge' ? 0 : eraOf(S.act);
  const era = ERAS[black ? 3 : ei];
  const amb = ambient(S.t);
  const lights = lightLevel(style);
  const fc = facade(style);
  const working = f.lines.some((l) => l.slots.some((m) => m && m.busy));
  contact(HALL_W / 2, FLOOR + 20, HALL_W * 0.6, 8, 0.5);
  // toit en sheds : versant de tôle, verrière orientée au nord
  for (let k = 0; k < 5; k++) {
    ctx.fillStyle = black ? fc.roof : pat(ctx, 'roofSheet');
    ctx.beginPath();
    ctx.moveTo(k * 80, 60);
    ctx.lineTo(k * 80 + 60, 20);
    ctx.lineTo(k * 80 + 80, 20);
    ctx.lineTo(k * 80 + 80, 60);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.2)';
    ctx.beginPath();
    ctx.moveTo(k * 80, 60);
    ctx.lineTo(k * 80 + 60, 20);
    ctx.lineTo(k * 80 + 62, 22);
    ctx.lineTo(k * 80 + 4, 60);
    ctx.fill();
    ctx.fillStyle = black ? '#10141a' : mix([60, 70, 90], [170, 205, 230], amb);
    ctx.beginPath();
    ctx.moveTo(k * 80 + 62, 22);
    ctx.lineTo(k * 80 + 78, 22);
    ctx.lineTo(k * 80 + 78, 58);
    ctx.fill();
    if (!black && amb < 0.5 && working) {
      // la verrière laisse voir la lumière de l'atelier
      ctx.fillStyle = `rgba(${era.lamp.join(',')},${0.5 * (1 - amb * 2) * lights})`;
      ctx.beginPath();
      ctx.moveTo(k * 80 + 62, 22);
      ctx.lineTo(k * 80 + 78, 22);
      ctx.lineTo(k * 80 + 78, 58);
      ctx.fill();
    }
  }
  // équipements de toiture (années 90 et après) ; panneaux solaires
  if (ei >= 2 || black) {
    for (const x of [44, 204]) {
      ctx.fillStyle = pat(ctx, 'castGrey');
      ctx.fillRect(x, 8, 22, 12);
      ctx.fillStyle = '#1b1d21';
      ctx.beginPath();
      ctx.arc(x + 11, 14, 4, 0, TAU);
      ctx.fill();
    }
  }
  for (let k = 0; k < panels; k++) {
    const slot = k % 12;
    const sx = Math.floor(slot / 2.4) * 80 + (slot % 2) * 28 + 6;
    const t = (sx % 80) / 62;
    solarPanel(sx, 60 - t * 40 * 0.9 - 6, 24, 6);
  }
  // façade
  ctx.fillStyle = pat(ctx, fc.tex, 1.3);
  ctx.fillRect(0, 60, HALL_W, FLOOR - 40);
  if (ei === 1 && !black) {
    ctx.fillStyle = pat(ctx, 'blockGreen', 1.3);
    ctx.fillRect(0, 300, HALL_W, FLOOR + 20 - 300);
  }
  let g = ctx.createLinearGradient(0, 60, 0, FLOOR + 20);
  g.addColorStop(0, 'rgba(0,0,0,.25)');
  g.addColorStop(0.15, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,.2)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 60, HALL_W, FLOOR - 40);
  // acrotère : enseigne de la société
  ctx.fillStyle = fc.band;
  ctx.fillRect(0, 60, HALL_W, 14);
  bevel(ctx, 0, 60, HALL_W, 14);
  ctx.fillStyle = MATERIAL_COLORS[f.material];
  ctx.fillRect(0, 74, HALL_W, 6);
  ctx.font = `${ei === 0 ? '700 11px "Saira Stencil One", serif' : '700 10px "Chakra Petch", sans-serif'}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = black ? 'rgba(79,216,255,.85)' : ei === 0 ? '#efe2c0' : '#ffffff';
  ctx.fillText(ei === 0 ? 'FORGE ROUAGES & CIE' : 'ROUAGES & CIE', 120, 67.5);
  if (black && R.glow) {
    R.glow.fillStyle = 'rgba(79,216,255,.4)';
    R.glow.fillRect(50, 63, 140, 9);
  }
  // fenêtres : allumées la nuit, couleur de la lumière de l'époque
  for (let k = 0; k < 6; k++) {
    const x = 24 + k * 62;
    if (k === 2 || k === 3) continue;
    const lit = (1 - amb) * lights * (working ? 1 : 0.35);
    ctx.fillStyle = '#1b1d21';
    ctx.fillRect(x - 2, 108, 44, 64);
    if (black) {
      ctx.fillStyle = '#0a0b0d';
      ctx.fillRect(x, 110, 40, 60);
      glowDot(x + 20, 140, 2, '79,216,255', working ? 0.6 + 0.3 * Math.sin(R.O.T * 3 + k) : 0.15);
      continue;
    }
    const day = mix([60, 70, 90], [150, 180, 200], amb);
    ctx.fillStyle = day;
    ctx.fillRect(x, 110, 40, 60);
    if (lit > 0.05) {
      ctx.fillStyle = `rgba(${era.lamp.join(',')},${Math.min(1, lit * 1.1)})`;
      ctx.fillRect(x, 110, 40, 60);
      // silhouettes de machines à contre-jour
      ctx.fillStyle = `rgba(30,30,34,${0.6 * lit})`;
      ctx.fillRect(x + 4, 150, 12, 20);
      ctx.fillRect(x + 22, 144, 10, 26);
      if (R.glow) {
        R.glow.fillStyle = `rgba(${era.lamp.join(',')},${lit * 0.5})`;
        R.glow.fillRect(x, 110, 40, 60);
      }
      lamp(x + 20, 140, 40, era.lamp, lit * 1.2);
      lamp(x + 20, 200, 50, era.lamp, lit * 0.4, 0.5);
    }
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.fillRect(x + 2, 112, 5, 56);
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.fillRect(x + 19, 110, 2, 60);
    ctx.fillRect(x, 139, 40, 2);
    ctx.fillStyle = ei === 0 ? '#8a7f70' : '#6d737b';
    ctx.fillRect(x - 3, 171, 46, 2.4);
  }
  // ronde de l'équipe de nuit : la lampe passe derrière les fenêtres basses
  for (let k = 0; k < guards(); k++) glowDot(guardX(ci, k), FLOOR + 6, 2.4, '255,240,190', 0.8);
  // portail et quai de chargement
  ctx.fillStyle = '#1b1d21';
  ctx.fillRect(156, 196, 88, FLOOR + 20 - 196);
  ctx.fillStyle = black ? '#1c1f24' : pat(ctx, 'roofSheet', 1.4);
  ctx.fillRect(160, 200, 80, FLOOR + 20 - 200);
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  for (let y = 205; y < FLOOR + 20; y += 7) ctx.fillRect(160, y, 80, 1);
  for (let k = 0; k < 22; k++) {
    ctx.fillStyle = k % 2 ? '#1b1d21' : '#f2b705';
    ctx.fillRect(156, 196 + k * 8.4, 4, 8.4);
    ctx.fillRect(240, 196 + k * 8.4, 4, 8.4);
  }
  ctx.fillStyle = pat(ctx, 'castGrey');
  ctx.fillRect(150, FLOOR + 12, 100, 8);
  bevel(ctx, 150, FLOOR + 12, 100, 8);
  ctx.fillStyle = '#16181b';
  ctx.fillRect(154, FLOOR + 13, 6, 6);
  ctx.fillRect(240, FLOOR + 13, 6, 6);
  glowDot(200, 190, 1.8, working ? '255,214,150' : '120,110,90', working ? 0.8 : 0.3);
  lamp(200, 220, 50, [255, 214, 150], working ? 0.6 * (1 - amb) : 0);
  // une rangée de fenêtres basses par chaîne équipée
  f.lines.forEach((l, k) => {
    const nb = l.slots.filter(Boolean).length;
    const busy = l.slots.some((m) => m && m.busy);
    for (let j = 0; j < 4; j++) {
      ctx.fillStyle = j < nb ? (busy ? '#ffcf6b' : '#8a7a50') : 'rgba(0,0,0,.35)';
      ctx.fillRect(16 + j * 9, 196 + k * 12, 6, 7);
      if (j < nb && busy) lamp(19 + j * 9, 199 + k * 12, 6, [255, 207, 107], 0.6);
    }
  });
  // cheminée et fumée (forge, années 70)
  if (!black && ei <= 1) {
    ctx.fillStyle = pat(ctx, ei === 0 ? 'brick' : 'concreteDark');
    ctx.fillRect(330, -14, 18, 48);
    ctx.fillStyle = '#2b2d31';
    ctx.fillRect(328, -16, 22, 3);
    if (working && Math.random() < 0.25 && !R.O.reduced) smoke(R.ox + 339, R.oy - 16, 'rgba(200,200,205,.35)', 6, 3);
  }
  nightVeil(0, 0, HALL_W, FLOOR + 22);
  // voyant d'état de l'usine
  const broken = f.lines.some((l) => l.slots.some((m) => m && m.broken));
  signal(382, 90, 4, broken ? SIG.fault : working ? SIG.run : SIG.wait, !broken || R.O.reduced || Math.sin(R.O.T * 8) > 0);
  if (robotFactory(f)) glowDot(20, 90, 3, '79,216,255', 0.6);
  // parking : une voiture par tranche de trois personnes
  const staff = S.workers.filter((w) => w.factory === ci).length;
  const cars = Math.min(9, Math.ceil(staff / 3));
  ctx.fillStyle = 'rgba(230,226,210,.5)';
  for (let k = 0; k <= 9; k++) ctx.fillRect(264 + k * 13, FLOOR + 26, 0.8, 14);
  for (let k = 0; k < cars; k++) car(270.5 + k * 13, FLOOR + 38, 5 + ci * 3 + k, ei);
  // numéro d'usine, lisible de loin
  tag(`USINE ${ci + 1}`, 200, 94, uiFont(12, 16), '#ffb02e');
}

/** Voiture garée, vue de face ; le modèle suit l'époque. */
function car(x: number, y: number, seed: number, ei: number): void {
  const ctx = R.ctx;
  const cols = ['#a3312a', '#2f5fa8', '#d8d4c8', '#3e6b4a', '#1d1f23', '#c4a020', '#7a7f87'];
  const c = cols[Math.floor(hash(seed) * cols.length)];
  contact(x, y + 0.5, 6.5, 1.4, 0.5);
  ctx.fillStyle = c;
  rr(x - 5, y - 5, 10, 4.5, ei === 0 ? 2 : 1, ctx);
  ctx.fill();
  ctx.beginPath();
  if (ei <= 1) ctx.ellipse(x, y - 5.2, 3.8, 2.6, 0, Math.PI, 0);
  else rr(x - 3.8, y - 8.4, 7.6, 3.6, 1, ctx);
  ctx.fill();
  ctx.fillStyle = 'rgba(160,190,210,.55)';
  ctx.fillRect(x - 3, y - 7.6, 6, 2.2);
  ctx.fillStyle = '#1b1d21';
  ctx.fillRect(x - 5, y - 1, 2, 1.4);
  ctx.fillRect(x + 3, y - 1, 2, 1.4);
  ctx.fillStyle = 'rgba(255,250,220,.8)';
  ctx.fillRect(x - 4.4, y - 3.6, 1.4, 1);
  ctx.fillRect(x + 3, y - 3.6, 1.4, 1);
}

// ------------------------------------------------------------------ Circulation

/** Camions : chaque usine qui produit en fait venir un, qui s'arrête au quai puis repart. */
export function drawTraffic(): void {
  const S = R.S;
  const n = S.factories.length;
  const cols = gridCols(n);
  const ei = eraOf(S.act);
  for (let i = 0; i < n; i++) {
    const f = S.factories[i];
    if (!f.lines.some((l) => l.slots.some((m) => m && m.busy))) continue;
    const o = hallOrigin(i, n);
    const period = 34;
    const ph = (((R.O.reduced ? 10 : R.O.T) + i * 7.3) % period) / period;
    const roadY = o.y + HALL_H + 18 + 30;
    const dock = o.x + 200;
    let x: number;
    if (ph < 0.18) x = dock - (1 - ph / 0.18) ** 2 * 420;
    else if (ph < 0.7) x = dock;
    else x = dock + ((ph - 0.7) / 0.3) ** 2 * 520;
    truck(x, roadY, ei, MATERIAL_COLORS[f.material], ph >= 0.18 && ph < 0.7);
  }
  // un peu de circulation de passage
  const rows = Math.ceil(n / cols);
  const b = siteBounds(n);
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < 1 + Math.min(3, S.act); k++) {
      const span = b.w + 800;
      const sp = 26 + hash(r * 9 + k) * 20;
      const x = b.x - 400 + ((hash(r * 5 + k) * span + (R.O.reduced ? 0 : R.O.T * sp)) % span);
      sideCar(x, r * (HALL_H + 90) + HALL_H + 18 + 13, r * 7 + k, ei);
    }
  }
}

/** Camion vu de profil : cabine, remorque aux couleurs de la société. */
function truck(x: number, y: number, ei: number, cargo: string, docked: boolean): void {
  const ctx = R.ctx;
  contact(x, y + 1, 30, 2.4, 0.5);
  // remorque
  ctx.fillStyle = ei >= 2 ? '#e8ebee' : '#c9c2ae';
  rr(x - 30, y - 22, 42, 18, 1.2, ctx);
  ctx.fill();
  rr(x - 30, y - 22, 42, 18, 1.2, ctx);
  volume(ctx, y - 22, y - 4, 0.15, 0.25);
  ctx.fillStyle = '#c4621f';
  ctx.fillRect(x - 30, y - 9, 42, 2);
  ctx.fillStyle = '#2b2620';
  ctx.font = '700 4.2px "Chakra Petch", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ROUAGES & CIE', x - 9, y - 15);
  ctx.fillStyle = cargo;
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = (k * TAU) / 6;
    ctx.lineTo(x + 6 + Math.cos(a) * 2.6, y - 15 + Math.sin(a) * 2.6);
  }
  ctx.fill();
  // cabine
  ctx.fillStyle = ei === 0 ? '#3e6b4a' : ei === 1 ? '#a3312a' : ei === 2 ? '#2f5fa8' : '#2b2e33';
  rr(x + 13, y - 18, 13, 14, 2, ctx);
  ctx.fill();
  ctx.fillStyle = 'rgba(160,200,230,.7)';
  ctx.fillRect(x + 18, y - 16, 7, 5);
  ctx.fillStyle = '#16181b';
  for (const wx of [x - 24, x - 16, x + 20]) {
    ctx.beginPath();
    ctx.arc(wx, y - 3, 3, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#5b6068';
    ctx.beginPath();
    ctx.arc(wx, y - 3, 1.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#16181b';
  }
  const night = 1 - ambient(R.S.t);
  if (night > 0.3) {
    glowDot(x + 26, y - 7, 1.1, '255,250,220', 0.9);
    lamp(x + 40, y - 4, 22, [255, 250, 220], 0.7 * night, 0.4);
  }
  glowDot(x - 30, y - 7, 0.9, '255,40,30', 0.85);
  if (docked) glowDot(x + 2, y - 24, 0.9, SIG.wait, R.O.reduced || Math.sin(R.O.T * 6) > 0 ? 0.9 : 0.2);
}

function sideCar(x: number, y: number, seed: number, ei: number): void {
  const ctx = R.ctx;
  const cols = ['#a3312a', '#2f5fa8', '#d8d4c8', '#3e6b4a', '#c4a020'];
  ctx.fillStyle = cols[Math.floor(hash(seed + 3) * cols.length)];
  rr(x - 8, y - 5, 16, 4, 1.5, ctx);
  ctx.fill();
  ctx.beginPath();
  if (ei <= 1) ctx.ellipse(x - 1, y - 5, 5, 3, 0, Math.PI, 0);
  else rr(x - 5, y - 8, 9, 3.4, 1.2, ctx);
  ctx.fill();
  ctx.fillStyle = 'rgba(160,200,230,.6)';
  ctx.fillRect(x - 4, y - 7.4, 6, 2);
  ctx.fillStyle = '#16181b';
  for (const wx of [x - 5, x + 5]) {
    ctx.beginPath();
    ctx.arc(wx, y - 1, 1.8, 0, TAU);
    ctx.fill();
  }
  if (ambient(R.S.t) < 0.4) glowDot(x + 8, y - 3, 0.8, '255,250,220', 0.9);
}

// ------------------------------------------------------------------ Annexe : énergie, cantine

const ROOF_SLOTS = 12;

export function solarSplit(): { perHall: number[]; ground: number } {
  const S = R.S;
  const n = S.factories.length;
  const total = S.energy.solar;
  const perHall = S.factories.map((_, i) => Math.min(ROOF_SLOTS, Math.floor(total / n) + (i < total % n ? 1 : 0)));
  const used = perHall.reduce((a, b) => a + b, 0);
  return { perHall, ground: total - used };
}

function solarPanel(x: number, y: number, w: number, h: number): void {
  const ctx = R.ctx;
  const d = daylight(R.S.t);
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, '#2a3e64');
  g.addColorStop(1, '#16223a');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(140,170,220,.45)';
  ctx.lineWidth = 0.4;
  for (let k = 1; k < 4; k++) {
    ctx.beginPath();
    ctx.moveTo(x + (w * k) / 4, y);
    ctx.lineTo(x + (w * k) / 4, y + h);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(x, y + h / 2);
  ctx.lineTo(x + w, y + h / 2);
  ctx.stroke();
  if (d > 0.05) {
    ctx.fillStyle = `rgba(255,250,220,${0.4 * d})`;
    ctx.fillRect(x + 1, y + 1, w * 0.35, 1.2);
  }
  ctx.fillStyle = '#9aa1aa';
  ctx.fillRect(x, y + h, w, 1);
}

/** Toit en coupe au-dessus d'un hall (vue intérieure), avec ses panneaux. */
export function drawRoof(ci: number, panels: number): void {
  const ctx = R.ctx;
  const style = hallStyle(R.S.factories[ci]);
  for (let k = 0; k < 5; k++) {
    ctx.fillStyle = style === 'black' ? '#0e1013' : pat(ctx, 'roofSheet');
    ctx.beginPath();
    ctx.moveTo(k * 80, 0);
    ctx.lineTo(k * 80 + 62, -ROOF_H);
    ctx.lineTo(k * 80 + 80, -ROOF_H);
    ctx.lineTo(k * 80 + 80, 0);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.fillRect(k * 80 + 62, -ROOF_H, 18, ROOF_H);
  }
  for (let k = 0; k < panels; k++) {
    const slot = k % 12;
    const sx = Math.floor(slot / 2.4) * 80 + (slot % 2) * 28 + 6;
    const t = (sx % 80) / 62;
    solarPanel(sx, -t * ROOF_H * 0.9 - 6, 24, 6);
  }
  nightVeil(0, -ROOF_H, HALL_W, ROOF_H);
}

export function drawTurbines(): void {
  const ctx = R.ctx;
  const S = R.S;
  const n = S.factories.length;
  const total = S.energy.wind;
  const wf = windFactor(S.t);
  for (let i = 0; i < total; i++) {
    const p = turbinePos(i, total, n);
    const h = 120 - (Math.floor(i / 20) % 2) * 20;
    const g = ctx.createLinearGradient(p.x - 3, 0, p.x + 3, 0);
    g.addColorStop(0, '#eef1f4');
    g.addColorStop(1, '#a9b0b8');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(p.x - 3, p.y);
    ctx.lineTo(p.x + 3, p.y);
    ctx.lineTo(p.x + 1.2, p.y - h);
    ctx.lineTo(p.x - 1.2, p.y - h);
    ctx.fill();
    ctx.fillStyle = '#c6ccd3';
    rr(p.x - 4, p.y - h - 3, 10, 5, 1.5, ctx);
    ctx.fill();
    const a0 = (R.O.reduced ? 0 : R.O.T * (1.2 + 2.6 * wf)) + i * 0.7;
    for (let k = 0; k < 3; k++) {
      const a = a0 + (k * TAU) / 3;
      ctx.save();
      ctx.translate(p.x, p.y - h);
      ctx.rotate(a);
      ctx.fillStyle = '#eef1f4';
      ctx.beginPath();
      ctx.moveTo(0, -1.2);
      ctx.quadraticCurveTo(14, -2.4, 34, -0.3);
      ctx.lineTo(34, 0.4);
      ctx.quadraticCurveTo(14, 1.6, 0, 1.2);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.12)';
      ctx.fillRect(4, 0, 28, 0.6);
      ctx.restore();
    }
    ctx.fillStyle = '#dfe3e7';
    ctx.beginPath();
    ctx.arc(p.x, p.y - h, 1.6, 0, TAU);
    ctx.fill();
    glowDot(p.x, p.y - h - 2, 1.2, '255,60,40', Math.sin(R.O.T * 2 + i) > 0.6 ? 0.9 : 0.15);
  }
}

export function drawAnnex(groundSolar: number): void {
  const ctx = R.ctx;
  const S = R.S;
  const x0 = -ANNEX_W - 10;
  const amb = ambient(S.t);
  // terrain : gravier, clôture
  ctx.fillStyle = pat(ctx, 'gravel');
  ctx.fillRect(x0, 0, ANNEX_W, HALL_H);
  ctx.strokeStyle = 'rgba(200,205,210,.5)';
  ctx.lineWidth = 0.5;
  for (let x = x0; x <= x0 + ANNEX_W; x += 10) {
    ctx.beginPath();
    ctx.moveTo(x, HALL_H - 8);
    ctx.lineTo(x, HALL_H);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(x0, HALL_H - 7);
  ctx.lineTo(x0 + ANNEX_W, HALL_H - 7);
  ctx.moveTo(x0, HALL_H - 3);
  ctx.lineTo(x0 + ANNEX_W, HALL_H - 3);
  ctx.stroke();
  for (let k = 0; k < Math.min(groundSolar, 8); k++) {
    solarPanel(x0 + 10 + (k % 4) * 39, 12 + Math.floor(k / 4) * 16, 34, 8);
  }
  if (groundSolar > 8) tag(`+${groundSolar - 8} panneaux`, x0 + 50, 50, uiFont(9, 9), '#ffd84a');
  // batteries : conteneurs
  const nb = S.energy.battery;
  const cap = Math.max(1, nb * 10000);
  const charge = S.energy.charge / cap;
  for (let k = 0; k < nb; k++) {
    const bx = x0 + 10 + (k % 2) * 78;
    const by = 62 + Math.floor(k / 2) * 26;
    contact(bx + 36, by + 20, 38, 2.4, 0.4);
    ctx.fillStyle = pat(ctx, 'cladding', 0.6);
    ctx.fillRect(bx, by, 72, 20);
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.fillRect(bx, by, 72, 20);
    ctx.fillStyle = '#2f8a57';
    ctx.fillRect(bx, by, 72, 4);
    bevel(ctx, bx, by, 72, 20);
    ctx.fillStyle = '#1b1d21';
    ctx.fillRect(bx + 52, by + 8, 16, 6);
    signal(bx + 54 + 12 * Math.min(1, charge), by + 11, 1.4, charge > 0.2 ? SIG.run : SIG.fault, true);
  }
  // cantine : briques, toit de tuiles, fenêtres chaudes
  if (S.canteen > 0) {
    const cx = x0 + 18;
    const cy = HALL_H - 96;
    contact(cx + 65, cy + 92, 72, 4, 0.45);
    ctx.fillStyle = pat(ctx, 'brick', 0.8);
    ctx.fillRect(cx, cy, 130, 92);
    ctx.fillStyle = '#7a3a2a';
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy);
    ctx.lineTo(cx + 65, cy - 26);
    ctx.lineTo(cx + 136, cy);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.25)';
    ctx.lineWidth = 0.6;
    for (let k = 1; k < 6; k++) {
      ctx.beginPath();
      ctx.moveTo(cx - 6 + k * 3, cy - k * 4.3);
      ctx.lineTo(cx + 136 - k * 3, cy - k * 4.3);
      ctx.stroke();
    }
    ctx.fillStyle = '#f1ead8';
    ctx.fillRect(cx + 30, cy + 8, 70, 14);
    ctx.fillStyle = '#2a2620';
    ctx.font = '600 10px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('CANTINE', cx + 65, cy + 15.5);
    const lit = 0.35 + 0.65 * (1 - amb);
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = `rgba(255,${Math.round(190 + 40 * lit)},${Math.round(110 + 40 * lit)},${0.5 + 0.5 * lit})`;
      ctx.fillRect(cx + 12 + k * 40, cy + 34, 26, 22);
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.fillRect(cx + 24 + k * 40, cy + 34, 1.2, 22);
      if (R.glow && lit > 0.5) {
        R.glow.fillStyle = `rgba(255,200,120,${0.35 * lit})`;
        R.glow.fillRect(cx + 12 + k * 40, cy + 34, 26, 22);
      }
      lamp(cx + 25 + k * 40, cy + 45, 24, [255, 200, 130], lit * 0.8);
    }
    ctx.fillStyle = '#4a2c1e';
    ctx.fillRect(cx + 55, cy + 64, 20, 28);
    ctx.fillStyle = pat(ctx, 'brick', 0.8);
    ctx.fillRect(cx + 104, cy - 30, 10, 22);
    if (Math.random() < 0.08 && !R.O.reduced) smoke(cx + 109, cy - 32, 'rgba(220,220,225,.4)', 4, 2.4);
  } else if (nb === 0 && S.energy.solar === 0) {
    tag('Terrain disponible', x0 + ANNEX_W / 2, HALL_H - 40, uiFont(10, 10), 'rgba(242,183,5,.85)');
  }
  nightVeil(x0, -10, ANNEX_W, HALL_H + 10, 0.8);
}
