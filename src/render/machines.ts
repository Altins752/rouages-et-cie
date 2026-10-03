/**
 * Machines : carcasses texturées mises en cache (neuve et usée), pièces mobiles animées par-dessus,
 * colonne lumineuse d'état aux couleurs fixes (vert : produit, ambre : attend, rouge : panne, bleu : entretien).
 */
import { BUFFER_CAP, TIER_OPERATOR_LEVEL, TOOL_MAX } from '../data/balance';
import { machineCycle } from '../sim/formulas';
import type { Factory, Line, Machine } from '../sim/types';
import { LY, SX } from './layout';
import { smoke } from './particles';
import {
  MATERIAL_COLORS, R, SIG, TAU, bevel, clamp, contact, glowDot, heat, lamp, lopin, piece, rivets, rr, signal, volume,
} from './rctx';
import { fullDetail, pat } from './textures';
import type { TexName } from './textures';

/** Cadre d'une carcasse autour du centre du poste (monde). */
const BX = -32;
const BY = -30;
const BW = 64;
const BH = 66;
/** Texels de sprite par unité du monde. */
const SPR = 5;

const SPRITES = new Map<string, HTMLCanvasElement>();

function sprite(tier: number, st: number, worn: boolean): HTMLCanvasElement {
  const key = `${tier}|${st}|${worn ? 1 : 0}`;
  let cv = SPRITES.get(key);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = BW * SPR;
  cv.height = BH * SPR;
  const c = cv.getContext('2d')!;
  c.scale(SPR, SPR);
  c.translate(-BX, -BY);
  fullDetail(() => BODY[tier](c, st));
  if (worn) {
    // patine : crasse en multiplication, coulures d'huile, points de rouille, seulement sur la carcasse
    const mask = document.createElement('canvas');
    mask.width = cv.width;
    mask.height = cv.height;
    mask.getContext('2d')!.drawImage(cv, 0, 0);
    c.globalCompositeOperation = 'multiply';
    c.fillStyle = fullDetail(() => pat(c, 'grime', 0.7));
    c.fillRect(BX, BY, BW, BH);
    c.fillRect(BX, BY, BW, BH);
    c.globalCompositeOperation = 'source-atop';
    c.fillStyle = 'rgba(40,28,16,.35)';
    for (let k = 0; k < 7; k++) {
      const x = -18 + ((k * 37) % 36);
      const y = 4 + ((k * 23) % 22);
      c.beginPath();
      c.ellipse(x, y, 1.2 + (k % 3) * 0.6, 2.4 + (k % 2) * 2, 0, 0, TAU);
      c.fill();
    }
    c.fillStyle = 'rgba(120,64,30,.45)';
    for (let k = 0; k < 9; k++) c.fillRect(-19 + ((k * 29) % 38), 20 + ((k * 13) % 11), 1.2, 0.8);
    c.globalCompositeOperation = 'destination-in';
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(mask, 0, 0);
    c.globalCompositeOperation = 'source-over';
  }
  SPRITES.set(key, cv);
  return cv;
}

// ------------------------------------------------------------------ Carcasses

type Body = (c: CanvasRenderingContext2D, st: number) => void;

function box(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, tex: TexName, r = 1.5, hi = 0.18, lo = 0.3): void {
  c.fillStyle = pat(c, tex);
  rr(x, y, w, h, r, c);
  c.fill();
  rr(x, y, w, h, r, c);
  volume(c, y, y + h, hi, lo);
  bevel(c, x, y, w, h);
}

function floorShadow(c: CanvasRenderingContext2D, w = 22): void {
  contact(0, 31.5, w, 3.2, 0.55, c);
}

/** Établi en bois : plateau, pieds, tablette basse. */
function bench(c: CanvasRenderingContext2D): void {
  floorShadow(c);
  c.fillStyle = pat(c, 'wood');
  for (const lx of [-18, 15]) {
    c.fillRect(lx, 13, 3, 18);
    c.fillStyle = 'rgba(0,0,0,.3)';
    c.fillRect(lx + 2, 13, 1, 18);
    c.fillStyle = pat(c, 'wood');
  }
  c.fillRect(-17, 25, 33, 2.2);
  c.fillStyle = 'rgba(0,0,0,.25)';
  c.fillRect(-17, 26.6, 33, 0.6);
  box(c, -21, 8, 42, 5, 'wood', 0.8, 0.25, 0.35);
  // tranche du plateau, usée
  c.fillStyle = 'rgba(0,0,0,.18)';
  for (let k = 0; k < 5; k++) c.fillRect(-19 + k * 9, 9.5 + (k % 2), 3, 0.5);
}

function vise(c: CanvasRenderingContext2D, x: number): void {
  box(c, x - 4, 3.5, 8, 4.5, 'castGrey', 0.6);
  c.fillStyle = '#1d1f23';
  c.fillRect(x - 0.4, 2.5, 0.8, 5.5);
  c.fillStyle = pat(c, 'brushed');
  c.fillRect(x + 4, 5, 4, 1);
  c.fillRect(x + 7.5, 3.5, 1, 4);
}

const BODY: Body[] = [
  // Établi : outils à main
  (c, st) => {
    if (st === 1) {
      // enclume sur billot
      floorShadow(c, 16);
      c.fillStyle = pat(c, 'wood');
      rr(-8, 13, 16, 18, 2, c);
      c.fill();
      rr(-8, 13, 16, 18, 2, c);
      volume(c, 13, 31, 0.12, 0.4);
      c.strokeStyle = 'rgba(0,0,0,.35)';
      c.lineWidth = 0.4;
      for (let k = 0; k < 3; k++) {
        c.beginPath();
        c.moveTo(-6 + k * 5, 14);
        c.lineTo(-5 + k * 5, 30);
        c.stroke();
      }
      c.fillStyle = pat(c, 'darkMetal');
      c.beginPath();
      c.moveTo(-15, 5);
      c.quadraticCurveTo(-11, 4, -7, 4);
      c.lineTo(9, 4);
      c.lineTo(9, 8);
      c.lineTo(4, 8);
      c.lineTo(5, 13);
      c.lineTo(-5, 13);
      c.lineTo(-4, 8);
      c.lineTo(-8, 8);
      c.quadraticCurveTo(-12, 7.5, -15, 5);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,.35)';
      c.fillRect(-7, 4, 16, 0.7);
      // pinces posées contre le billot
      c.strokeStyle = '#2b2d31';
      c.lineWidth = 0.9;
      c.beginPath();
      c.moveTo(10, 30);
      c.lineTo(12.5, 14);
      c.moveTo(11.5, 30);
      c.lineTo(13, 14.5);
      c.stroke();
      return;
    }
    bench(c);
    if (st === 0) vise(c, -10);
    else if (st === 2) vise(c, -2);
    else {
      // contrôle : lampe articulée, boîte de cales, pied à coulisse posé
      c.strokeStyle = '#3a3d42';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(12, 8);
      c.lineTo(14, -2);
      c.lineTo(7, -6);
      c.stroke();
      c.fillStyle = '#4a6a5a';
      c.beginPath();
      c.moveTo(3, -4);
      c.lineTo(9, -8);
      c.lineTo(10, -5);
      c.lineTo(5, -2);
      c.fill();
      box(c, -18, 3, 10, 5, 'wood', 0.6);
      c.fillStyle = '#c9a46a';
      for (let k = 0; k < 4; k++) c.fillRect(-17 + k * 2.3, 3.5, 1.6, 1.4);
      c.fillStyle = pat(c, 'brushed');
      c.fillRect(-4, 6.5, 12, 1.2);
      c.fillRect(-4, 4.5, 1, 3);
    }
  },
  // Mécanique : fonte peinte vert machine
  (c, st) => {
    floorShadow(c);
    if (st === 0) {
      // scie alternative : socle, étau, moteur et carter de courroie
      box(c, -19, 12, 34, 19, 'castGreen', 2);
      c.fillStyle = 'rgba(0,0,0,.35)';
      c.fillRect(-16, 15, 28, 2);
      box(c, -6, 7, 8, 5, 'castGrey', 0.6);
      box(c, 5, -3, 11, 14, 'castGreen', 2);
      c.fillStyle = pat(c, 'castGreen');
      c.beginPath();
      c.arc(10.5, -3, 5, Math.PI, 0);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,.18)';
      c.fillRect(6, -2, 9, 0.7);
      rivets(c, [[7, 1], [14, 1], [7, 9], [14, 9], [-17, 14], [13, 14], [-17, 29], [13, 29]]);
      // plaque du constructeur
      c.fillStyle = '#c9b98a';
      c.fillRect(-12, 20, 9, 4);
      c.fillStyle = 'rgba(0,0,0,.4)';
      c.fillRect(-11, 21.3, 7, 0.5);
      c.fillRect(-11, 22.5, 5, 0.5);
    } else if (st === 1) {
      // presse à col de cygne : bâti en C, table, socle (le volant tourne à part)
      box(c, -17, 26, 34, 5, 'castGrey', 1);
      c.fillStyle = pat(c, 'castGreen');
      c.beginPath();
      c.moveTo(4, 26);
      c.lineTo(4, 2);
      c.quadraticCurveTo(4, -8, -6, -8);
      c.lineTo(-14, -8);
      c.lineTo(-14, 0);
      c.lineTo(-6, 0);
      c.quadraticCurveTo(-3, 0, -3, 4);
      c.lineTo(-3, 18);
      c.lineTo(-13, 18);
      c.lineTo(-13, 24);
      c.lineTo(-3, 24);
      c.lineTo(-3, 26);
      c.closePath();
      c.moveTo(4, 26);
      c.lineTo(14, 26);
      c.lineTo(14, -2);
      c.quadraticCurveTo(14, -9, 6, -9);
      c.lineTo(4, -9);
      c.closePath();
      c.fill();
      volume(c, -9, 26, 0.16, 0.3);
      c.fillStyle = 'rgba(255,255,255,.2)';
      c.fillRect(-14, -8, 18, 0.7);
      box(c, -13, 17, 12, 3, 'castGrey', 0.5);
      // pédale
      c.fillStyle = '#2b2d31';
      c.fillRect(-16, 29, 7, 1.2);
      // bandes de sécurité
      c.fillStyle = '#f2b705';
      for (let k = 0; k < 4; k++) c.fillRect(-14 + k * 4.5, -8, 2.2, 1.2);
      rivets(c, [[10, 0], [10, 10], [10, 20], [-11, -5]]);
    } else if (st === 2) {
      // taraudeuse à colonne
      box(c, -16, 26, 31, 5, 'castGreen', 1);
      c.fillStyle = pat(c, 'brushed');
      c.fillRect(5, -8, 4, 34);
      c.fillStyle = 'rgba(0,0,0,.3)';
      c.fillRect(8, -8, 1, 34);
      c.fillStyle = 'rgba(255,255,255,.35)';
      c.fillRect(5.5, -8, 0.8, 34);
      box(c, -12, -12, 22, 12, 'castGreen', 2);
      box(c, -4, -18, 12, 7, 'castGrey', 2);
      c.fillStyle = 'rgba(0,0,0,.4)';
      for (let k = 0; k < 4; k++) c.fillRect(-2 + k * 2.5, -17, 0.8, 5);
      box(c, -12, 15, 21, 3, 'castGrey', 0.5);
      c.fillStyle = 'rgba(0,0,0,.35)';
      c.fillRect(-10, 16, 17, 0.6);
      rivets(c, [[-10, -10], [8, -10], [-10, -2], [8, -2]]);
    } else {
      // projecteur de profil : armoire, écran rond, platine
      box(c, -18, 6, 32, 25, 'castGreen', 2);
      box(c, -16, -12, 20, 18, 'castGreen', 3);
      c.fillStyle = '#0b0f0c';
      c.beginPath();
      c.arc(-6, -3, 7, 0, TAU);
      c.fill();
      c.strokeStyle = '#2b2f2c';
      c.lineWidth = 1.2;
      c.stroke();
      box(c, -14, 12, 22, 3, 'brushed', 0.5);
      c.fillStyle = '#1b1d21';
      for (let k = 0; k < 3; k++) {
        c.beginPath();
        c.arc(-12 + k * 6, 22, 1.6, 0, TAU);
        c.fill();
      }
      c.fillStyle = 'rgba(255,255,255,.4)';
      for (let k = 0; k < 3; k++) c.fillRect(-12.3 + k * 6, 20.6, 0.6, 1.2);
      rivets(c, [[-16, 8], [12, 8], [-16, 29], [12, 29]]);
    }
  },
  // Semi-automatique : carter orange, hublot, pupitre, arrêt d'urgence
  (c, st) => {
    floorShadow(c, 24);
    if (st === 0) {
      // ravitailleur de barres à gauche
      c.fillStyle = pat(c, 'darkMetal');
      c.fillRect(-31, 9, 12, 2);
      c.fillRect(-30, 11, 1.5, 20);
      c.fillRect(-21, 11, 1.5, 20);
    }
    if (st === 1) box(c, -10, -18, 9, 11, 'brushed', 1);
    box(c, -20, -8, 36, 39, 'orange', 3);
    box(c, -20, 22, 36, 9, 'darkMetal', 1, 0.1, 0.4);
    // bac à copeaux
    c.fillStyle = '#16181b';
    c.fillRect(-17, 25, 18, 3);
    // hublot : cadre et vitre (l'intérieur s'anime à part)
    c.fillStyle = '#1b1d21';
    rr(-16, -4, 24, 18, 2, c);
    c.fill();
    c.fillStyle = 'rgba(160,190,210,.12)';
    c.fillRect(-14, -2, 20, 14);
    // pupitre sur bras
    c.fillStyle = pat(c, 'darkMetal');
    c.fillRect(13, -6, 2, 8);
    box(c, 10, -16, 10, 11, 'graphite', 1.2);
    c.fillStyle = '#0b1a14';
    c.fillRect(11.5, -14.5, 7, 4.5);
    c.fillStyle = '#d02a1c';
    c.beginPath();
    c.arc(17.5, -7.5, 1.3, 0, TAU);
    c.fill();
    c.fillStyle = '#f2b705';
    c.beginPath();
    c.arc(17.5, -7.5, 1.9, 0, TAU);
    c.lineWidth = 0.5;
    c.strokeStyle = '#f2b705';
    c.stroke();
    c.fillStyle = '#e8e2d0';
    c.fillRect(11.5, -8.5, 1.5, 1.5);
    c.fillRect(13.5, -8.5, 1.5, 1.5);
    // étiquette d'avertissement
    c.fillStyle = '#f2b705';
    c.beginPath();
    c.moveTo(-17, 20);
    c.lineTo(-14, 15);
    c.lineTo(-11, 20);
    c.fill();
    c.fillStyle = '#111';
    c.fillRect(-14.3, 16.8, 0.6, 1.8);
    if (st === 2) {
      // magasin d'outils
      c.fillStyle = pat(c, 'castGrey');
      c.beginPath();
      c.arc(-12, -10, 5, Math.PI, 0);
      c.fill();
      c.fillStyle = 'rgba(0,0,0,.4)';
      for (let k = 0; k < 5; k++) c.fillRect(-16 + k * 2, -13, 0.8, 3);
    }
    if (st === 3) {
      // marbre de la machine à mesurer
      c.fillStyle = '#2e3033';
      c.fillRect(-14, 9, 20, 3);
    }
    rivets(c, [[-18, -6], [14, -6], [-18, 20], [14, 20]], 0.5);
  },
  // Robotisé : îlot grillagé, socle, machine de process (le bras s'anime à part)
  (c, st) => {
    floorShadow(c, 24);
    // grillage de l'îlot, au fond
    c.fillStyle = pat(c, 'perforated');
    c.globalAlpha = 0.55;
    c.fillRect(-24, -16, 46, 40);
    c.globalAlpha = 1;
    c.fillStyle = '#f2b705';
    for (const x of [-25, 21]) {
      c.fillRect(x, -17, 2.2, 48);
      c.fillStyle = 'rgba(0,0,0,.35)';
      c.fillRect(x + 1.6, -17, 0.6, 48);
      c.fillStyle = '#f2b705';
    }
    c.fillRect(-25, -17, 48, 1.6);
    // plancher en tôle larmée
    c.fillStyle = pat(c, 'diamond');
    c.fillRect(-22, 24, 43, 7);
    bevel(c, -22, 24, 43, 7);
    // machine de process
    box(c, 7, 2, 13, 22, 'castGrey', 1.5);
    c.fillStyle = '#121417';
    c.fillRect(9, 6, 9, 7);
    c.fillStyle = 'rgba(160,200,230,.18)';
    c.fillRect(9.5, 6.5, 8, 2);
    // socle du robot
    box(c, -8, 14, 14, 10, 'darkMetal', 1);
    box(c, -6, 10, 10, 5, 'yellow', 1);
    // chemin de câbles
    c.strokeStyle = '#1b1d21';
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(-8, 22);
    c.quadraticCurveTo(-16, 22, -18, 30);
    c.stroke();
    if (st === 3) {
      c.fillStyle = '#2b2e33';
      c.fillRect(8, -4, 10, 6);
      c.fillStyle = '#0d1b23';
      c.fillRect(9, -3, 8, 4);
    }
  },
  // Usine noire : module intégré en composite, grille de ventilation
  (c) => {
    floorShadow(c, 24);
    box(c, -21, -6, 42, 37, 'graphite', 2, 0.08, 0.4);
    c.strokeStyle = '#262a30';
    c.lineWidth = 0.8;
    rr(-20.5, -5.5, 41, 36, 2, c);
    c.stroke();
    c.fillStyle = '#0a0c0f';
    c.fillRect(-17, 3, 34, 16);
    c.fillStyle = 'rgba(79,216,255,.06)';
    c.fillRect(-17, 3, 34, 16);
    c.fillStyle = pat(c, 'perforated');
    c.globalAlpha = 0.5;
    c.fillRect(-17, 22, 34, 6);
    c.globalAlpha = 1;
    c.fillStyle = 'rgba(255,255,255,.05)';
    c.fillRect(-17, 3, 34, 1);
  },
];

// ------------------------------------------------------------------ État

export type MachineState = 'run' | 'wait' | 'fault' | 'service' | 'promote';

/** Ce que dit la colonne lumineuse. */
export function machineState(line: Line, m: Machine, st: number): MachineState {
  if (m.broken) return 'fault';
  if (m.service > 0) return 'service';
  if (m.tier > 0 && m.tier < 3 && m.post >= 0) {
    const w = R.S.workers.find((k) => k.id === m.post);
    if (w && w.level < TIER_OPERATOR_LEVEL[m.tier]) return 'promote';
  }
  if (m.busy) return 'run';
  void line;
  void st;
  return 'wait';
}

// ------------------------------------------------------------------ Dessin

export function drawMachine(f: Factory, _fi: number, l: number, s: number, hallX: number, hallY: number): void {
  const ctx = R.ctx;
  const S = R.S;
  const O = R.O;
  const line = f.lines[l];
  const u = line.slots[s]!;
  const x = SX[s];
  const y = LY[l];
  const t = u.tier;
  const busy = u.busy && !u.broken && u.service <= 0;
  const T = O.T;
  const ph = T + l * 0.7 + s * 0.37;
  const prog = busy ? clamp(u.prog / machineCycle(S, f.material, t, s), 0, 1) : 0;
  const m = f.material;
  // tache d'huile sous les machines fatiguées
  if (t > 0 && t < 4 && u.wear > 0.15) {
    ctx.fillStyle = `rgba(14,12,10,${0.12 + u.wear * 0.3})`;
    ctx.beginPath();
    ctx.ellipse(x - 2 + (l % 2) * 4, y + 32, 6 + u.wear * 8, 1.6 + u.wear * 1.2, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = `rgba(120,140,170,${0.05 + u.wear * 0.08})`;
    ctx.beginPath();
    ctx.ellipse(x - 4, y + 31.6, 2 + u.wear * 3, 0.5, 0, 0, TAU);
    ctx.fill();
  }
  ctx.drawImage(sprite(t, s, false), x + BX, y + BY, BW, BH);
  const worn = t > 0 && t < 4 ? clamp((u.wear - 0.25) / 0.6, 0, 1) : 0;
  if (worn > 0.02) {
    ctx.globalAlpha = worn;
    ctx.drawImage(sprite(t, s, true), x + BX, y + BY, BW, BH);
    ctx.globalAlpha = 1;
  }
  LIVE[t](x, y, s, busy, ph, prog, m, l);
  // outillage : plaque jaune sur le socle, d'autant plus longue que l'outillage est poussé
  const tool = S.tooling[t]?.[s] ?? 0;
  if (tool > 0) {
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(x - 16, y + 29.2, 32, 1.6);
    ctx.fillStyle = '#f2b705';
    ctx.fillRect(x - 16, y + 29.2, 32 * Math.min(1, tool / TOOL_MAX), 1.6);
  }
  // colonne lumineuse (à partir des machines mécaniques)
  const state = machineState(line, u, s);
  if (t > 0) {
    const px = x + 19.5;
    ctx.fillStyle = '#2a2d32';
    ctx.fillRect(px - 0.5, y - 5, 1, 12);
    ctx.fillStyle = '#1b1d21';
    rr(px - 1.6, y - 15, 3.2, 10.5, 0.8);
    ctx.fill();
    const blink = O.reduced ? true : Math.sin(T * 8) > 0;
    const slow = O.reduced ? true : Math.sin(T * 4) > -0.2;
    const seg = (k: number, rgb: string, on: boolean) => {
      const sy = y - 13.3 + k * 3.3;
      ctx.fillStyle = `rgba(${rgb},.22)`;
      ctx.fillRect(px - 1.1, sy - 1.3, 2.2, 2.7);
      if (on) signal(px, sy, 1.15, rgb, true);
    };
    seg(0, state === 'service' ? SIG.service : SIG.fault, (state === 'fault' && blink) || state === 'service');
    seg(1, SIG.wait, state === 'wait' || (state === 'promote' && slow));
    seg(2, SIG.run, state === 'run');
  }
  // panne : fumée ; machine usée qui force : fumerolles
  if (u.broken && !O.reduced && Math.random() < 0.12) smoke(hallX + x, hallY + y);
  if (t > 0 && u.wear > 0.6 && busy && !O.reduced && Math.random() < 0.04 * (u.wear - 0.5) * 4) {
    smoke(hallX + x + 8, hallY + y - 4, 'rgba(70,70,74,.45)', 2.2, 1.1);
  }
  // chaleur : le foyer du forgeron, les machines qui chauffent en zone rouge
  if (busy && O.red && (s === 1 || t === 2)) heat(x, y + 4, 16, 0.6);
}

/** Pièces mobiles, par palier. */
type Live = (x: number, y: number, s: number, busy: boolean, ph: number, prog: number, m: number, l: number) => void;

const LIVE: Live[] = [
  // Établi
  (x, y, s, busy, ph, prog, m) => {
    const ctx = R.ctx;
    if (s === 0) {
      // barre serrée dans l'étau, scie à métaux en va-et-vient
      ctx.fillStyle = MATERIAL_COLORS[m];
      ctx.fillRect(x - 12, y + 4.2, 26 - prog * 6, 2);
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      ctx.fillRect(x - 12, y + 5.6, 26 - prog * 6, 0.6);
      const dx = busy ? Math.sin(ph * 12) * 4 : 0;
      ctx.save();
      ctx.translate(x - 5 + dx, y + 2.5);
      ctx.strokeStyle = '#3a3d42';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(-6, 2);
      ctx.lineTo(-6, -3);
      ctx.lineTo(6, -3);
      ctx.lineTo(6, 2);
      ctx.stroke();
      ctx.fillStyle = '#cfd5db';
      ctx.fillRect(-6, 1.6, 12, 0.8);
      ctx.fillStyle = '#6b4a2b';
      rr(5, -1, 4, 4, 1);
      ctx.fill();
      ctx.restore();
      if (busy && Math.sin(ph * 12) > 0.9) glowDot(x - 4, y + 5, 0.5, '255,220,150', 0.8);
    } else if (s === 1) {
      // lopin chauffé au rouge sur l'enclume ; marteau qui frappe
      const hot = busy ? 1 - prog * 0.7 : 0;
      if (busy) {
        lopin(x - 2, y + 2.6, m);
        if (hot > 0.2) glowDot(x - 2, y + 2.6, 2.2, `255,${Math.round(90 + 80 * (1 - hot))},30`, 0.55 * hot);
        heat(x - 2, y + 2, 10, 0.5 * hot);
      }
      const k = busy ? Math.max(0, Math.sin(ph * 9)) : 0;
      ctx.save();
      ctx.translate(x - 13, y + 2);
      ctx.rotate(-0.2 - k * 1.1);
      ctx.fillStyle = '#6b4a2b';
      ctx.fillRect(0, -0.6, 12, 1.2);
      ctx.fillStyle = '#3a3d42';
      ctx.fillRect(10, -2.4, 3.2, 4.8);
      ctx.fillStyle = 'rgba(255,255,255,.3)';
      ctx.fillRect(10, -2.4, 3.2, 0.6);
      ctx.restore();
    } else if (s === 2) {
      // tourne-à-gauche
      if (busy) piece(x - 2, y + 3, 2.6, m, 0);
      const a = busy ? ph * 4 : 0.3;
      ctx.strokeStyle = '#9aa1aa';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - 2 - Math.cos(a) * 8, y - 1 + Math.sin(a) * 1.2);
      ctx.lineTo(x - 2 + Math.cos(a) * 8, y - 1 - Math.sin(a) * 1.2);
      ctx.stroke();
      ctx.fillStyle = '#3a3d42';
      ctx.fillRect(x - 3, y - 2, 2, 5);
    } else {
      // pièces contrôlées dans la boîte, une sous la lampe
      if (busy) piece(x + 4, y + 6, 2.6, m, ph);
      const k = busy ? 0.6 : 0.15;
      glowDot(x + 6, y - 3.5, 0.9, '255,236,190', k);
      lamp(x + 5, y + 5, 14, [255, 236, 190], k * 0.6);
    }
  },
  // Mécanique
  (x, y, s, busy, ph, prog, m) => {
    const ctx = R.ctx;
    if (s === 0) {
      ctx.fillStyle = MATERIAL_COLORS[m];
      ctx.fillRect(x - 18, y + 8.5, 16 - prog * 4, 2.2);
      const dx = busy ? Math.sin(ph * 10) * 3.5 : 0;
      const dy = busy ? prog * 2 : 0;
      ctx.save();
      ctx.translate(x + 5, y + 1 + dy * 0.5);
      ctx.rotate(0.06 + dy * 0.03);
      ctx.fillStyle = pat(ctx, 'castGreen');
      ctx.fillRect(-20 + dx, -2, 22, 3);
      ctx.fillStyle = '#cfd5db';
      ctx.fillRect(-19 + dx, 1, 18, 0.8);
      ctx.restore();
      // volant du carter de courroie
      spokes(x + 10.5, y + 2, 3.2, busy ? ph * 9 : 0, '#3a3d42');
    } else if (s === 1) {
      // volant d'inertie et coulisseau
      const a = busy ? ph * 6 : 0.4;
      flywheel(x + 17, y - 2, 8.5, a);
      const ram = busy ? Math.max(0, Math.sin(a)) * 8 : 0;
      ctx.fillStyle = pat(ctx, 'brushed');
      ctx.fillRect(x - 10, y, 4, 2 + ram);
      ctx.fillStyle = pat(ctx, 'castGrey');
      ctx.fillRect(x - 12.5, y + 2 + ram, 9, 4);
      ctx.fillStyle = 'rgba(255,255,255,.25)';
      ctx.fillRect(x - 12.5, y + 2 + ram, 9, 0.6);
      if (busy) lopin(x - 8, y + 15.5, m);
    } else if (s === 2) {
      const down = busy ? (Math.sin(ph * 2.6) * 0.5 + 0.5) * 6 : 0;
      ctx.fillStyle = pat(ctx, 'brushed');
      ctx.fillRect(x - 2.6, y, 2.4, 6 + down);
      const a = busy ? ph * 18 : 0;
      ctx.strokeStyle = '#d9dde2';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(x - 1.4 + Math.cos(a) * 2, y + 7 + down);
      ctx.lineTo(x - 1.4 - Math.cos(a) * 2, y + 7 + down);
      ctx.stroke();
      if (busy) piece(x - 1.4, y + 13.5, 3, m, 0);
      // cabestan
      spokes(x + 12, y - 4, 4, busy ? -down * 0.5 : 0, '#c9ced5', 3);
    } else {
      // écran vert du projecteur : profil de l'écrou
      const k = busy ? 0.75 + 0.2 * Math.sin(ph * 8) : 0.18;
      glowDot(x - 6, y - 3, 6, '90,255,150', k * 0.35);
      ctx.strokeStyle = `rgba(190,255,210,${k})`;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      for (let j = 0; j < 7; j++) {
        const a = (j * TAU) / 6;
        ctx.lineTo(x - 6 + Math.cos(a) * 3.4, y - 3 + Math.sin(a) * 3.4);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 11, y - 3);
      ctx.lineTo(x - 1, y - 3);
      ctx.moveTo(x - 6, y - 8);
      ctx.lineTo(x - 6, y + 2);
      ctx.stroke();
      if (busy) piece(x - 4, y + 11, 2.8, m, 0);
    }
  },
  // Semi-automatique : l'intérieur du hublot s'anime, le pupitre affiche
  (x, y, s, busy, ph, prog, m) => {
    const ctx = R.ctx;
    // lumière intérieure de la machine
    const inner = busy ? 0.75 : 0.25;
    ctx.fillStyle = busy ? 'rgba(255,214,150,.28)' : 'rgba(120,140,160,.12)';
    ctx.fillRect(x - 14, y - 2, 20, 14);
    lamp(x - 4, y + 5, 12, [255, 220, 170], inner * 0.8);
    if (R.glow && busy) {
      R.glow.fillStyle = 'rgba(255,200,130,.18)';
      R.glow.fillRect(x - 14, y - 2, 20, 14);
    }
    if (busy) {
      if (s === 0) {
        const k = (ph * 1.4) % 1;
        ctx.fillStyle = MATERIAL_COLORS[m];
        ctx.fillRect(x - 14, y + 6, 8 + k * 10, 2);
        ctx.fillStyle = '#cfd5db';
        ctx.beginPath();
        ctx.arc(x + 1, y + 3, 4, 0, TAU);
        ctx.fill();
        spokes(x + 1, y + 3, 3.6, ph * 20, '#6b7078', 6);
        if (Math.sin(ph * 30) > 0.6) glowDot(x - 2, y + 7, 0.6, '255,210,140', 0.9);
      } else if (s === 1) {
        const d = Math.abs(Math.sin(ph * 7)) * 5;
        ctx.fillStyle = pat(ctx, 'brushed');
        ctx.fillRect(x - 7, y - 2, 6, 3 + d);
        lopin(x - 4, y + 9.5, m);
        if (d > 4.6) glowDot(x - 4, y + 7.5, 0.9, '255,200,120', 0.8);
      } else if (s === 2) {
        ctx.fillStyle = '#c9ced5';
        ctx.fillRect(x - 5 + Math.sin(ph * 30) * 0.5, y - 1, 2, 7 + prog * 2);
        piece(x - 4, y + 9, 2.8, m, ph * 3);
      } else {
        const gx = x - 12 + (Math.sin(ph * 1.8) * 0.5 + 0.5) * 14;
        ctx.fillStyle = '#9aa1aa';
        ctx.fillRect(gx - 0.8, y - 2, 1.6, 11);
        ctx.fillRect(x - 14, y - 2, 20, 1.2);
        piece(x - 4, y + 7.5, 2.6, m, 0);
        glowDot(gx, y + 9, 0.5, '255,60,40', 0.9);
      }
    }
    // écran du pupitre : quelques lignes qui défilent
    const scr = busy ? 0.85 : 0.35;
    ctx.fillStyle = `rgba(110,255,170,${scr})`;
    for (let k = 0; k < 3; k++) {
      const w = 2 + ((Math.floor(ph * 2) + k * 3) % 5);
      ctx.fillRect(x + 12, y - 14 + k * 1.4, w, 0.6);
    }
    lamp(x + 15, y - 12, 6, [110, 255, 170], scr * 0.4);
  },
  // Robotisé : bras à six axes, segments ombrés
  (x, y, s, busy, ph, _prog, m, l) => {
    const ctx = R.ctx;
    const a1 = -1.25 + (busy ? Math.sin(ph * 5 + l * 1.3) * 0.5 : 0);
    const a2 = 1.45 + (busy ? Math.cos(ph * 5 + l * 1.3) * 0.6 : 0);
    const a3 = busy ? Math.sin(ph * 10) * 0.4 : 0;
    const bx = x - 1;
    const by = y + 10;
    const ex = bx + Math.cos(a1) * 15;
    const ey = by + Math.sin(a1) * 15;
    const hx = ex + Math.cos(a1 + a2) * 12;
    const hy = ey + Math.sin(a1 + a2) * 12;
    const seg = (x0: number, y0: number, x1: number, y1: number, w: number) => {
      ctx.strokeStyle = '#a87808';
      ctx.lineWidth = w + 1;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.strokeStyle = '#e8a90a';
      ctx.lineWidth = w;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,240,180,.55)';
      ctx.lineWidth = w * 0.3;
      ctx.beginPath();
      ctx.moveTo(x0 - 0.6, y0 - w * 0.25);
      ctx.lineTo(x1 - 0.6, y1 - w * 0.25);
      ctx.stroke();
      ctx.lineCap = 'butt';
    };
    seg(bx, by, ex, ey, 4.2);
    seg(ex, ey, hx, hy, 3.2);
    for (const [jx, jy, r] of [[bx, by, 3.2], [ex, ey, 2.6]] as const) {
      ctx.fillStyle = '#2b2e33';
      ctx.beginPath();
      ctx.arc(jx, jy, r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.25)';
      ctx.beginPath();
      ctx.arc(jx - r * 0.3, jy - r * 0.3, r * 0.35, 0, TAU);
      ctx.fill();
    }
    // poignet et pince
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(a1 + a2 + a3);
    ctx.fillStyle = '#5b6068';
    ctx.fillRect(-1.5, -1.8, 3.5, 3.6);
    ctx.fillStyle = '#9aa1aa';
    const g = busy ? 0.6 + Math.sin(ph * 10) * 0.6 : 1.2;
    ctx.fillRect(2, -1.8 - g * 0.5, 2.6, 0.9);
    ctx.fillRect(2, 0.9 + g * 0.5, 2.6, 0.9);
    ctx.restore();
    if (busy && Math.sin(ph * 5 + l * 1.3) > 0) piece(hx + Math.cos(a1 + a2) * 4, hy + Math.sin(a1 + a2) * 4, 2.2, m, ph);
    if (busy && s === 1 && Math.sin(ph * 5 + l * 1.3) > 0.95) glowDot(hx, hy + 3, 1.5, '255,200,120', 0.8);
    // voyant de la machine de process
    glowDot(x + 16, y + 20, 0.8, busy ? '90,255,150' : '255,176,46', 0.8);
    if (busy) lamp(x + 13, y + 9, 10, [160, 210, 240], 0.35);
  },
  // Usine noire
  (x, y, s, busy, ph, _prog, m, l) => {
    const ctx = R.ctx;
    const n = 6;
    for (let k = 0; k < n; k++) {
      const on = busy && ((ph * 8 + k) % n) < 3;
      glowDot(x - 15 + k * 6, y - 1, 0.9, '79,216,255', on ? 0.95 : 0.22);
    }
    if (busy) {
      const g = ctx.createLinearGradient(0, y + 3, 0, y + 19);
      g.addColorStop(0, 'rgba(79,216,255,.18)');
      g.addColorStop(1, 'rgba(79,216,255,.04)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 17, y + 3, 34, 16);
      lamp(x, y + 10, 22, [79, 216, 255], 0.45);
      piece(x - 8 + ((ph * 0.8) % 1) * 16, y + 13, 2.6, m, ph * 5);
    }
    if (l < 3 || s < 3) {
      ctx.fillStyle = '#0d0e10';
      ctx.fillRect(x + 21, y + 10, 18, 4);
      ctx.fillStyle = 'rgba(79,216,255,.25)';
      ctx.fillRect(x + 21, y + 10, 18, 0.5);
    }
  },
];

function spokes(x: number, y: number, r: number, a: number, col: string, n = 4): void {
  const ctx = R.ctx;
  ctx.strokeStyle = col;
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  for (let k = 0; k < n; k++) {
    const b = a + (k * TAU) / n;
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(b) * r, y + Math.sin(b) * r);
  }
  ctx.stroke();
}

/** Volant d'inertie en fonte : jante, bras, moyeu, reflet. */
function flywheel(x: number, y: number, r: number, a: number): void {
  const ctx = R.ctx;
  ctx.fillStyle = pat(ctx, 'castGreen');
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.arc(x, y, r - 2, 0, TAU, true);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.35)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = pat(ctx, 'castGreen') as CanvasPattern;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  for (let k = 0; k < 5; k++) {
    const b = a + (k * TAU) / 5;
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(b) * (r - 1.5), y + Math.sin(b) * (r - 1.5));
  }
  ctx.stroke();
  ctx.fillStyle = '#2b2e33';
  ctx.beginPath();
  ctx.arc(x, y, 1.6, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.3)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.arc(x, y, r - 0.6, Math.PI * 1.05, Math.PI * 1.45);
  ctx.stroke();
}

/** Bac de pièces entre deux postes : on lit le goulot à son remplissage. */
export function drawBin(x: number, base: number, n: number, kind: number, m: number, era: number): void {
  const ctx = R.ctx;
  const full = n >= BUFFER_CAP;
  contact(x, base + 0.6, 11, 1.6, 0.45);
  const w = 18;
  const h = 8;
  const col = kind === 1 ? 'lopin' : 'piece';
  // dos du bac
  const tex: TexName = era === 0 ? 'wood' : era === 1 ? 'castGrey' : 'darkMetal';
  ctx.fillStyle = era >= 2 ? (era === 2 ? '#2d5f9a' : '#4a5058') : pat(ctx, tex);
  ctx.fillRect(x - w / 2 + 1, base - h - 1, w - 2, 2);
  // pièces : en rangées de trois, le tas dépasse quand le bac est plein
  for (let k = 0; k < Math.min(n, BUFFER_CAP); k++) {
    const cx = x - 5.5 + (k % 3) * 5.5 + (Math.floor(k / 3) % 2) * 1.2;
    const cy = base - 3.2 - Math.floor(k / 3) * 3.6;
    if (col === 'lopin') lopin(cx, cy, m);
    else piece(cx, cy, 2.5, m, k * 0.7);
  }
  // face avant (devant les pièces)
  ctx.beginPath();
  ctx.moveTo(x - w / 2, base - h + 2);
  ctx.lineTo(x + w / 2, base - h + 2);
  ctx.lineTo(x + w / 2 - 1.5, base);
  ctx.lineTo(x - w / 2 + 1.5, base);
  ctx.closePath();
  ctx.fillStyle = era >= 2 ? (era === 2 ? '#2f6db0' : '#59616b') : pat(ctx, tex);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - w / 2, base - h + 2);
  ctx.lineTo(x + w / 2, base - h + 2);
  ctx.lineTo(x + w / 2 - 1.5, base);
  ctx.lineTo(x - w / 2 + 1.5, base);
  ctx.closePath();
  volume(ctx, base - h + 2, base, 0.2, 0.35);
  ctx.fillStyle = 'rgba(255,255,255,.3)';
  ctx.fillRect(x - w / 2, base - h + 2, w, 0.6);
  // étiquette du bac
  ctx.fillStyle = era === 0 ? 'rgba(240,230,200,.55)' : 'rgba(240,240,235,.8)';
  ctx.fillRect(x - 3, base - 4.5, 6, 2.6);
  if (full) {
    // le tas déborde : quelques pièces tombées au sol
    piece(x + 10, base - 0.8, 2.3, m, 1.3);
    piece(x - 10.5, base - 0.6, 2.3, m, 0.4);
    signal(x + 8.5, base - 9, 1.3, SIG.fault, R.O.reduced || Math.sin(R.O.T * 6) > -0.3);
  }
}
