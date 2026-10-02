/** Géométrie du monde : un hall par usine (4 chaînes en rangées), disposés en grille sur le site. */

export const HALL_W = 400;
export const HALL_H = 404;
export const GAP_X = 70;
export const GAP_Y = 90;
/** Écart entre deux postes d'une chaîne. */
export const STEP_X = 78;
/** Abscisse du centre de chaque poste dans un hall. */
export const SX = [92, 170, 248, 326];
/** Ordonnée de chaque chaîne (rangée de machines). */
export const LY = [118, 180, 242, 304];
/** Hauteur d'une rangée : la base des machines et des ouvriers est à LY + ROW_BASE. */
export const ROW_BASE = 33;
export const FLOOR = 360;
export const DOOR_X = 392;
/** Abscisse de la manivelle du convoyeur. */
export const CRANK_X = 44;

export function gridCols(n: number): number {
  if (n <= 1) return 1;
  if (n <= 4) return 2;
  if (n <= 9) return 3;
  return 4;
}

export function hallOrigin(i: number, n: number): { x: number; y: number } {
  const cols = gridCols(n);
  return { x: (i % cols) * (HALL_W + GAP_X), y: Math.floor(i / cols) * (HALL_H + GAP_Y) };
}

export function siteBounds(n: number): { x: number; y: number; w: number; h: number } {
  const cols = gridCols(n);
  const rows = Math.ceil(n / cols);
  return { x: 0, y: 0, w: cols * HALL_W + (cols - 1) * GAP_X, h: rows * HALL_H + (rows - 1) * GAP_Y };
}

/** Abscisse d'un ouvrier à la position `pos` (en postes ; 4,5 = porte ; négatif = manivelle). */
export function posX(pos: number): number {
  if (pos < 0) return CRANK_X - 16;
  if (pos <= 3) return SX[0] - 24 + STEP_X * pos;
  return SX[3] - 24 + (pos - 3) * 40;
}

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Annexe du site (cantine, batteries, panneaux au sol) à gauche du premier hall. */
export const ANNEX_W = 170;
/** Rangée d'éoliennes derrière les halls. */
export const SKY_H = 190;
/** Toit au-dessus d'un hall en coupe (usines à partir de l'acte II). */
export const ROOF_H = 34;

/** Étendue du site à cadrer : halls, et à partir de l'acte II annexe, toits et éoliennes. */
export function siteExtent(n: number, annex: boolean, turbines = true): Bounds {
  const b = siteBounds(n);
  if (!annex) return b;
  const top = turbines ? SKY_H : ROOF_H + 30;
  return { x: -ANNEX_W - 20, y: -top, w: b.w + ANNEX_W + 20, h: b.h + top };
}

/** Position de la i-ème éolienne (pied du mât). */
export function turbinePos(i: number, total: number, n: number): { x: number; y: number } {
  const e = siteExtent(n, true);
  const perRow = Math.max(1, Math.min(total, Math.floor((e.w - 20) / 46)));
  const row = Math.floor(i / perRow);
  const k = i % perRow;
  const span = e.w - 40;
  const step = Math.min(70, span / perRow);
  return { x: e.x + 30 + k * step + (row % 2) * step * 0.5, y: -ROOF_H - 18 - row * 26 };
}
