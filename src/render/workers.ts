/**
 * Personnages : ouvriers (tenue selon l'époque et le niveau, geste selon le poste), encadrement, rondes de nuit.
 * Les couleurs de blouse codent le niveau ; le gilet rayé jaune, les polyvalents (lisibilité d'abord).
 */
import { CARRY_TIME } from '../data/balance';
import { ambient } from '../sim/env';
import type { GameState, Worker } from '../sim/types';
import { eraOf } from './era';
import { CRANK_X, FLOOR, HALL_H, LY, ROW_BASE, STEP_X, SX, posX } from './layout';
import { R, SIG, TAU, clamp, contact, glowDot, lamp, lightShape, lopin, piece, rr, uiFont, tag } from './rctx';

/** Taille des personnages par rapport au dessin de base. */
export const PERSON = 1.3;

/** Positions de rendu des ouvriers (lissage vertical), lues aussi par le survol. */
export const WPOS = new Map<number, { x: number; y: number; anim: number }>();

const LEVEL_COATS = ['#7a5c3e', '#7a5c3e', '#2f5fa8', '#c4621f', '#2b8a5a'];
const SKINS = ['#e7b892', '#d9a27c', '#b97a52', '#8d5a3b', '#f0c8a8', '#6e452c'];
const HAIRS = ['#3a2a1e', '#1c1a18', '#6b4a2b', '#b08850', '#8a3c22', '#2c2724'];

const hashId = (id: number, k: number) => {
  const x = Math.sin(id * 91.7 + k * 13.1) * 43758.5453;
  return x - Math.floor(x);
};

/** Abscisse de la pile devant le poste st (entre st − 1 et st). */
export const pileX = (st: number) => SX[st] - STEP_X / 2 - 2;
export const rowY = (l: number) => LY[Math.max(0, Math.min(LY.length - 1, l))] + ROW_BASE;

// ------------------------------------------------------------------ Silhouette générique

type Head = 'flatcap' | 'cap' | 'helmet' | 'none';

interface Person {
  coat: string;
  pants: string;
  skin: string;
  hair: string;
  head: Head;
  headCol: string;
  vest?: boolean;
  apron?: boolean;
  glasses?: boolean;
  mustache?: boolean;
  tie?: string;
  /** Mains (avant, arrière) relatives aux pieds, en unités du dessin de base ; y négatif vers le haut. */
  front: [number, number];
  back: [number, number];
  /** Écart des jambes (marche). */
  step: number;
  /** Tête un peu basse (fatigue). */
  slump?: number;
  /** Objet tenu dans la main avant. */
  hold?: (hx: number, hy: number) => void;
}

const SHOULDER: [number, number] = [1.1, -13.4];

/** Bras en deux segments vers la main (cinématique inverse, coude vers le bas). */
function arm(c: CanvasRenderingContext2D, sx: number, sy: number, hx: number, hy: number, sleeve: string, skin: string): void {
  const L = 3.7;
  let dx = hx - sx;
  let dy = hy - sy;
  let d = Math.hypot(dx, dy);
  if (d > L * 2 - 0.05) {
    const k = (L * 2 - 0.05) / d;
    dx *= k;
    dy *= k;
    d = L * 2 - 0.05;
    hx = sx + dx;
    hy = sy + dy;
  }
  const h = Math.sqrt(Math.max(0, L * L - (d / 2) ** 2));
  const mx = sx + dx / 2;
  const my = sy + dy / 2;
  // coude : du côté du bas (et vers l'arrière)
  const nx = -dy / (d || 1);
  const ny = dx / (d || 1);
  const s = ny > 0 ? 1 : -1;
  const ex = mx + nx * h * s;
  const ey = my + ny * h * s;
  c.lineCap = 'round';
  c.strokeStyle = sleeve;
  c.lineWidth = 1.7;
  c.beginPath();
  c.moveTo(sx, sy);
  c.lineTo(ex, ey);
  c.lineTo(hx, hy);
  c.stroke();
  c.fillStyle = skin;
  c.beginPath();
  c.arc(hx, hy, 0.85, 0, TAU);
  c.fill();
  c.lineCap = 'butt';
}

function darken(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(v * (1 - k));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function person(x: number, y: number, p: Person): void {
  const c = R.ctx;
  contact(x, y + 0.4, 5.5 * PERSON, 1.5 * PERSON, 0.4);
  c.save();
  c.translate(x, y);
  c.scale(PERSON, PERSON);
  // bras arrière
  arm(c, SHOULDER[0] - 1.6, SHOULDER[1] + 0.3, p.back[0] - 1.4, p.back[1], darken(p.coat, 0.3), darken(p.skin, 0.2));
  // jambes et chaussures de sécurité
  c.strokeStyle = p.pants;
  c.lineWidth = 1.9;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(-0.9, -7);
  c.lineTo(-0.9 + p.step, -0.9);
  c.moveTo(1, -7);
  c.lineTo(1 - p.step, -0.9);
  c.stroke();
  c.lineCap = 'butt';
  c.fillStyle = '#1d1b19';
  rr(-2.2 + p.step, -1.3, 3, 1.4, 0.5, c);
  c.fill();
  rr(-0.3 - p.step, -1.3, 3, 1.4, 0.5, c);
  c.fill();
  // buste
  const g = c.createLinearGradient(-3, 0, 3, 0);
  g.addColorStop(0, darken(p.coat, 0.25));
  g.addColorStop(0.45, p.coat);
  g.addColorStop(1, darken(p.coat, 0.12));
  c.fillStyle = g;
  rr(-3.1, -15.3, 6.3, 9.2, 1.6, c);
  c.fill();
  // col, ceinture, poche
  c.fillStyle = 'rgba(0,0,0,.28)';
  c.fillRect(-3.1, -8.2, 6.3, 0.8);
  c.fillStyle = 'rgba(255,255,255,.18)';
  c.fillRect(0.8, -12.6, 1.6, 1.4);
  if (p.tie) {
    c.fillStyle = '#f2f0ea';
    c.fillRect(-0.4, -15.2, 1.6, 4);
    c.fillStyle = p.tie;
    c.fillRect(0.1, -14.8, 0.7, 5.4);
  }
  if (p.apron) {
    c.fillStyle = '#6a4a2c';
    rr(-2.6, -12.5, 5.6, 9.5, 0.8, c);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,.12)';
    c.fillRect(-2.6, -12.5, 5.6, 0.6);
  }
  if (p.vest) {
    c.fillStyle = 'rgba(226,240,40,.92)';
    rr(-3.1, -14.6, 6.3, 6.5, 1.2, c);
    c.fill();
    c.fillStyle = '#d8dde2';
    c.fillRect(-3.1, -12.6, 6.3, 0.8);
    c.fillRect(-3.1, -10.2, 6.3, 0.8);
  }
  // tête
  const hy = -18.2 + (p.slump ?? 0);
  c.fillStyle = p.skin;
  c.fillRect(-0.5, hy + 1.6, 1.4, 1.6);
  c.beginPath();
  c.arc(0.2, hy, 2.35, 0, TAU);
  c.fill();
  c.fillStyle = 'rgba(0,0,0,.18)';
  c.beginPath();
  c.arc(0.2, hy, 2.35, Math.PI * 0.35, Math.PI * 1.1);
  c.fill();
  c.fillStyle = p.skin;
  c.fillRect(2.2, hy - 0.2, 0.7, 0.8);
  c.fillStyle = '#1a1614';
  c.fillRect(1.3, hy - 0.7, 0.55, 0.55);
  if (p.mustache) {
    c.fillStyle = '#cfcac2';
    c.fillRect(1.1, hy + 0.9, 1.7, 0.6);
  }
  if (p.glasses) {
    c.fillStyle = 'rgba(60,110,170,.9)';
    c.fillRect(0.7, hy - 0.9, 2, 0.8);
  }
  // cheveux et couvre-chef
  c.fillStyle = p.hair;
  c.beginPath();
  c.arc(0, hy - 0.4, 2.45, Math.PI * 0.95, Math.PI * 1.9);
  c.fill();
  c.fillStyle = p.headCol;
  if (p.head === 'helmet') {
    c.beginPath();
    c.arc(0.1, hy - 0.5, 2.75, Math.PI, 0);
    c.fill();
    c.fillRect(-2.8, hy - 0.6, 6.4, 0.8);
    c.fillStyle = 'rgba(255,255,255,.4)';
    c.fillRect(-1.2, hy - 2.7, 1.6, 0.6);
  } else if (p.head === 'flatcap') {
    c.beginPath();
    c.ellipse(0.1, hy - 1.3, 2.7, 1.6, 0, Math.PI, 0);
    c.fill();
    c.fillRect(-0.4, hy - 1.4, 4, 0.9);
  } else if (p.head === 'cap') {
    c.beginPath();
    c.arc(0.1, hy - 0.6, 2.55, Math.PI, 0);
    c.fill();
    c.fillRect(1.5, hy - 0.9, 2.6, 0.75);
  }
  // bras avant
  arm(c, SHOULDER[0], SHOULDER[1], p.front[0], p.front[1], p.coat, p.skin);
  if (p.vest) {
    c.fillStyle = 'rgba(226,240,40,.92)';
    c.fillRect(SHOULDER[0] - 1, SHOULDER[1] - 0.5, 1.8, 1.8);
  }
  c.restore();
  if (p.hold) p.hold(x + p.front[0] * PERSON, y + p.front[1] * PERSON);
}

// ------------------------------------------------------------------ Ouvriers

export function workerXY(w: Worker): { x: number; y: number; moving: boolean; carrying: boolean } {
  if (w.kind === 'crank') return { x: posX(-1), y: rowY(w.line), moving: false, carrying: false };
  const home = w.kind === 'post' ? w.line : w.tl;
  if (w.state === 'carry' && w.carryTo >= 0) {
    const k = clamp(1 - w.timer / CARRY_TIME, 0, 1);
    const from = w.kind === 'post' ? w.station : w.last;
    const x0 = posX(Math.max(0, from));
    const x1 = pileX(w.carryTo) + 4;
    const y0 = rowY(w.kind === 'post' ? w.line : w.carryLine);
    const y1 = rowY(w.carryLine);
    // aller puis retour : la pièce est déposée à mi-parcours
    const go = k < 0.5 ? k * 2 : (1 - k) * 2;
    return { x: x0 + (x1 - x0) * go, y: y0 + (y1 - y0) * go, moving: true, carrying: k < 0.5 };
  }
  let pos = w.pos;
  let moving = false;
  if (w.state === 'walk' && w.walkTotal > 0) {
    const target = w.kind === 'post' ? w.station : w.ts;
    pos = target - (target - w.from) * (w.timer / w.walkTotal);
    moving = true;
  }
  if (w.kind === 'poly' && home < 0) return { x: posX(pos), y: FLOOR + 22, moving, carrying: false };
  return { x: posX(pos), y: rowY(home), moving, carrying: false };
}

/** Tenue d'un ouvrier selon l'époque et son niveau. */
function outfit(w: Worker): Omit<Person, 'front' | 'back' | 'step'> {
  const era = eraOf(R.S.act);
  const marcel = w.name === 'Marcel';
  const skin = SKINS[Math.floor(hashId(w.id, 1) * SKINS.length)];
  const hair = marcel ? '#c9c4bc' : HAIRS[Math.floor(hashId(w.id, 2) * HAIRS.length)];
  const lead = w.level >= 2;
  let head: Head = era === 0 ? 'flatcap' : era === 1 ? 'cap' : 'helmet';
  let headCol = era >= 2 ? (lead ? '#f2b705' : '#e8e6e0') : lead ? '#b8902e' : '#4a4038';
  if (marcel) {
    head = 'flatcap';
    headCol = '#5a5450';
  } else if (era === 1 && hashId(w.id, 3) < 0.35) head = 'none';
  return {
    coat: LEVEL_COATS[w.level] ?? LEVEL_COATS[1],
    pants: era === 0 ? '#3d3a36' : '#2b3448',
    skin,
    hair,
    head,
    headCol,
    vest: w.kind === 'poly',
    glasses: era === 3 && !marcel,
    mustache: marcel,
  };
}

/** Geste de travail : position des mains selon le poste et la machine (synchronisée avec ses outils). */
function workPose(w: Worker, T: number): { front: [number, number]; back: [number, number] } {
  const S = R.S;
  const l = w.kind === 'post' ? w.line : w.tl;
  const s = w.kind === 'post' ? w.station : w.ts;
  const m = l >= 0 && s >= 0 ? S.factories[w.factory]?.lines[l]?.slots[s] : null;
  const ph = T + l * 0.7 + s * 0.37;
  const busy = !!m && m.busy && !m.broken && m.service <= 0;
  const tier = m?.tier ?? 0;
  if (!busy) return { front: [3.4, -9.5], back: [2.2, -9] };
  if (tier === 0) {
    if (s === 0) {
      const dx = Math.sin(ph * 12) * 4 / PERSON;
      return { front: [6.2 + dx, -12.6], back: [4.2 + dx * 0.6, -12] };
    }
    if (s === 1) {
      const k = Math.max(0, Math.sin(ph * 9));
      return { front: [6.6 - k * 1.2, -12.8 - k * 4.4], back: [3, -10] };
    }
    if (s === 2) {
      const a = ph * 4;
      return { front: [6 + Math.cos(a) * 1.2, -15.2 + Math.sin(a) * 1.2], back: [5.4 - Math.cos(a) * 1.2, -15 - Math.sin(a) * 1.2] };
    }
    return { front: [5.4, -15.6 + Math.sin(ph * 2) * 0.6], back: [5, -13.5] };
  }
  // opérateur de machine : la main aux commandes, gestes courts
  const k = Math.sin(ph * (s === 1 ? 6 : 3));
  return { front: [5.6, -14 + k * 0.8], back: [4.4, -11.5 - Math.max(0, k) * 0.6] };
}

export function drawWorker(w: Worker, idx: number, dt: number): void {
  if (w.state === 'train') return;
  const S = R.S;
  const O = R.O;
  const p = workerXY(w);
  let r = WPOS.get(w.id);
  if (!r) {
    r = { x: p.x, y: p.y, anim: hashId(w.id, 5) * 6 };
    WPOS.set(w.id, r);
  }
  const idleOff = w.kind === 'poly' && w.state === 'idle' ? ((idx % 5) - 2) * 7 : 0;
  r.x = p.x + idleOff;
  r.y += (p.y - r.y) * (1 - Math.exp(-dt * 10));
  r.anim += dt * 6 * (O.rev > 0.5 ? 1.8 : 1);
  const x = r.x;
  const y = r.y;
  const moving = p.moving || Math.abs(p.y - r.y) > 1;
  const swing = moving && !O.reduced ? Math.sin(r.anim * 2) : 0;
  let front: [number, number] = [1.6 + swing * 1.6, -7];
  let back: [number, number] = [0.6 - swing * 1.6, -7];
  let hold: Person['hold'];
  const f = S.factories[w.factory];
  if (p.carrying) {
    front = [4.6, -10.5];
    back = [3.6, -10];
    hold = (hx, hy) => (w.carryTo === 1 ? lopin(hx + 1.2, hy - 0.4, f.material) : piece(hx + 1.2, hy - 0.4, 2.4, f.material, 0));
  } else if (w.kind === 'crank' && w.state === 'work') {
    const a = O.reduced ? 0.8 : O.T * 6;
    front = [7.4 / PERSON * 1.1 + Math.cos(a) * 2.6, -10.2 + Math.sin(a) * 2.6];
    back = [front[0] - 0.6, front[1] + 0.4];
  } else if (w.state === 'work') {
    const pose = workPose(w, O.T);
    front = pose.front;
    back = pose.back;
  } else if (w.rest > 0) {
    // pause café : la tasse monte aux lèvres de temps en temps
    const sip = Math.sin(r.anim * 0.5) > 0.6;
    front = sip ? [2.6, -16.2] : [3.4, -10.5];
    back = [0.8, -7];
    hold = (hx, hy) => {
      const c = R.ctx;
      c.fillStyle = '#efe9dc';
      c.fillRect(hx - 0.2, hy - 2.4, 2.2, 2.6);
      c.fillStyle = '#5a3a24';
      c.fillRect(hx, hy - 2.4, 1.8, 0.6);
      if (!O.reduced && !sip) {
        c.strokeStyle = 'rgba(255,255,255,.35)';
        c.lineWidth = 0.4;
        c.beginPath();
        c.moveTo(hx + 0.9, hy - 3);
        c.quadraticCurveTo(hx + 2 + Math.sin(O.T * 3) * 0.8, hy - 5, hx + 0.8, hy - 7);
        c.stroke();
      }
    };
  } else if (!moving) {
    const br = O.reduced ? 0 : Math.sin(r.anim * 0.4 + idx) * 0.3;
    front = [2, -6.8 + br];
    back = [0.4, -6.8 + br];
  }
  const o = outfit(w);
  const tired = S.act >= 2 && w.morale < 0.45;
  person(x, y, {
    ...o,
    apron: eraOf(S.act) === 0 && w.kind === 'post' && w.station === 1 && w.name !== 'Marcel',
    front,
    back,
    step: swing * 1.6,
    slump: tired ? 0.7 : 0,
    hold,
  });
  // fatigue visible : une goutte de sueur
  if (tired) {
    const c = R.ctx;
    const bob = O.reduced ? 0 : Math.sin(r.anim) * 0.8;
    const sy = y - 30 + bob;
    c.fillStyle = '#7fc4ff';
    c.beginPath();
    c.moveTo(x + 5, sy);
    c.quadraticCurveTo(x + 7.5, sy + 4, x + 5, sy + 5);
    c.quadraticCurveTo(x + 2.5, sy + 4, x + 5, sy);
    c.fill();
  }
  workerUi(w, x, y);
}

/** Couche des signaux : nom, formations, cadre de survol. */
function workerUi(w: Worker, x: number, y: number): void {
  const O = R.O;
  const u = R.ui;
  const hovered = !!O.hover && O.hover.worker === w.id;
  const hl = hlWorkerId() === w.id;
  const top = y - 25 * PERSON;
  const near = R.zoom * (O.dpr ?? 1) >= 2.4;
  if (w.trainings > 0 && w.kind !== 'crank' && (near || hovered)) {
    for (let k = 0; k < w.trainings; k++) {
      u.fillStyle = 'rgba(10,11,9,.7)';
      u.fillRect(x - 6 + k * 2.6 - 0.4, top - 0.4, 2.2, 2.2);
      u.fillStyle = '#ffd84a';
      u.fillRect(x - 6 + k * 2.6, top, 1.4, 1.4);
    }
  }
  if (w.rest > 0 && near) tag('pause', x, top - 4, uiFont(9, 6), 'rgb(200,220,255)');
  if (w.name === 'Marcel' || hovered) tag(w.name, x, top - (w.rest > 0 && near ? 11 : 4), uiFont(10, 7), '#f4f1ea');
  if (hovered || hl) {
    u.strokeStyle = hl ? `rgba(${SIG.select},${hlAlpha()})` : `rgb(${SIG.select})`;
    u.lineWidth = hl ? 1.4 : 0.9;
    u.beginPath();
    u.ellipse(x, y - 11 * PERSON, 8, 17, 0, 0, TAU);
    u.stroke();
  }
}

export function hlAlpha(): number {
  return R.O.reduced ? 0.9 : 0.55 + 0.45 * Math.sin(R.O.T * 7);
}

function hlWorkerId(): number {
  const h = R.O.highlight;
  if (!h || !h.startsWith('w:')) return -1;
  return Number(h.slice(2));
}

/** Poste sans titulaire : une silhouette en pointillés à la place de l'ouvrier. */
export function drawVacant(x: number, y: number): void {
  const c = R.ctx;
  c.save();
  c.translate(x, y);
  c.scale(PERSON, PERSON);
  c.strokeStyle = 'rgba(255,216,74,.55)';
  c.lineWidth = 0.7;
  c.setLineDash([1.4, 1.2]);
  c.beginPath();
  c.arc(0.2, -18.2, 2.4, 0, TAU);
  c.stroke();
  rr(-3, -15.3, 6.2, 9.2, 1.5, c);
  c.stroke();
  c.beginPath();
  c.moveTo(-0.9, -6);
  c.lineTo(-0.9, 0);
  c.moveTo(1, -6);
  c.lineTo(1, 0);
  c.stroke();
  c.setLineDash([]);
  c.restore();
}

// ------------------------------------------------------------------ Encadrement

const ROLE_STYLE: [keyof GameState['roles'], string, string][] = [
  ['foreman', '#e9ecef', '#2f5fa8'], ['supervisor', '#d0e4ff', '#8a2a2a'], ['hr', '#ffd0e0', ''], ['methods', '#ffd8a8', '#2b8a5a'],
  ['logistics', '#ffe6a8', ''], ['sales', '#2b3448', '#c4621f'], ['controller', '#4a4058', '#d8c070'],
];

/** L'encadrement se tient près de la porte du premier hall, un bloc-notes à la main. */
export function drawRoles(): void {
  const S = R.S;
  const era = eraOf(S.act);
  let k = 0;
  for (const [id, coat, tie] of ROLE_STYLE) {
    if (!S.roles[id]) continue;
    const x = 366 - k * 11;
    const y = HALL_H - 6;
    const sway = R.O.reduced ? 0 : Math.sin(R.O.T * 0.7 + k * 1.9) * 0.4;
    person(x, y, {
      coat,
      pants: '#2a2c33',
      skin: SKINS[(k * 2 + 1) % SKINS.length],
      hair: HAIRS[(k * 3) % HAIRS.length],
      head: era >= 2 ? 'helmet' : 'none',
      headCol: '#ffffff',
      tie: tie || undefined,
      front: [3.2, -10.6 + sway],
      back: [1, -7],
      step: 0,
      hold: (hx, hy) => {
        const c = R.ctx;
        c.fillStyle = '#7a5a3a';
        c.fillRect(hx - 0.4, hy - 3.2, 3.4, 4.4);
        c.fillStyle = '#f4f1ea';
        c.fillRect(hx, hy - 2.6, 2.6, 3.4);
        c.fillStyle = 'rgba(0,0,0,.4)';
        c.fillRect(hx + 0.3, hy - 1.8, 2, 0.3);
        c.fillRect(hx + 0.3, hy - 1.1, 1.6, 0.3);
      },
    });
    k++;
  }
}

// ------------------------------------------------------------------ Équipe de nuit

/** Gardiens de l'équipe de nuit (1 à 3 selon le rendement), visibles quand il fait nuit. */
export function guards(): number {
  const S = R.S;
  if (S.act < 2 || S.night.rate <= 0 || ambient(S.t) > 0.35) return 0;
  return 1 + Math.floor(S.night.rate / 20);
}

export function guardX(fi: number, k: number): number {
  const O = R.O;
  const ph = O.reduced ? 0.3 + k * 0.3 : Math.sin(O.T * 0.25 + fi * 1.7 + k * 2.1) * 0.5 + 0.5;
  return 50 + ph * 300;
}

export function drawGuards(fi: number): void {
  const O = R.O;
  const n = guards();
  for (let k = 0; k < n; k++) {
    const x = guardX(fi, k);
    const y = HALL_H - 8;
    const dir = O.reduced ? 1 : Math.cos(O.T * 0.25 + fi * 1.7 + k * 2.1) >= 0 ? 1 : -1;
    const st = O.reduced ? 0 : Math.sin(O.T * 5 + k) * 1.4;
    const lx = x + dir * 6.5;
    const ly = y - 13;
    // faisceau de la lampe torche
    const c = R.ctx;
    if (!R.light) {
      const g = c.createRadialGradient(lx, ly, 1, lx + dir * 30, ly + 4, 36);
      g.addColorStop(0, 'rgba(255,240,190,.45)');
      g.addColorStop(1, 'rgba(255,240,190,0)');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(lx, ly);
      c.lineTo(lx + dir * 48, ly - 14);
      c.lineTo(lx + dir * 48, ly + 16);
      c.fill();
    } else {
      lightShape((L) => {
        L.moveTo(lx, ly);
        L.lineTo(lx + dir * 52, ly - 16);
        L.lineTo(lx + dir * 52, ly + 18);
      }, (L) => {
        const g = L.createRadialGradient(lx, ly, 1, lx + dir * 26, ly + 2, 40);
        g.addColorStop(0, 'rgba(128,120,95,.9)');
        g.addColorStop(1, 'rgba(128,120,95,0)');
        return g;
      });
      lamp(lx + dir * 40, ly + 10, 14, [255, 240, 190], 0.6, 0.5);
    }
    glowDot(lx, ly, 1.1, '255,240,190', 0.95);
    person(x, y, {
      coat: '#1f2f4f',
      pants: '#1a2236',
      skin: SKINS[(fi + k) % SKINS.length],
      hair: HAIRS[(fi * 2 + k) % HAIRS.length],
      head: 'cap',
      headCol: '#16213a',
      front: [dir > 0 ? 5 : 4, -13],
      back: [0.6 - st * 0.4, -7],
      step: st,
    });
  }
}

/** Chaîne sans personne à la manivelle : silhouette en pointillés. */
export function crankVacant(l: number): void {
  drawVacant(CRANK_X - 16, rowY(l));
}
