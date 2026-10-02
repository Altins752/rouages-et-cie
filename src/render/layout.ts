/** Géométrie du monde : un hall par chaîne, disposés en grille sur le site. */

export const HALL_W = 400;
export const HALL_H = 320;
export const GAP_X = 70;
export const GAP_Y = 90;
/** Abscisse du centre de chaque poste dans un hall. */
export const SX = [78, 158, 238, 318];
/** Ordonnée de chaque rangée d'unités. */
export const LY = [108, 150, 192, 234];
export const FLOOR = 276;
export const DOOR_X = 392;

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

/** Abscisse d'un ouvrier à la position `pos` (en postes ; 4,5 = porte). */
export function posX(pos: number): number {
  if (pos <= 3) return SX[0] - 24 + 80 * pos;
  return SX[3] - 24 + (pos - 3) * 65;
}
