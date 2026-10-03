/**
 * Scène de l'usine. Lit l'état de la simulation, ne le modifie jamais.
 * Quatre couches : la scène (albédo texturé), l'émissif (halo), la lumière (effets complets)
 * et les signaux (voyants, textes, cadres), jamais étalonnés.
 * De près : l'intérieur de chaque hall. De loin : les bâtiments.
 */
import type { GameState } from '../sim/types';
import { ERAS, eraOf } from './era';
import type { Grade } from './era';
import { drawAnnex, drawBackdrop, drawExterior, drawGround, drawRoof, drawSky, drawTraffic, drawTurbines, solarSplit } from './exterior';
import { drawInterior, hlFactory } from './interior';
import { CRANK_X, FLOOR, HALL_H, HALL_W, LY, ROOF_H, ROW_BASE, STEP_X, SX, hallOrigin, siteExtent } from './layout';
import type { Bounds } from './layout';
import { particles } from './particles';
import { HEAT_MAX } from './postfx';
import { LIGHT_SCALE, MATERIAL_COLORS, R, SIG, TAU, clamp, lamp, setWorld } from './rctx';
import { setTexLod } from './textures';
import { WPOS, hlAlpha } from './workers';

export { MATERIAL_COLORS };

/** Largeur d'un hall à l'écran (px) au-delà de laquelle on montre l'intérieur. */
export const INTERIOR_PX = 300;

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
  private lastKey = '';
  private lastW = 0;
  private lastH = 0;

  fitZoom(b: Bounds, cw: number, ch: number): number {
    const single = b.w <= HALL_W + 1;
    const m = single ? 1.0 : 1.06;
    return Math.min(cw / (b.w * m + 20), ch / (b.h * m + (single ? 0 : 40)));
  }

  /** Recadre sur tout le site (la caméra recule quand l'usine grandit). */
  fit(b: Bounds, cw: number, ch: number, instant = false): void {
    this.tx = b.x + b.w / 2;
    this.ty = b.y + b.h / 2;
    this.tz = this.fitZoom(b, cw, ch);
    this.user = false;
    if (instant) {
      this.x = this.tx;
      this.y = this.ty;
      this.zoom = this.tz;
    }
  }

  update(b: Bounds, key: string, cw: number, ch: number, dt: number): void {
    if (key !== this.lastKey || cw !== this.lastW || ch !== this.lastH) {
      const first = this.lastKey === '';
      if (!this.user || key !== this.lastKey) this.fit(b, cw, ch, first);
      this.lastKey = key;
      this.lastW = cw;
      this.lastH = ch;
    }
    const k = 1 - Math.exp(-dt * 4);
    this.x += (this.tx - this.x) * k;
    this.y += (this.ty - this.y) * k;
    this.zoom *= Math.pow(this.tz / this.zoom, k);
  }

  zoomAt(factor: number, px: number, py: number, cw: number, ch: number, b: Bounds): void {
    const fit = this.fitZoom(b, cw, ch);
    const nz = clamp(this.tz * factor, fit * 0.85, Math.max(fit * 5, 3.2));
    const w = this.toWorld(px, py, cw, ch);
    this.tz = nz;
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

/** Le site a une annexe (énergie, cantine) à partir de l'acte II. */
export function hasAnnex(s: GameState): boolean {
  return s.act >= 2;
}

export function viewBounds(s: GameState): { b: Bounds; key: string } {
  const annex = hasAnnex(s);
  const wind = s.energy.wind > 0;
  return { b: siteExtent(s.factories.length, annex, wind), key: `${s.factories.length}|${annex ? 1 : 0}|${wind ? 1 : 0}|${s.stats.moves}` };
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
  /** Élément désigné depuis le panneau : « u:usine:chaîne:poste », « m:… », « c:usine:chaîne », « t:palier:poste », « w:ouvrier ». */
  highlight?: string | null;
  /** Pixels de l'écran par pixel CSS (lisibilité des textes). */
  dpr?: number;
  /** La radio de l'atelier joue. */
  radio?: boolean;
}

/** Élément survolé : usine (hall), chaîne, poste (-2 = convoyeur), ouvrier. -1 = aucun. */
export interface Hover {
  hall: number;
  line: number;
  station: number;
  worker: number;
}

// ------------------------------------------------------------------ Gains qui montent de la caisse

interface Float { x: number; y: number; text: string; col: string; life: number }
const FLOATS: Float[] = [];

/** « +12 € » qui s'élève au-dessus de la caisse de produits finis d'une usine. */
export function saleFloat(s: GameState, fi: number, text: string, col = '#ffd84a'): void {
  if (FLOATS.length > 12) FLOATS.shift();
  const o = hallOrigin(Math.min(fi, s.factories.length - 1), s.factories.length);
  FLOATS.push({ x: o.x + 330, y: o.y + FLOOR + 2, text, col, life: 1.6 });
}

function drawFloats(dt: number): void {
  const u = R.ui;
  const size = Math.max(11, (13 * (R.O.dpr ?? 1)) / R.zoom);
  u.font = `700 ${size}px "Share Tech Mono", monospace`;
  u.textAlign = 'center';
  u.textBaseline = 'middle';
  u.lineWidth = size * 0.28;
  for (let i = FLOATS.length - 1; i >= 0; i--) {
    const p = FLOATS[i];
    p.life -= dt;
    if (p.life <= 0) {
      FLOATS.splice(i, 1);
      continue;
    }
    if (!R.O.reduced) p.y -= dt * 16;
    u.globalAlpha = Math.min(1, p.life / 0.6);
    u.strokeStyle = 'rgba(0,0,0,.7)';
    u.strokeText(p.text, p.x, p.y);
    u.fillStyle = p.col;
    u.fillText(p.text, p.x, p.y);
  }
  u.globalAlpha = 1;
}

// ------------------------------------------------------------------ Entrée

export interface DrawTarget {
  ctx: CanvasRenderingContext2D;
  glow: CanvasRenderingContext2D | null;
  /** Carte de lumière (effets complets), à LIGHT_SCALE de la taille de l'écran. */
  light: CanvasRenderingContext2D | null;
  ui: CanvasRenderingContext2D;
  cw: number;
  ch: number;
}

export interface SceneOut {
  /** Sources de chaleur pour le post-traitement (x, y en uv, rayon, force). */
  heat: Float32Array;
  grade: Grade;
}

const HEAT = new Float32Array(HEAT_MAX * 4);

export function drawScene(t: DrawTarget, s: GameState, cam: Camera, o: SceneOpts, dt: number): SceneOut {
  const ctx = t.ctx;
  const { cw, ch } = t;
  R.ctx = ctx;
  R.glow = t.glow;
  R.light = t.light;
  R.ui = t.ui;
  R.S = s;
  R.O = o;
  R.zoom = cam.zoom;
  R.cw = cw;
  R.ch = ch;
  R.heat.length = 0;
  setTexLod(cam.zoom);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  t.ui.setTransform(1, 0, 0, 1, 0, 0);
  t.ui.clearRect(0, 0, cw, ch);
  if (t.glow) {
    t.glow.setTransform(1, 0, 0, 1, 0, 0);
    t.glow.clearRect(0, 0, cw, ch);
  }
  if (t.light) {
    // neutre : multiplicateur 1 partout où rien n'est éclairé
    t.light.setTransform(1, 0, 0, 1, 0, 0);
    t.light.globalCompositeOperation = 'source-over';
    t.light.fillStyle = 'rgb(128,128,128)';
    t.light.fillRect(0, 0, Math.ceil(cw * LIGHT_SCALE) + 1, Math.ceil(ch * LIGHT_SCALE) + 1);
  }
  const n = s.factories.length;
  const annex = hasAnnex(s);
  const outdoor = annex || n > 1;
  if (!outdoor) {
    ctx.fillStyle = '#121416';
    ctx.fillRect(0, 0, cw, ch);
  } else drawSky(cw, ch);
  const base = (wx: number, wy: number) => {
    setWorld([cam.zoom, 0, 0, cam.zoom, cw / 2 + (wx - cam.x) * cam.zoom, ch / 2 + (wy - cam.y) * cam.zoom]);
  };
  const split = solarSplit();
  if (outdoor) {
    const top = annex ? -ROOF_H - 18 : -60;
    drawBackdrop(cw, ch / 2 + (top - cam.y) * cam.zoom, cam);
    base(0, 0);
    drawGround(top);
  }
  if (annex) {
    base(0, 0);
    R.ox = 0;
    R.oy = 0;
    drawTurbines();
    drawAnnex(split.ground);
  }
  const hallPx = HALL_W * cam.zoom;
  const interior = hallPx >= INTERIOR_PX;
  for (let ci = 0; ci < n; ci++) {
    const o2 = hallOrigin(ci, n);
    // hors écran ?
    const sx = cw / 2 + (o2.x - cam.x) * cam.zoom;
    const sy = ch / 2 + (o2.y - cam.y) * cam.zoom;
    if (sx > cw || sy > ch || sx + hallPx < 0 || sy + (HALL_H + 70) * cam.zoom < -60 * cam.zoom) continue;
    base(o2.x, o2.y);
    R.ox = o2.x;
    R.oy = o2.y;
    if (interior && annex) drawRoof(ci, split.perHall[ci]);
    ctx.save();
    ctx.beginPath();
    ctx.rect(-2, interior ? 0 : -40, HALL_W + 4, HALL_H + (interior ? 0 : 60));
    ctx.clip();
    if (interior) drawInterior(s.factories[ci], ci, dt);
    else drawExterior(s.factories[ci], ci, annex ? split.perHall[ci] : 0);
    ctx.restore();
    const u = R.ui;
    if (!interior && hlFactory() === ci) {
      u.strokeStyle = `rgba(${SIG.select},${hlAlpha()})`;
      u.lineWidth = 5 / cam.zoom;
      u.strokeRect(-8, 10, HALL_W + 16, HALL_H);
    }
    if (o.selected === ci && n > 1) {
      u.strokeStyle = '#f2b705';
      u.lineWidth = 3 / cam.zoom;
      u.strokeRect(-3, interior ? -3 : 17, HALL_W + 6, interior ? HALL_H + 6 : HALL_H - 14);
    }
  }
  base(0, 0);
  if (!interior && outdoor) drawTraffic();
  // particules
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
      if (p.glow) {
        if (t.glow) {
          t.glow.globalAlpha = a;
          t.glow.fillStyle = p.col;
          t.glow.fillRect(p.x - 1, p.y - 1, p.size + 2, p.size + 2);
          t.glow.globalAlpha = 1;
        }
        if (t.light) lamp(p.x, p.y, 3 + p.size * 2, [255, 200, 120], 1.2 * a);
      }
    }
  }
  ctx.globalAlpha = 1;
  drawFloats(dt);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  t.ui.setTransform(1, 0, 0, 1, 0, 0);
  // vignettage rouge en zone rouge
  if (o.red) {
    const g = ctx.createRadialGradient(cw / 2, ch / 2, ch * 0.3, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
    g.addColorStop(0, 'rgba(255,40,20,0)');
    g.addColorStop(1, `rgba(255,40,20,${0.16 + (o.reduced ? 0 : 0.08 * Math.sin(o.T * 10))})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, ch);
  }
  if (t.glow) t.glow.setTransform(1, 0, 0, 1, 0, 0);
  if (t.light) t.light.setTransform(1, 0, 0, 1, 0, 0);
  HEAT.fill(0);
  R.heat.slice(0, HEAT_MAX).forEach((h, i) => {
    HEAT[i * 4] = h.x / cw;
    HEAT[i * 4 + 1] = 1 - h.y / ch;
    HEAT[i * 4 + 2] = clamp(h.r / ch, 0.005, 0.5);
    HEAT[i * 4 + 3] = h.k;
  });
  return { heat: HEAT, grade: ERAS[eraOf(s.act)].grade };
}

/** Élément sous le curseur (coordonnées écran en pixels du canvas). */
export function hitTest(s: GameState, cam: Camera, px: number, py: number, cw: number, ch: number): Hover | null {
  const n = s.factories.length;
  const w = cam.toWorld(px, py, cw, ch);
  for (let fi = 0; fi < n; fi++) {
    const o = hallOrigin(fi, n);
    const lx = w.x - o.x;
    const ly = w.y - o.y;
    if (lx < 0 || ly < 0 || lx > HALL_W || ly > HALL_H) continue;
    const none = { hall: fi, line: -1, station: -1, worker: -1 };
    if (HALL_W * cam.zoom < INTERIOR_PX) return none;
    // ouvriers d'abord
    let best = -1;
    let bd = 11;
    for (const wk of s.workers) {
      if (wk.factory !== fi || wk.state === 'train') continue;
      const r = WPOS.get(wk.id);
      if (!r) continue;
      const d = Math.hypot(lx - r.x, ly - (r.y - 13));
      if (d < bd) {
        bd = d;
        best = wk.id;
      }
    }
    if (best >= 0) return { ...none, worker: best };
    const f = s.factories[fi];
    for (let l = 0; l < f.lines.length; l++) {
      if (ly < LY[l] - 16 || ly >= LY[l] + ROW_BASE + 8) continue;
      if (lx < CRANK_X + 10) return f.lines[l].conveyor ? { ...none, line: l, station: -2 } : { ...none, line: l };
      for (let st = 0; st < 4; st++) {
        if (Math.abs(lx - (SX[st] - 6)) <= STEP_X / 2) return { ...none, line: l, station: st };
      }
      return { ...none, line: l };
    }
    return none;
  }
  return null;
}

/** Position (monde) d'un poste d'une chaîne, pour placer les effets. */
export function worldOfStation(s: GameState, fi: number, l: number, st: number): { x: number; y: number } {
  const o = hallOrigin(fi, s.factories.length);
  return { x: o.x + SX[Math.max(0, st)], y: o.y + LY[Math.max(0, l)] + 4 };
}

export function materialColor(m: number): string {
  return MATERIAL_COLORS[m] ?? '#888';
}
