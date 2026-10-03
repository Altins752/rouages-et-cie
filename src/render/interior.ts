/**
 * Intérieur d'un hall : mur du fond et sol selon l'époque, éclairage, décor (horloge, calendrier, photo
 * du grand-père, radio, tasse de Marcel, pointeuse…), convoyeurs, bacs, machines, personnages,
 * et couche des signaux (cadences du contremaître, cadres de survol, comptes à rebours).
 */
import { BUFFER_CAP, ENERGY } from '../data/balance';
import { estimateFactory } from '../sim/analysis';
import { conveyorActive } from '../sim/engine';
import { ambient, dayPhase, daylight } from '../sim/env';
import { crankUseful, machineCycle } from '../sim/formulas';
import type { Factory, Line } from '../sim/types';
import { perMin } from '../ui/format';
import { STATION_NAMES } from '../ui/text';
import { BLACK_AMBIENT, ERAS, eraOf } from './era';
import type { Era } from './era';
import { CRANK_X, FLOOR, HALL_H, HALL_W, LY, ROW_BASE, SX } from './layout';
import { drawBin, drawMachine, machineState } from './machines';
import { smoke } from './particles';
import {
  MATERIAL_COLORS, R, SIG, TAU, ambientRect, bevel, clamp, contact, glowDot, heat, lamp, lightShape, mix, piece, rivets, rr, tag,
  uiFont, volume,
} from './rctx';
import { pat } from './textures';
import { WPOS, crankVacant, drawGuards, drawRoles, drawVacant, drawWorker, hlAlpha, pileX, rowY } from './workers';

/** Le sol commence sous le mur du fond. */
export const WALL_B = 100;

export type HallStyle = 'forge' | 'plant' | 'black';

export function hallStyle(f: Factory): HallStyle {
  let any = false;
  let black = true;
  for (const l of f.lines) for (const m of l.slots) {
    if (!m) continue;
    any = true;
    if (m.tier !== 4) black = false;
  }
  if (any && black) return 'black';
  return R.S.act <= 1 && R.S.stats.moves === 0 ? 'forge' : 'plant';
}

/** Lampes allumées (1) ou éteintes (0) ; la fin les éteint puis rallume la vieille forge. */
export function lightLevel(style: HallStyle): number {
  const fin = R.O.finale;
  if (fin) {
    if (fin.phase === 'off') return style === 'black' ? 0 : 1 - fin.k;
    return fin.k;
  }
  return style === 'black' ? 0 : 1;
}

function eraFor(style: HallStyle): Era {
  return ERAS[style === 'forge' ? 0 : Math.max(1, eraOf(R.S.act))];
}

const lerp3 = (a: readonly number[], b: readonly number[], k: number) => a.map((v, i) => v + (b[i] - v) * k);

// ------------------------------------------------------------------ Salle

function drawRoom(f: Factory, fi: number): void {
  const ctx = R.ctx;
  const S = R.S;
  const style = hallStyle(f);
  const black = style === 'black';
  const era = eraFor(style);
  const ei = ERAS.indexOf(era);
  const amb = ambient(S.t);
  const lights = lightLevel(style);
  const day = black ? 0 : daylight(S.t);

  // --- lumière ambiante du hall (carte de lumière)
  if (R.light) {
    const base = black ? BLACK_AMBIENT : lerp3(era.night, era.day, amb);
    const k = black ? (R.O.finale ? lights * 0.5 + 0.5 : 1) : 0.18 + 0.82 * lights;
    ambientRect(-2, -2, HALL_W + 4, HALL_H + 4, base.map((v) => v * k));
  }

  // --- mur du fond
  ctx.fillStyle = pat(ctx, black ? 'blackWall' : era.wall);
  ctx.fillRect(0, 0, HALL_W, WALL_B);
  if (era.dado && !black) {
    ctx.fillStyle = pat(ctx, era.dado);
    ctx.fillRect(0, 70, HALL_W, WALL_B - 70);
    ctx.fillStyle = '#2f4a3a';
    ctx.fillRect(0, 69, HALL_W, 1.4);
  }
  // ombre du plafond et pied de mur
  let g = ctx.createLinearGradient(0, 0, 0, 30);
  g.addColorStop(0, 'rgba(0,0,0,.45)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, HALL_W, 30);
  if (style === 'forge') {
    // suie au-dessus du foyer
    g = ctx.createRadialGradient(26, 40, 4, 26, 40, 60);
    g.addColorStop(0, 'rgba(10,8,6,.55)');
    g.addColorStop(1, 'rgba(10,8,6,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 90, WALL_B);
  }

  drawWindows(style, era, ei, amb, day);
  drawBeam(style, ei, lights, amb);

  // --- sol
  ctx.fillStyle = pat(ctx, black ? 'graphite' : era.floor);
  ctx.fillRect(0, WALL_B, HALL_W, HALL_H - WALL_B);
  g = ctx.createLinearGradient(0, WALL_B, 0, HALL_H);
  g.addColorStop(0, 'rgba(0,0,0,.42)');
  g.addColorStop(0.08, 'rgba(0,0,0,.16)');
  g.addColorStop(1, 'rgba(255,255,255,.04)');
  ctx.fillStyle = g;
  ctx.fillRect(0, WALL_B, HALL_W, HALL_H - WALL_B);
  // hiérarchie : le décor s'efface un peu derrière les machines et les gens
  ctx.fillStyle = 'rgba(22,20,18,.2)';
  ctx.fillRect(0, WALL_B, HALL_W, HALL_H - WALL_B);
  // plinthe
  ctx.fillStyle = black ? '#0b0c0e' : 'rgba(0,0,0,.45)';
  ctx.fillRect(0, WALL_B - 1.5, HALL_W, 2);
  if (era.floor === 'concrete' && !black) {
    // joints de dilatation
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    for (let x = 100; x < HALL_W; x += 100) ctx.fillRect(x, WALL_B, 0.8, HALL_H - WALL_B);
    ctx.fillRect(0, 211, HALL_W, 0.8);
  }
  if (era.floor === 'polished' && !black) {
    // reflets des lampes sur le béton poli
    for (let s = 0; s < 4; s++) {
      g = ctx.createLinearGradient(0, WALL_B, 0, WALL_B + 60);
      g.addColorStop(0, `rgba(255,255,255,${0.12 * lights})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(SX[s] - 5, WALL_B, 10, 60);
    }
  }
  drawFloorMarks(f, style, era, ei);
  drawSun(style, day);
  drawDecor(f, fi, style, ei, lights, amb);
  drawLamps(style, era, lights, amb);
}

/** Fenêtres et verrières : le ciel suit le jour ; jour et nuit éclairent le hall par là. */
function drawWindows(style: HallStyle, era: Era, ei: number, amb: number, day: number): void {
  const ctx = R.ctx;
  const black = style === 'black';
  const sky1 = mix([22, 26, 48], [150, 196, 230], amb);
  const sky2 = mix([40, 34, 60], [214, 234, 246], amb);
  const shape = ei === 0 ? { y: 12, h: 42, w: 46, n: 5, step: 76, x0: 24 } : ei === 1 ? { y: 16, h: 30, w: 58, n: 5, step: 76, x0: 18 }
    : ei === 2 ? { y: 10, h: 24, w: 70, n: 5, step: 78, x0: 10 } : { y: 8, h: 46, w: 64, n: 5, step: 77, x0: 14 };
  for (let i = 0; i < shape.n; i++) {
    const x = shape.x0 + i * shape.step;
    const { y, h, w } = shape;
    // embrasure
    ctx.fillStyle = black ? '#08090b' : 'rgba(0,0,0,.4)';
    ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
    if (black) {
      // verrières occultées
      ctx.fillStyle = pat(ctx, 'graphite');
      ctx.fillRect(x, y, w, h);
      continue;
    }
    const sg = ctx.createLinearGradient(0, y, 0, y + h);
    sg.addColorStop(0, sky1);
    sg.addColorStop(1, sky2);
    ctx.fillStyle = sg;
    if (ei === 0) {
      // fenêtre cintrée de la forge
      ctx.beginPath();
      ctx.moveTo(x, y + h);
      ctx.lineTo(x, y + 10);
      ctx.quadraticCurveTo(x + w / 2, y - 6, x + w, y + 10);
      ctx.lineTo(x + w, y + h);
      ctx.fill();
    } else ctx.fillRect(x, y, w, h);
    if (ei === 2) {
      // polycarbonate alvéolaire : laiteux
      ctx.fillStyle = `rgba(230,236,240,${0.35 + 0.25 * amb})`;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(0,0,0,.08)';
      for (let k = 0; k < w; k += 3) ctx.fillRect(x + k, y, 0.6, h);
    }
    if (amb < 0.3) {
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      for (let k = 0; k < 3; k++) ctx.fillRect(x + ((k * 17 + i * 11) % (w - 4)) + 2, y + 3 + ((k * 13 + i * 7) % (h - 8)), 0.8, 0.8);
    }
    // petits bois, châssis
    ctx.fillStyle = ei === 0 ? '#2a2724' : ei === 3 ? '#3a3f46' : '#2b2e33';
    const cols = ei === 0 ? 4 : ei === 1 ? 4 : ei === 2 ? 3 : 2;
    const rows = ei === 0 ? 4 : ei === 1 ? 2 : 1;
    for (let k = 1; k < cols; k++) ctx.fillRect(x + (w * k) / cols - 0.6, y, 1.2, h);
    for (let k = 1; k < rows; k++) ctx.fillRect(x, y + (h * k) / rows - 0.6, w, 1.2);
    if (ei === 1) {
      // verre armé
      ctx.strokeStyle = 'rgba(40,40,40,.12)';
      ctx.lineWidth = 0.3;
      for (let k = 0; k < w; k += 4) {
        ctx.beginPath();
        ctx.moveTo(x + k, y);
        ctx.lineTo(x + k, y + h);
        ctx.stroke();
      }
    }
    // reflet et salissures de verre
    ctx.fillStyle = `rgba(255,255,255,${0.06 + 0.16 * amb})`;
    ctx.beginPath();
    ctx.moveTo(x + 3, y + h);
    ctx.lineTo(x + 9, y + 2);
    ctx.lineTo(x + 13, y + 2);
    ctx.lineTo(x + 7, y + h);
    ctx.fill();
    if (ei <= 1) {
      g2(ctx, x, y + h - 12, w, 12);
    }
    // appui de fenêtre
    ctx.fillStyle = ei === 0 ? '#8a7f70' : '#6d737b';
    ctx.fillRect(x - 3, y + h + 1, w + 6, 2.2);
    bevel(ctx, x - 3, y + h + 1, w + 6, 2.2);
    // le jour (ou la lune) entre par là
    lamp(x + w / 2, y + h / 2, w * 0.7, mix3([120, 140, 190], [255, 246, 230], amb), 0.25 + 0.4 * amb);
    if (day > 0.05) lamp(x + w / 2, y + h + 6, w * 0.8, [255, 240, 210], 0.15 * day, 0.6);
  }
  void era;
}

/** Crasse en bas des vitres. */
function g2(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, 'rgba(90,80,60,0)');
  g.addColorStop(1, 'rgba(90,80,60,.3)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

const mix3 = (a: number[], b: number[], k: number) => a.map((v, i) => v + (b[i] - v) * k);

/** Poutre maîtresse : bois chevillé (forge), IPN (usines), pont roulant (à partir des années 90). */
function drawBeam(style: HallStyle, ei: number, lights: number, amb: number): void {
  const ctx = R.ctx;
  const black = style === 'black';
  const y = 60;
  if (ei === 0 && !black) {
    ctx.fillStyle = pat(ctx, 'wood', 1.4);
    ctx.fillRect(0, y, HALL_W, 8);
    ctx.beginPath();
    ctx.rect(0, y, HALL_W, 8);
    volume(ctx, y, y + 8);
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.fillRect(0, y + 7.2, HALL_W, 0.8);
    rivets(ctx, Array.from({ length: 10 }, (_, k) => [20 + k * 40, y + 4] as [number, number]), 0.9);
    // jambes de force
    ctx.fillStyle = pat(ctx, 'wood', 1.4);
    for (const x of [6, 394]) ctx.fillRect(x - 3, y + 8, 6, WALL_B - y - 8);
  } else {
    ctx.fillStyle = black ? '#121418' : pat(ctx, 'darkMetal');
    ctx.fillRect(0, y, HALL_W, 7);
    ctx.fillStyle = 'rgba(255,255,255,.12)';
    ctx.fillRect(0, y, HALL_W, 0.8);
    ctx.fillStyle = 'rgba(0,0,0,.4)';
    ctx.fillRect(0, y + 3, HALL_W, 0.8);
    ctx.fillRect(0, y + 6.2, HALL_W, 0.8);
    rivets(ctx, Array.from({ length: 20 }, (_, k) => [10 + k * 20, y + 1.8] as [number, number]), 0.45);
    if (ei >= 2 && !black) {
      // pont roulant : poutre jaune, chariot qui va et vient, crochet
      const tx = 60 + (Math.sin(R.O.T * 0.06) * 0.5 + 0.5) * 280;
      ctx.fillStyle = pat(ctx, 'yellow');
      ctx.fillRect(0, 52, HALL_W, 5);
      volume(ctx, 52, 57, 0.2, 0.3);
      ctx.fillStyle = '#1b1d21';
      for (let x = 0; x < HALL_W; x += 16) ctx.fillRect(x, 52, 8, 1);
      ctx.fillStyle = pat(ctx, 'darkMetal');
      ctx.fillRect(tx - 7, 50, 14, 9);
      ctx.strokeStyle = '#3a3d42';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(tx - 1, 59);
      ctx.lineTo(tx - 1, 74);
      ctx.moveTo(tx + 1, 59);
      ctx.lineTo(tx + 1, 74);
      ctx.stroke();
      ctx.fillStyle = '#f2b705';
      ctx.fillRect(tx - 3, 74, 6, 3);
      ctx.strokeStyle = '#9aa1aa';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.arc(tx, 79.5, 2, -0.3, Math.PI);
      ctx.stroke();
      glowDot(tx + 5, 56, 0.6, SIG.wait, R.O.reduced || Math.sin(R.O.T * 3) > 0 ? 0.9 : 0.2);
    }
  }
  void lights;
  void amb;
}

/** Luminaires suspendus au-dessus des colonnes de postes, et leur lumière. */
function drawLamps(style: HallStyle, era: Era, lights: number, amb: number): void {
  const ctx = R.ctx;
  const ei = ERAS.indexOf(era);
  if (style === 'black') return;
  for (let s = 0; s < 4; s++) {
    const x = SX[s];
    ctx.strokeStyle = '#15171a';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(x, 67);
    ctx.lineTo(x, 73);
    ctx.stroke();
    if (ei === 0) {
      // abat-jour émaillé vert, ampoule à filament
      ctx.fillStyle = '#3f5a48';
      ctx.beginPath();
      ctx.moveTo(x - 7, 79);
      ctx.quadraticCurveTo(x - 6, 73, x, 72.5);
      ctx.quadraticCurveTo(x + 6, 73, x + 7, 79);
      ctx.fill();
      ctx.fillStyle = '#e8e2d0';
      ctx.fillRect(x - 7, 78.6, 14, 0.7);
    } else if (ei === 1) {
      // cloche industrielle
      ctx.fillStyle = pat(ctx, 'castGrey');
      ctx.beginPath();
      ctx.moveTo(x - 8, 79);
      ctx.quadraticCurveTo(x, 70, x + 8, 79);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.3)';
      ctx.fillRect(x - 4, 74, 3, 0.6);
    } else if (ei === 2) {
      // réglette à deux tubes
      ctx.fillStyle = '#d4d8dc';
      ctx.fillRect(x - 13, 75, 26, 3);
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      ctx.fillRect(x - 13, 77.4, 26, 0.6);
    } else {
      // dalle LED
      ctx.fillStyle = '#c9ced5';
      ctx.fillRect(x - 11, 76, 22, 2);
    }
    const on = lights > 0.01;
    if (!on) continue;
    if (ei <= 1) glowDot(x, 79, 1.8, ei === 0 ? '255,214,150' : '255,232,190', 0.9 * lights);
    else {
      ctx.fillStyle = `rgba(250,252,255,${0.9 * lights})`;
      ctx.fillRect(x - (ei === 2 ? 12 : 10), ei === 2 ? 77.6 : 77.8, ei === 2 ? 24 : 20, 1);
      if (R.glow) {
        R.glow.fillStyle = `rgba(235,242,255,${0.8 * lights})`;
        R.glow.fillRect(x - 12, 77, 24, 2.4);
      }
    }
    if (R.light) {
      // le luminaire éclaire le mur et la plaque, puis le sol de la colonne
      lamp(x, 80, 26, era.lamp, 1.1 * lights);
      for (let l = 0; l < 4; l++) lamp(x - 6, LY[l] + 20, 52, era.lamp, (0.62 - 0.36 * amb) * lights, 0.62);
    } else {
      const a = (0.08 + 0.12 * (1 - amb)) * lights;
      const lg = ctx.createRadialGradient(x, 80, 2, x, 220, 170);
      lg.addColorStop(0, `rgba(${era.lamp.join(',')},${a})`);
      lg.addColorStop(1, `rgba(${era.lamp.join(',')},0)`);
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.moveTo(x - 6, 79);
      ctx.lineTo(x + 6, 79);
      ctx.lineTo(x + 40, FLOOR);
      ctx.lineTo(x - 40, FLOOR);
      ctx.fill();
    }
  }
  // plaques de poste, sous les luminaires
  const plate = [
    { bg: '#eee8d8', fg: '#1d2a5a', edge: '#1d2a5a' },
    { bg: '#e2b42c', fg: '#16140f', edge: '#16140f' },
    { bg: '#f1f3f4', fg: '#1d5a34', edge: '#3fae62' },
    { bg: '#2d3238', fg: '#f4f6f8', edge: '#f2b705' },
  ][ei];
  ctx.font = '600 7.5px "Chakra Petch", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let s = 0; s < 4; s++) {
    rr(SX[s] - 25, 83, 50, 11, ei === 0 ? 2.5 : 1, ctx);
    ctx.fillStyle = plate.bg;
    ctx.fill();
    ctx.lineWidth = 0.7;
    ctx.strokeStyle = plate.edge;
    rr(SX[s] - 24, 84, 48, 9, ei === 0 ? 2 : 0.6, ctx);
    ctx.stroke();
    ctx.fillStyle = plate.fg;
    ctx.fillText(STATION_NAMES[s], SX[s], 88.8);
    if (ei === 0) rivets(ctx, [[SX[s] - 22.5, 88.5], [SX[s] + 22.5, 88.5]], 0.6);
  }
}

/** Soleil des verrières : faisceaux, taches au sol, poussière qui flotte dans la lumière. */
function drawSun(style: HallStyle, day: number): void {
  if (style === 'black' || day < 0.05) return;
  const ctx = R.ctx;
  const p = dayPhase(R.S.t);
  const slant = Math.cos(p * TAU);
  const warm = Math.sin(p * TAU);
  const col = mix3([255, 186, 120], [255, 246, 226], clamp(warm * 1.3, 0, 1));
  const ei = style === 'forge' ? 0 : eraOf(R.S.act);
  const xs = ei === 0 ? [24, 100, 176, 252, 328] : ei === 1 ? [18, 94, 170, 246, 322] : ei === 2 ? [10, 88, 166, 244, 322] : [14, 91, 168, 245, 322];
  const w = ei === 0 ? 46 : ei === 1 ? 58 : ei === 2 ? 70 : 64;
  const wy = ei === 2 ? 34 : 54;
  const fy = 300;
  const dx = slant * 110;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (const x of xs) {
    const g = ctx.createLinearGradient(0, wy, 0, fy);
    g.addColorStop(0, `rgba(${col.map(Math.round).join(',')},${0.07 * day})`);
    g.addColorStop(1, `rgba(${col.map(Math.round).join(',')},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x, wy);
    ctx.lineTo(x + w, wy);
    ctx.lineTo(x + w + dx, fy);
    ctx.lineTo(x + dx, fy);
    ctx.fill();
  }
  ctx.restore();
  // poussière en suspension
  if (!R.O.reduced) {
    ctx.fillStyle = `rgba(255,248,230,${0.5 * day})`;
    for (let k = 0; k < 26; k++) {
      const a = (k * 0.618) % 1;
      const yk = wy + ((a * (fy - wy) + R.O.T * (2 + (k % 3))) % (fy - wy));
      const t = (yk - wy) / (fy - wy);
      const xk = xs[k % xs.length] + ((k * 0.37) % 1) * w + dx * t + Math.sin(R.O.T * 0.6 + k) * 2;
      ctx.fillRect(xk, yk, 0.7, 0.7);
    }
  }
  // taches de soleil sur le sol (carte de lumière)
  for (const x of xs) {
    lightShape((L) => {
      L.moveTo(x, wy);
      L.lineTo(x + w, wy);
      L.lineTo(x + w + dx, fy);
      L.lineTo(x + dx, fy);
    }, (L) => {
      const g = L.createLinearGradient(0, wy, 0, fy);
      g.addColorStop(0, `rgba(${col.map((v) => Math.round(v * 0.5)).join(',')},${0.03 * day})`);
      g.addColorStop(0.7, `rgba(${col.map((v) => Math.round(v * 0.5)).join(',')},${0.08 * day})`);
      g.addColorStop(1, `rgba(${col.map((v) => Math.round(v * 0.5)).join(',')},0)`);
      return g;
    });
  }
}

/** Marquages au sol : allées peintes, passages piétons, bandes de LED de l'usine noire. */
function drawFloorMarks(f: Factory, style: HallStyle, era: Era, ei: number): void {
  const ctx = R.ctx;
  const black = style === 'black';
  for (let l = 0; l < f.lines.length; l++) {
    const y0 = LY[l] - 16;
    const y1 = rowY(l) + 3;
    if (black) {
      ctx.fillStyle = 'rgba(79,216,255,.5)';
      ctx.fillRect(52, y1, 316, 0.7);
      if (R.glow) {
        R.glow.fillStyle = 'rgba(79,216,255,.25)';
        R.glow.fillRect(52, y1 - 0.5, 316, 1.6);
      }
      continue;
    }
    if (ei === 0) {
      // terre battue autour des postes, limaille
      ctx.fillStyle = 'rgba(30,24,18,.18)';
      ctx.beginPath();
      ctx.ellipse(210, y1 - 4, 170, 8, 0, 0, TAU);
      ctx.fill();
      continue;
    }
    if (ei === 2) {
      // allée piétonne verte entre les chaînes
      ctx.fillStyle = 'rgba(63,174,98,.32)';
      ctx.fillRect(0, y1 + 1, HALL_W, 9);
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.fillRect(0, y1 + 1, HALL_W, 0.6);
      ctx.fillRect(0, y1 + 9.4, HALL_W, 0.6);
    }
    ctx.fillStyle = era.aisle;
    ctx.globalAlpha = 0.75;
    ctx.fillRect(52, y0, 316, 1.2);
    ctx.fillRect(52, y1, 316, 1.2);
    ctx.fillRect(52, y0, 1.2, y1 - y0);
    ctx.fillRect(366.8, y0, 1.2, y1 - y0);
    ctx.globalAlpha = 1;
    // usure de la peinture
    ctx.fillStyle = 'rgba(80,80,80,.35)';
    for (let k = 0; k < 6; k++) ctx.fillRect(60 + ((k * 53 + l * 31) % 300), y1, 4 + (k % 3) * 3, 1.2);
  }
  // allée de devant
  if (!black && ei >= 1) {
    ctx.fillStyle = ei === 2 ? 'rgba(63,174,98,.35)' : 'rgba(0,0,0,.08)';
    ctx.fillRect(0, FLOOR + 1, HALL_W, HALL_H - FLOOR - 1);
    ctx.fillStyle = era.aisle;
    ctx.fillRect(0, FLOOR + 1, HALL_W, 1.4);
  } else if (black) {
    ctx.fillStyle = '#1d6c80';
    ctx.fillRect(0, FLOOR + 1, HALL_W, 1.2);
  }
}

// ------------------------------------------------------------------ Décor

const MONTHS = ['JANV.', 'FÉVR.', 'MARS', 'AVRIL', 'MAI', 'JUIN', 'JUIL.', 'AOÛT', 'SEPT.', 'OCT.', 'NOV.', 'DÉC.'];

function drawDecor(f: Factory, fi: number, style: HallStyle, ei: number, lights: number, amb: number): void {
  const ctx = R.ctx;
  const S = R.S;
  const black = style === 'black';
  if (black) {
    // écrans de supervision
    for (const x of [131, 209, 287]) {
      ctx.fillStyle = '#0b0d10';
      ctx.fillRect(x - 9, 70, 18, 12);
      for (let k = 0; k < 4; k++) {
        const h = 2 + ((Math.floor(R.O.T * 2) + k * 3 + x) % 7);
        ctx.fillStyle = 'rgba(79,216,255,.7)';
        ctx.fillRect(x - 7 + k * 4, 80 - h, 2.6, h);
      }
      lamp(x, 76, 10, [79, 216, 255], 0.5);
    }
    drawDoor(style, ei);
    drawFront(f, fi, style, ei);
    return;
  }
  // --- à gauche : le foyer de la forge, ou la pointeuse
  if (style === 'forge') hearth(lights);
  else timeClock(ei);
  // --- calendrier (jour de la partie)
  const dayN = Math.floor(S.t / ENERGY.dayLength);
  calendar(131, 70, dayN, ei);
  // --- horloge (heure de la journée)
  clock(209, 86, ei);
  // --- photo du grand-père
  photo(287, 72, ei);
  // --- étagère : radio, tasse de Marcel
  shelf(ei, amb);
  // --- affiches entre les fenêtres
  posters(ei);
  drawDoor(style, ei);
  drawFront(f, fi, style, ei);
  void lights;
}

/** Foyer de la forge : briques, hotte, braises qui rougeoient, et l'air qui tremble au-dessus. */
function hearth(lights: number): void {
  const ctx = R.ctx;
  const T = R.O.T;
  // hotte
  ctx.fillStyle = pat(ctx, 'darkMetal');
  ctx.beginPath();
  ctx.moveTo(12, 30);
  ctx.lineTo(40, 30);
  ctx.lineTo(50, 68);
  ctx.lineTo(2, 68);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(12, 30);
  ctx.lineTo(40, 30);
  ctx.lineTo(50, 68);
  ctx.lineTo(2, 68);
  ctx.closePath();
  volume(ctx, 30, 68, 0.12, 0.4);
  ctx.fillStyle = pat(ctx, 'darkMetal');
  ctx.fillRect(18, 0, 16, 30);
  // massif en briques
  ctx.fillStyle = pat(ctx, 'brick');
  ctx.fillRect(2, 72, 48, 28);
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.fillRect(2, 72, 48, 1.2);
  // bouche du foyer et braises
  ctx.fillStyle = '#120c08';
  rr(10, 76, 32, 12, 3, ctx);
  ctx.fill();
  const flick = R.O.reduced ? 0.8 : 0.7 + 0.3 * Math.sin(T * 9) * Math.sin(T * 5.3);
  const g = ctx.createRadialGradient(26, 86, 1, 26, 86, 16);
  g.addColorStop(0, `rgba(255,${Math.round(170 + 50 * flick)},80,1)`);
  g.addColorStop(0.5, 'rgba(230,80,20,.9)');
  g.addColorStop(1, 'rgba(120,20,5,.6)');
  ctx.fillStyle = g;
  rr(12, 80, 28, 7, 2.5, ctx);
  ctx.fill();
  for (let k = 0; k < 7; k++) glowDot(14 + k * 4, 84 + (k % 2), 1.1, `255,${150 + ((k * 37) % 80)},60`, 0.6 + 0.4 * flick * ((k % 3) / 2));
  if (R.glow) {
    R.glow.fillStyle = `rgba(255,120,40,${0.55 * flick})`;
    R.glow.fillRect(10, 78, 32, 10);
  }
  lamp(26, 84, 70, [255, 130, 50], 0.9 * flick);
  lamp(26, 84, 22, [255, 170, 80], 1.2 * flick);
  heat(26, 80, 22, 1);
  if (!R.O.reduced && Math.random() < 0.06) smoke(R.ox + 26, R.oy + 28, 'rgba(60,56,52,.45)', 3, 1.8);
  // seau d'eau et tisonnier
  ctx.fillStyle = pat(ctx, 'castGrey');
  rr(44, 90, 8, 10, 1, ctx);
  ctx.fill();
  ctx.fillStyle = 'rgba(90,120,140,.6)';
  ctx.fillRect(44.5, 90.5, 7, 1.4);
  ctx.strokeStyle = '#2b2d31';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(6, 100);
  ctx.lineTo(9, 74);
  ctx.stroke();
  void lights;
}

/** Pointeuse et casier à cartes (à partir des années 70). */
function timeClock(ei: number): void {
  const ctx = R.ctx;
  const S = R.S;
  ctx.fillStyle = ei === 3 ? '#e8ebee' : pat(ctx, 'castGrey');
  rr(6, 70, 16, 22, 1.5, ctx);
  ctx.fill();
  rr(6, 70, 16, 22, 1.5, ctx);
  volume(ctx, 70, 92);
  if (ei === 3) {
    // borne à badge
    ctx.fillStyle = '#0b0d10';
    ctx.fillRect(9, 73, 10, 7);
    glowDot(14, 76.5, 1, SIG.run, 0.8);
  } else {
    ctx.fillStyle = '#f2efe6';
    ctx.beginPath();
    ctx.arc(14, 76, 4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#16181b';
    ctx.fillRect(9, 84, 10, 1.5);
  }
  // casier : une carte par ouvrier (jusqu'à 12)
  const n = Math.min(12, S.workers.filter((w) => w.factory === 0).length);
  ctx.fillStyle = pat(ctx, 'darkMetal');
  ctx.fillRect(26, 68, 26, 26);
  for (let k = 0; k < 12; k++) {
    const cx = 28 + (k % 4) * 6;
    const cy = 70 + Math.floor(k / 4) * 8;
    ctx.fillStyle = 'rgba(0,0,0,.4)';
    ctx.fillRect(cx, cy + 3, 5, 1);
    if (k < n) {
      ctx.fillStyle = '#efe6cc';
      ctx.fillRect(cx + 0.5, cy, 4, 4);
      ctx.fillStyle = 'rgba(160,40,30,.6)';
      ctx.fillRect(cx + 0.5, cy + 0.6, 4, 0.4);
    }
  }
}

function calendar(x: number, y: number, dayN: number, ei: number): void {
  const ctx = R.ctx;
  ctx.fillStyle = '#f2ede0';
  ctx.fillRect(x - 8, y, 16, 20);
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.fillRect(x + 8, y + 1, 0.8, 20);
  ctx.fillStyle = ei === 0 ? '#8a2a20' : ei === 3 ? '#2f5fa8' : '#c4621f';
  ctx.fillRect(x - 8, y, 16, 5);
  ctx.fillStyle = '#f2ede0';
  ctx.font = '600 3.2px "Chakra Petch", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(MONTHS[Math.floor(dayN / 30) % 12], x, y + 2.7);
  const d = dayN % 30;
  for (let k = 0; k < 30; k++) {
    const cx = x - 6.5 + (k % 6) * 2.6;
    const cy = y + 7 + Math.floor(k / 6) * 2.6;
    ctx.fillStyle = k < d ? 'rgba(0,0,0,.35)' : 'rgba(0,0,0,.15)';
    ctx.fillRect(cx, cy, 1.6, 1.4);
    if (k < d) {
      // jours passés barrés
      ctx.strokeStyle = 'rgba(160,30,20,.5)';
      ctx.lineWidth = 0.3;
      ctx.beginPath();
      ctx.moveTo(cx - 0.2, cy + 1.6);
      ctx.lineTo(cx + 1.8, cy - 0.2);
      ctx.stroke();
    }
    if (k === d) {
      ctx.strokeStyle = '#c0281c';
      ctx.lineWidth = 0.45;
      ctx.beginPath();
      ctx.arc(cx + 0.8, cy + 0.7, 1.5, 0, TAU);
      ctx.stroke();
    }
  }
  // punaise
  ctx.fillStyle = '#c0281c';
  ctx.beginPath();
  ctx.arc(x, y - 0.5, 0.9, 0, TAU);
  ctx.fill();
}

/** Horloge d'atelier : elle donne l'heure de la journée du jeu. */
function clock(x: number, y: number, ei: number): void {
  const ctx = R.ctx;
  const p = dayPhase(R.S.t);
  const hours = (6 + p * 24) % 24;
  ctx.fillStyle = ei === 0 ? pat(ctx, 'wood') : '#1b1d21';
  ctx.beginPath();
  ctx.arc(x, y, 8.2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#f4f0e4';
  ctx.beginPath();
  ctx.arc(x, y, 6.8, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#1b1d21';
  for (let k = 0; k < 12; k++) {
    const a = (k * TAU) / 12;
    const r0 = k % 3 === 0 ? 4.8 : 5.4;
    ctx.save();
    ctx.translate(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
    ctx.rotate(a);
    ctx.fillRect(0, -0.25, k % 3 === 0 ? 1.4 : 0.8, 0.5);
    ctx.restore();
  }
  const hand = (a: number, len: number, w: number, col: string) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.sin(a) * len, y - Math.cos(a) * len);
    ctx.stroke();
    ctx.lineCap = 'butt';
  };
  hand(((hours % 12) / 12) * TAU, 3.4, 0.9, '#1b1d21');
  hand(((hours % 1) * TAU), 5.2, 0.55, '#1b1d21');
  if (ei >= 2) hand(R.O.reduced ? 0 : (R.O.T % 60) / 60 * TAU, 5.6, 0.25, '#c0281c');
  ctx.fillStyle = '#1b1d21';
  ctx.beginPath();
  ctx.arc(x, y, 0.7, 0, TAU);
  ctx.fill();
  // reflet du verre
  ctx.fillStyle = 'rgba(255,255,255,.25)';
  ctx.beginPath();
  ctx.ellipse(x - 2.4, y - 2.6, 2.6, 1.2, -0.7, 0, TAU);
  ctx.fill();
}

/** La photo du grand-père : la même, à toutes les époques. */
function photo(x: number, y: number, ei: number): void {
  const ctx = R.ctx;
  ctx.fillStyle = ei === 0 ? '#3a2616' : ei === 3 ? '#1b1d21' : '#5a3a22';
  ctx.fillRect(x - 8, y, 16, 20);
  ctx.fillStyle = '#efe6cc';
  ctx.fillRect(x - 6.5, y + 1.5, 13, 17);
  ctx.fillStyle = '#b39a74';
  ctx.fillRect(x - 5.5, y + 2.5, 11, 15);
  // portrait sépia : casquette, moustache
  ctx.fillStyle = '#6a5238';
  ctx.beginPath();
  ctx.arc(x, y + 8.5, 2.8, 0, TAU);
  ctx.fill();
  ctx.fillRect(x - 4.2, y + 12, 8.4, 5.5);
  ctx.fillStyle = '#4a3826';
  ctx.beginPath();
  ctx.ellipse(x, y + 6.3, 3.2, 1.5, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(x - 1.4, y + 9.3, 2.8, 0.7);
  ctx.fillStyle = 'rgba(255,255,255,.18)';
  ctx.fillRect(x - 5.5, y + 2.5, 4, 15);
  // le clou et la ficelle
  ctx.strokeStyle = 'rgba(40,30,20,.6)';
  ctx.lineWidth = 0.3;
  ctx.beginPath();
  ctx.moveTo(x - 5, y);
  ctx.lineTo(x, y - 4);
  ctx.lineTo(x + 5, y);
  ctx.stroke();
}

/** Étagère : la radio de l'atelier (allumée si la radio joue) et la tasse de Marcel. */
function shelf(ei: number, amb: number): void {
  const ctx = R.ctx;
  const T = R.O.T;
  const on = !!R.O.radio;
  ctx.fillStyle = ei === 0 ? pat(ctx, 'wood') : pat(ctx, 'castGrey');
  ctx.fillRect(358, 84, 38, 2.4);
  bevel(ctx, 358, 84, 38, 2.4);
  ctx.fillStyle = 'rgba(0,0,0,.4)';
  ctx.fillRect(362, 86.4, 1.2, 4);
  ctx.fillRect(390, 86.4, 1.2, 4);
  // radio de l'époque
  if (ei === 0) {
    ctx.fillStyle = pat(ctx, 'wood');
    rr(360, 72, 18, 12, 3, ctx);
    ctx.fill();
    ctx.fillStyle = '#c9b48a';
    rr(362, 74, 8, 8, 2, ctx);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    for (let k = 0; k < 4; k++) ctx.fillRect(362.5, 75 + k * 2, 7, 0.5);
  } else if (ei === 1) {
    ctx.fillStyle = '#c4621f';
    rr(360, 75, 18, 9, 1.5, ctx);
    ctx.fill();
    ctx.fillStyle = '#e8e2d0';
    ctx.fillRect(362, 77, 8, 5);
    ctx.strokeStyle = '#9aa1aa';
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(376, 75);
    ctx.lineTo(380, 64);
    ctx.stroke();
  } else if (ei === 2) {
    ctx.fillStyle = '#2b2e33';
    rr(358, 75, 22, 9, 1.5, ctx);
    ctx.fill();
    ctx.fillStyle = '#16181b';
    ctx.beginPath();
    ctx.arc(363, 79.5, 3, 0, TAU);
    ctx.arc(375, 79.5, 3, 0, TAU);
    ctx.fill();
  } else {
    ctx.fillStyle = '#3a3f46';
    rr(362, 74, 9, 10, 2, ctx);
    ctx.fill();
  }
  glowDot(ei === 0 ? 374 : ei === 1 ? 374 : ei === 2 ? 369 : 366.5, ei === 0 ? 76 : 77.5, 0.7, on ? '255,190,90' : '90,40,20', on ? 0.9 : 0.3);
  if (on && !R.O.reduced && Math.sin(T * 2.2) > 0.4) {
    // une note de musique qui s'envole
    const k = (T * 0.8) % 1;
    ctx.fillStyle = `rgba(255,240,200,${0.8 * (1 - k)})`;
    ctx.font = '5px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('♪', 372 + Math.sin(T * 3) * 2, 70 - k * 12);
  }
  // tasse de Marcel, encore fumante
  ctx.fillStyle = '#efe9dc';
  ctx.fillRect(384, 79, 5, 5);
  ctx.strokeStyle = '#efe9dc';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(389.5, 81.5, 1.4, -1.2, 1.2);
  ctx.stroke();
  ctx.fillStyle = '#2f5fa8';
  ctx.fillRect(384, 80.5, 5, 0.8);
  if (!R.O.reduced) {
    ctx.strokeStyle = `rgba(255,255,255,${0.25 + 0.2 * (1 - amb)})`;
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(386.5, 78.5);
    ctx.quadraticCurveTo(388 + Math.sin(T * 2) * 1.4, 75, 386 + Math.sin(T * 2 + 1), 71.5);
    ctx.stroke();
  }
  // extincteur (à partir des années 70)
  if (ei >= 1) {
    ctx.fillStyle = '#b5281e';
    rr(392, 89, 4.6, 10, 1.6, ctx);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.3)';
    ctx.fillRect(392.8, 90, 0.8, 8);
    ctx.fillStyle = '#1b1d21';
    ctx.fillRect(393, 87.5, 3, 1.6);
  }
}

/** Entre les fenêtres : outils pendus, affiches de sécurité, écran de production. */
function posters(ei: number): void {
  const ctx = R.ctx;
  const S = R.S;
  const xs = ei === 0 ? [85, 161, 237, 313] : ei === 1 ? [87, 163, 239, 315] : ei === 2 ? [84, 162, 240, 318] : [85, 162, 239, 316];
  xs.forEach((x, i) => {
    if (ei === 0) {
      // fers et outils pendus
      ctx.strokeStyle = '#2b2d31';
      ctx.lineWidth = 1;
      if (i % 2 === 0) {
        ctx.beginPath();
        ctx.arc(x, 30, 3.4, Math.PI * 0.15, Math.PI * 0.85, true);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(x - 2, 22);
        ctx.lineTo(x + 2, 40);
        ctx.moveTo(x + 2, 22);
        ctx.lineTo(x - 2, 40);
        ctx.stroke();
      }
      return;
    }
    if (ei === 3 && i === 1) {
      // écran de production : une barre par chaîne, en direct
      ctx.fillStyle = '#16181b';
      rr(x - 9, 18, 18, 14, 1, ctx);
      ctx.fill();
      ctx.fillStyle = '#0b1a24';
      ctx.fillRect(x - 8, 19, 16, 12);
      S.factories[0]?.lines.forEach((l, k) => {
        const busy = l.slots.filter((m) => m && m.busy).length / 4;
        ctx.fillStyle = busy > 0.7 ? 'rgba(90,255,150,.85)' : busy > 0.3 ? 'rgba(255,176,46,.85)' : 'rgba(255,90,74,.6)';
        ctx.fillRect(x - 6.5 + k * 3.8, 30 - busy * 9, 2.6, Math.max(0.6, busy * 9));
      });
      lamp(x, 25, 12, [90, 180, 255], 0.5);
      return;
    }
    // affiche de sécurité : panneau bleu d'obligation ou triangle jaune
    ctx.fillStyle = '#f2efe6';
    ctx.fillRect(x - 6, 18, 12, 16);
    if ((i + ei) % 2 === 0) {
      ctx.fillStyle = '#1f5fae';
      ctx.beginPath();
      ctx.arc(x, 24, 4, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.arc(x - 1.6, 24, 1.2, 0, TAU);
      ctx.arc(x + 1.6, 24, 1.2, 0, TAU);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#f2b705';
      ctx.beginPath();
      ctx.moveTo(x, 19.5);
      ctx.lineTo(x + 4.6, 27.5);
      ctx.lineTo(x - 4.6, 27.5);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.fillRect(x - 0.35, 22, 0.7, 3);
      ctx.fillRect(x - 0.35, 25.8, 0.7, 0.7);
    }
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.fillRect(x - 4.5, 30, 9, 0.6);
    ctx.fillRect(x - 3.5, 31.6, 7, 0.6);
  });
}

/** Porte de droite : portes en bois ferrées (forge) ou rideau métallique, et bloc de secours. */
function drawDoor(style: HallStyle, ei: number): void {
  const ctx = R.ctx;
  const black = style === 'black';
  const x = 374;
  const y = FLOOR - 64;
  ctx.fillStyle = '#16181b';
  ctx.fillRect(x, y, 26, 64);
  if (ei === 0 && !black) {
    ctx.fillStyle = pat(ctx, 'wood', 0.8);
    ctx.fillRect(x + 2, y + 2, 24, 62);
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(x + 13.5, y + 2, 1, 62);
    ctx.fillStyle = '#2b2d31';
    for (const yy of [y + 10, y + 50]) ctx.fillRect(x + 2, yy, 24, 2);
    rivets(ctx, [[x + 5, y + 11], [x + 22, y + 11], [x + 5, y + 51], [x + 22, y + 51]], 0.7);
  } else {
    ctx.fillStyle = black ? '#22262c' : pat(ctx, 'roofSheet', 0.6);
    ctx.fillRect(x + 3, y + 3, 23, 61);
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    for (let yy = y + 6; yy < FLOOR; yy += 4) ctx.fillRect(x + 3, yy, 23, 0.6);
    // cadre de sécurité jaune et noir
    for (let k = 0; k < 16; k++) {
      ctx.fillStyle = k % 2 ? '#1b1d21' : '#f2b705';
      ctx.fillRect(x, y + k * 4, 2.4, 4);
    }
    if (!black) {
      // bloc « sortie de secours »
      ctx.fillStyle = '#0d0f12';
      ctx.fillRect(x + 4, y - 8, 14, 6);
      glowDot(x + 11, y - 5, 0.01, '60,220,120', 0.01);
      ctx.fillStyle = '#2ed36a';
      ctx.fillRect(x + 5, y - 7, 12, 4);
      ctx.fillStyle = '#eafff0';
      ctx.fillRect(x + 7, y - 6.2, 3, 2.4);
      ctx.fillRect(x + 11, y - 5.2, 4, 0.8);
      if (R.glow) {
        R.glow.fillStyle = 'rgba(46,211,106,.5)';
        R.glow.fillRect(x + 5, y - 7, 12, 4);
      }
      lamp(x + 11, y - 5, 14, [46, 211, 106], 0.9);
    }
  }
}

/** Allée de devant : rack de barres, caisse des produits finis, accessoires de l'époque. */
function drawFront(f: Factory, fi: number, style: HallStyle, ei: number): void {
  const ctx = R.ctx;
  const S = R.S;
  const m = f.material;
  // rack de barres
  contact(58, FLOOR + 38, 36, 3, 0.4);
  ctx.fillStyle = pat(ctx, 'darkMetal');
  ctx.fillRect(26, FLOOR + 8, 3, 30);
  ctx.fillRect(87, FLOOR + 8, 3, 30);
  ctx.fillRect(26, FLOOR + 36, 64, 2);
  for (let k = 0; k < 4; k++) {
    const y = FLOOR + 12 + k * 6.5;
    const g = ctx.createLinearGradient(0, y, 0, y + 3);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.3, MATERIAL_COLORS[m]);
    g.addColorStop(1, '#202226');
    ctx.fillStyle = MATERIAL_COLORS[m];
    ctx.fillRect(29, y, 58, 3);
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = g;
    ctx.fillRect(29, y, 58, 3);
    ctx.globalAlpha = 1;
    ctx.fillStyle = pat(ctx, 'darkMetal');
    ctx.fillRect(40, y + 3, 3, 1.2);
    ctx.fillRect(74, y + 3, 3, 1.2);
  }
  // accessoires d'époque
  if (style === 'black') {
    // AGV autonome qui parcourt l'allée
    agv(fi);
  } else if (ei === 0) {
    // tonneau de trempe
    ctx.fillStyle = pat(ctx, 'wood', 0.8);
    rr(112, FLOOR + 10, 14, 18, 2, ctx);
    ctx.fill();
    ctx.fillStyle = '#2b2d31';
    ctx.fillRect(112, FLOOR + 13, 14, 1.2);
    ctx.fillRect(112, FLOOR + 24, 14, 1.2);
    ctx.fillStyle = 'rgba(70,100,120,.8)';
    ctx.fillRect(113, FLOOR + 10.5, 12, 1.4);
    contact(119, FLOOR + 28, 10, 2, 0.4);
  } else if (ei === 1) {
    // palette de cartons et transpalette
    contact(150, FLOOR + 30, 18, 2.4, 0.4);
    ctx.fillStyle = pat(ctx, 'wood', 0.6);
    ctx.fillRect(136, FLOOR + 26, 28, 3);
    for (let k = 0; k < 4; k++) {
      ctx.fillStyle = k % 2 ? '#b08a5a' : '#a47e50';
      ctx.fillRect(137 + (k % 2) * 13, FLOOR + 14 + Math.floor(k / 2) * -0 + (k > 1 ? -12 : 0) + 12, 12, 11);
      ctx.fillStyle = 'rgba(0,0,0,.15)';
      ctx.fillRect(137 + (k % 2) * 13, FLOOR + 19 + (k > 1 ? -12 : 0) + 12, 12, 1);
    }
    ctx.fillStyle = '#c4621f';
    ctx.fillRect(168, FLOOR + 26, 14, 2);
    ctx.strokeStyle = '#1b1d21';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(181, FLOOR + 26);
    ctx.lineTo(186, FLOOR + 12);
    ctx.stroke();
  } else if (ei === 2) {
    // chariot élévateur garé
    forklift(140, FLOOR + 30);
  } else {
    agv(fi);
  }
  // caisse des produits finis (et le stock prêt à partir)
  const x = 330;
  const y = FLOOR + 10;
  contact(x, y + 16, 18, 2.4, 0.45);
  if (ei <= 1 && style !== 'black') {
    ctx.fillStyle = pat(ctx, 'wood', 0.8);
    ctx.fillRect(x - 14, y, 28, 16);
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.fillRect(x - 14, y + 7.6, 28, 0.8);
    ctx.fillRect(x - 0.4, y, 0.8, 16);
    bevel(ctx, x - 14, y, 28, 16);
  } else if (ei === 2) {
    // caisse-palette grillagée
    ctx.fillStyle = 'rgba(40,44,50,.5)';
    ctx.fillRect(x - 14, y, 28, 16);
    ctx.strokeStyle = '#9aa1aa';
    ctx.lineWidth = 0.4;
    for (let k = 0; k <= 28; k += 3) {
      ctx.beginPath();
      ctx.moveTo(x - 14 + k, y);
      ctx.lineTo(x - 14 + k, y + 16);
      ctx.stroke();
    }
    for (let k = 0; k <= 16; k += 3) {
      ctx.beginPath();
      ctx.moveTo(x - 14, y + k);
      ctx.lineTo(x + 14, y + k);
      ctx.stroke();
    }
    ctx.fillStyle = pat(ctx, 'darkMetal');
    ctx.fillRect(x - 15, y + 15, 30, 2);
  } else {
    ctx.fillStyle = style === 'black' ? '#22262c' : '#2f6db0';
    rr(x - 14, y, 28, 16, 1.5, ctx);
    ctx.fill();
    rr(x - 14, y, 28, 16, 1.5, ctx);
    volume(ctx, y, y + 16);
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.fillRect(x - 4, y + 5, 8, 4);
  }
  const n = Math.min(S.stock[m], 8);
  for (let k = 0; k < n; k++) piece(x - 10 + (k % 4) * 6.5, y - 1.5 - Math.floor(k / 4) * 3, 2.5, m, k);
  if (fi === 0) {
    const total = S.stock.reduce((a, b) => a + b, 0);
    tag(`${total} prêts`, x - 34, y + 9, uiFont(9, 7), '#e8e2d0');
  }
}

function forklift(x: number, y: number): void {
  const ctx = R.ctx;
  contact(x + 6, y, 16, 2, 0.5);
  ctx.fillStyle = pat(ctx, 'yellow');
  rr(x - 4, y - 12, 18, 9, 1.5, ctx);
  ctx.fill();
  rr(x - 4, y - 12, 18, 9, 1.5, ctx);
  volume(ctx, y - 12, y - 3);
  ctx.strokeStyle = '#1b1d21';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - 2, y - 12);
  ctx.lineTo(x, y - 24);
  ctx.lineTo(x + 10, y - 24);
  ctx.lineTo(x + 12, y - 12);
  ctx.stroke();
  ctx.fillStyle = '#2b2e33';
  ctx.fillRect(x + 14, y - 26, 2, 24);
  ctx.fillStyle = '#9aa1aa';
  ctx.fillRect(x + 15, y - 3, 9, 1.2);
  ctx.fillStyle = '#16181b';
  for (const wx of [x, x + 10]) {
    ctx.beginPath();
    ctx.arc(wx, y - 2, 2.6, 0, TAU);
    ctx.fill();
  }
  glowDot(x + 5, y - 25, 0.7, SIG.wait, R.O.reduced || Math.sin(R.O.T * 5) > 0 ? 0.9 : 0.2);
}

/** Petit robot de manutention qui fait l'aller-retour dans l'allée de devant. */
function agv(fi: number): void {
  const ctx = R.ctx;
  const T = R.O.T;
  const ph = R.O.reduced ? 0.4 : (Math.sin(T * 0.18 + fi * 2.1) * 0.5 + 0.5);
  const x = 110 + ph * 170;
  const y = FLOOR + 30;
  contact(x, y + 0.5, 12, 1.8, 0.5);
  ctx.fillStyle = '#e8ebee';
  rr(x - 10, y - 6, 20, 6, 1.5, ctx);
  ctx.fill();
  rr(x - 10, y - 6, 20, 6, 1.5, ctx);
  volume(ctx, y - 6, y);
  ctx.fillStyle = '#2f6db0';
  ctx.fillRect(x - 7, y - 13, 14, 7);
  ctx.fillStyle = 'rgba(255,255,255,.3)';
  ctx.fillRect(x - 7, y - 13, 14, 0.6);
  ctx.fillStyle = '#16181b';
  ctx.fillRect(x - 10, y - 2.4, 20, 1);
  glowDot(x + 9, y - 3.5, 0.6, '79,216,255', 0.9);
  lamp(x + 14, y - 2, 12, [79, 216, 255], 0.4, 0.5);
}

// ------------------------------------------------------------------ Convoyeurs et bacs

/** Convoyeur d'une chaîne, derrière les postes : la bande défile quand on tourne la manivelle. */
function drawConveyor(line: Line, l: number, m: number): void {
  if (!line.conveyor) return;
  const ctx = R.ctx;
  const O = R.O;
  const active = conveyorActive(R.S, line);
  const yb = rowY(l) - 14;
  const x0 = CRANK_X - 4;
  const x1 = SX[3] + 24;
  // pieds
  ctx.fillStyle = pat(ctx, 'darkMetal');
  for (let x = x0 + 8; x < x1; x += 39) {
    ctx.fillRect(x, yb + 4, 1.6, 10);
    ctx.fillRect(x - 1.2, yb + 13, 4, 1);
  }
  // longeron et bande
  ctx.fillStyle = pat(ctx, 'castGrey');
  ctx.fillRect(x0, yb + 2, x1 - x0, 3);
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.fillRect(x0, yb + 4.2, x1 - x0, 0.8);
  ctx.fillStyle = '#1f2125';
  ctx.fillRect(x0, yb, x1 - x0, 2.2);
  const off = active && !O.reduced ? (O.T * 18) % 6 : 0;
  ctx.fillStyle = active ? '#5a5e65' : '#3a3d42';
  for (let x = x0 + off; x < x1; x += 6) ctx.fillRect(x, yb, 0.8, 2.2);
  ctx.fillStyle = 'rgba(255,255,255,.12)';
  ctx.fillRect(x0, yb, x1 - x0, 0.4);
  // pièces qui voyagent
  if (active) {
    const sp = O.reduced ? 0 : (O.T * 18) % 26;
    for (let x = x0 + 6 + sp; x < x1 - 4; x += 26) piece(x, yb - 1.2, 1.7, m, 0);
  }
  // renvoi d'angle et manivelle
  const cx = CRANK_X - 8;
  const cy = yb + 1;
  ctx.fillStyle = pat(ctx, 'castGrey');
  rr(cx - 1, cy - 3, 6, 6, 1, ctx);
  ctx.fill();
  const a = active && !O.reduced ? O.T * 6 : 0.8;
  ctx.strokeStyle = '#9aa1aa';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(cx, cy, 2.6, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(a) * 2.6, cy + Math.sin(a) * 2.6);
  ctx.stroke();
  ctx.fillStyle = '#c4621f';
  ctx.fillRect(cx + Math.cos(a) * 2.6 - 0.9, cy + Math.sin(a) * 2.6 - 0.9, 1.8, 1.8);
  if (line.crank < 0 && crankUseful(line)) crankVacant(l);
}

function drawBuffers(f: Factory, ei: number): void {
  f.lines.forEach((line, l) => {
    const base = rowY(l) - 1;
    for (let s = 1; s < 4; s++) {
      if (!line.slots[s] && !line.slots[s - 1]) continue;
      drawBin(pileX(s), base, line.buf[s], s, f.material, ei);
    }
  });
}

/** Emplacement libre d'une chaîne : un marquage au sol, prêt à recevoir un poste. */
function drawEmptySlot(l: number, st: number): void {
  const ctx = R.ctx;
  ctx.strokeStyle = 'rgba(255,255,255,.14)';
  ctx.lineWidth = 0.8;
  ctx.setLineDash([3, 3]);
  ctx.strokeRect(SX[st] - 20, LY[l] + 6, 40, 26);
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,255,255,.06)';
  for (const [dx, dy] of [[-17, 9], [17, 9], [-17, 29], [17, 29]]) {
    ctx.beginPath();
    ctx.arc(SX[st] + dx, LY[l] + dy, 0.9, 0, TAU);
    ctx.fill();
  }
}

// ------------------------------------------------------------------ Couche des signaux

/** Rapport du contremaître : cadence de chaque poste, goulot de chaque chaîne. */
function drawOverlay(f: Factory, fi: number): void {
  if (!R.S.roles.foreman) return;
  const est = estimateFactory(R.S, fi);
  const size = uiFont(10, 7.5);
  // loin : seuls les goulots restent affichés
  const sparse = R.zoom < 1.05;
  f.lines.forEach((line, l) => {
    const b = est.lineBottleneck[l];
    // cadence de la chaîne : celle de son poste le plus lent
    if (line.slots.some(Boolean)) {
      const out = b >= 0 ? est.rate[l][b] : 0;
      tag(out > 0 ? `→ ${perMin(out, 1)}/min` : '→ arrêt', 34, LY[l] - 22, size, out > 0 ? '#9fe8b4' : '#9aa1aa', 'rgba(14,30,20,.88)');
    }
    line.slots.forEach((m, s) => {
      if (!m) return;
      const r = est.rate[l][s];
      const slow = s === b;
      if (sparse && !slow && r > 0) return;
      tag(r <= 0 ? 'arrêt' : `${perMin(r, 1)}/min`, SX[s], LY[l] - 22, size, r <= 0 ? '#9aa1aa' : slow ? '#ff7a6a' : '#ffc061');
    });
  });
}

/** Indicateurs par machine : avancement du cycle, usure (superviseur), intervention en cours. */
function drawMachineUi(f: Factory, fi: number): void {
  const u = R.ui;
  const S = R.S;
  const O = R.O;
  const near = R.zoom * (O.dpr ?? 1) >= 1.5;
  f.lines.forEach((line, l) => line.slots.forEach((m, s) => {
    if (!m) return;
    const x = SX[s];
    const y = LY[l];
    const busy = m.busy && !m.broken && m.service <= 0;
    if (near && busy && m.tier < 3) {
      const k = clamp(m.prog / machineCycle(S, f.material, m.tier, s), 0, 1);
      u.fillStyle = 'rgba(10,11,9,.65)';
      u.fillRect(x - 16, y - 13, 32, 1.8);
      u.fillStyle = '#f2b705';
      u.fillRect(x - 16, y - 13, 32 * k, 1.8);
    }
    if (S.roles.supervisor && m.tier > 0 && m.wear > 0.25 && !m.broken && m.service <= 0) {
      u.fillStyle = 'rgba(10,11,9,.7)';
      u.fillRect(x - 16, y + 34, 32, 1.8);
      u.fillStyle = m.wear > 0.7 ? '#ff5a4a' : m.wear > 0.5 ? '#ffb02e' : '#57d987';
      u.fillRect(x - 16, y + 34, 32 * m.wear, 1.8);
    }
    if (m.service > 0) {
      tag(`${m.serviceKind === 'repair' ? 'réparation' : 'révision'} ${Math.ceil(m.service)} s`, x, y - 17, uiFont(9, 7), `rgb(${SIG.service})`);
    } else if (m.broken) {
      tag('panne', x, y - 17, uiFont(9, 7), `rgb(${SIG.fault})`);
    }
    if (O.hover && O.hover.hall === fi && O.hover.line === l && O.hover.station === s) {
      u.strokeStyle = `rgb(${SIG.select})`;
      u.lineWidth = 1.2;
      u.setLineDash([3, 2]);
      rr(x - 36, y - 16, 60, 54, 3, u);
      u.stroke();
      u.setLineDash([]);
    }
    void machineState;
  }));
}

/** Élément désigné depuis le panneau, découpé une fois par image. */
function hlParts(): { kind: string; n: number[] } | null {
  const h = R.O.highlight;
  if (!h) return null;
  const [kind, ...rest] = h.split(':');
  return { kind, n: rest.map(Number) };
}

/** Le hall concerné par l'élément désigné (vue extérieure). */
export function hlFactory(): number {
  const h = hlParts();
  return h && (h.kind === 'u' || h.kind === 'm' || h.kind === 'c') ? h.n[0] : -1;
}

/** Cadre clignotant autour de ce que le bouton survolé va acheter ou modifier. */
function drawHighlight(f: Factory, fi: number): void {
  const h = hlParts();
  if (!h) return;
  const u = R.ui;
  u.save();
  u.strokeStyle = `rgba(${SIG.select},${hlAlpha()})`;
  u.lineWidth = 2;
  const box = (x: number, y: number, w: number, hh: number, dash = false) => {
    u.setLineDash(dash ? [4, 3] : []);
    rr(x, y, w, hh, 3, u);
    u.stroke();
  };
  const [a, b, c] = h.n;
  if ((h.kind === 'u' || h.kind === 'm') && a === fi) {
    box(SX[c] - 36, LY[b] - 16, 60, 54, h.kind === 'u');
    if (h.kind === 'u') {
      u.fillStyle = `rgba(${SIG.select},${hlAlpha()})`;
      u.font = '700 16px "Share Tech Mono", monospace';
      u.textAlign = 'center';
      u.textBaseline = 'middle';
      u.fillText('+', SX[c], LY[b] + 16);
    }
  } else if (h.kind === 'c' && a === fi) {
    box(CRANK_X - 30, LY[b] + ROW_BASE - 34, SX[3] + 30 - (CRANK_X - 30), 44);
  } else if (h.kind === 't') {
    f.lines.forEach((line, l) => {
      const m = line.slots[b];
      if (m && m.tier === a) box(SX[b] - 22, LY[l] - 14, 44, 48);
    });
  }
  u.restore();
}

// ------------------------------------------------------------------ Hall complet

export function drawInterior(f: Factory, fi: number, dt: number): void {
  const ctx = R.ctx;
  const S = R.S;
  const style = hallStyle(f);
  const era = eraFor(style);
  const ei = style === 'black' ? 3 : ERAS.indexOf(era);
  drawRoom(f, fi);
  f.lines.forEach((line, l) => {
    drawConveyor(line, l, f.material);
    line.slots.forEach((m, s) => {
      if (!m) drawEmptySlot(l, s);
      else {
        drawMachine(f, fi, l, s, R.ox, R.oy);
        if (m.tier < 3 && m.post < 0) drawVacant(SX[s] - 24, rowY(l));
      }
    });
  });
  drawBuffers(f, ei);
  if (fi === 0) drawRoles();
  const ws = S.workers.filter((w) => w.factory === fi);
  ws.sort((a, b) => (WPOS.get(a.id)?.y ?? 0) - (WPOS.get(b.id)?.y ?? 0));
  ws.forEach((w, k) => drawWorker(w, k, dt));
  // repères des chaînes
  const size = uiFont(9, 7);
  for (let l = 0; l < f.lines.length; l++) {
    tag(`C${l + 1}`, 11, LY[l] + 2, size, f.lines[l].slots.some(Boolean) ? '#ffb02e' : 'rgba(255,176,46,.45)');
  }
  if (S.factories.length > 1) tag(`USINE ${fi + 1}`, 28, 104, uiFont(10, 8), '#ffb02e');
  drawHighlight(f, fi);
  drawMachineUi(f, fi);
  drawOverlay(f, fi);
  // pénombre de nuit (rendu 2D seul ; avec les effets complets, la carte de lumière s'en charge)
  if (!R.light) {
    const amb = ambient(S.t);
    const lights = lightLevel(style);
    const dark = style === 'black' ? 0.55 : (1 - amb) * 0.18 + (1 - lights) * 0.6;
    if (dark > 0.01) {
      ctx.fillStyle = `rgba(4,6,14,${dark})`;
      ctx.fillRect(0, 0, HALL_W, HALL_H);
    }
  }
  // la ronde passe par-dessus la pénombre
  drawGuards(fi);
  void BUFFER_CAP;
}
