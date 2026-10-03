/**
 * Époques du site : une par acte. Chaque époque a ses matières (murs, sol), sa lumière
 * (température des lampes) et son étalonnage de couleur, comme une pellicule.
 */
import type { TexName } from './textures';

export type EraId = 0 | 1 | 2 | 3;

export interface Grade {
  /** Relève des noirs, gain des blancs (par canal). */
  lift: [number, number, number];
  gain: [number, number, number];
  sat: number;
  contrast: number;
  /** Virage sépia (0–1). */
  sepia: number;
  /** Teinte des ombres et des hautes lumières (split toning). */
  shadow: [number, number, number];
  high: [number, number, number];
}

export interface Era {
  name: string;
  wall: TexName;
  /** Soubassement peint (bas du mur) ou rien. */
  dado: TexName | null;
  floor: TexName;
  /** Couleur des lampes (0–255) et lumière ambiante intérieure (multiplicateur 0–2) le jour et la nuit. */
  lamp: [number, number, number];
  day: [number, number, number];
  night: [number, number, number];
  /** Marquage au sol des allées. */
  aisle: string;
  grade: Grade;
}

export const ERAS: Era[] = [
  {
    // Années 50 : la forge du grand-père. Briques, ampoules à filament, tons chauds.
    name: 'forge',
    wall: 'brick',
    dado: null,
    floor: 'pavers',
    lamp: [255, 190, 120],
    day: [0.74, 0.7, 0.64],
    night: [0.3, 0.27, 0.29],
    aisle: 'rgba(214,190,140,.0)',
    grade: { lift: [0.022, 0.014, 0.0], gain: [1.05, 1.0, 0.88], sat: 0.86, contrast: 1.04, sepia: 0.16, shadow: [0.02, 0.0, -0.02], high: [0.03, 0.015, -0.02] },
  },
  {
    // Années 70 : l'usine de la région. Parpaings peints, néons au mercure, couleurs passées.
    name: 'regional',
    wall: 'blockCream',
    dado: 'blockGreen',
    floor: 'concrete',
    lamp: [255, 222, 170],
    day: [0.76, 0.76, 0.72],
    night: [0.32, 0.32, 0.35],
    aisle: '#e0b42a',
    grade: { lift: [0.018, 0.024, 0.012], gain: [1.03, 1.02, 0.92], sat: 0.84, contrast: 1.0, sepia: 0.06, shadow: [-0.005, 0.015, 0.0], high: [0.02, 0.012, -0.015] },
  },
  {
    // Années 90 : le complexe national. Bardage, résine verte, tubes fluorescents, froid et net.
    name: 'national',
    wall: 'cladding',
    dado: null,
    floor: 'epoxy',
    lamp: [225, 238, 255],
    day: [0.78, 0.8, 0.84],
    night: [0.33, 0.35, 0.41],
    aisle: '#3fae62',
    grade: { lift: [0.0, 0.008, 0.02], gain: [0.97, 1.0, 1.05], sat: 0.95, contrast: 1.08, sepia: 0, shadow: [-0.01, 0.0, 0.02], high: [0.0, 0.005, 0.015] },
  },
  {
    // Aujourd'hui : le site mondial. Panneaux blancs, béton poli, LED, bleu-orange.
    name: 'global',
    wall: 'panel',
    dado: null,
    floor: 'polished',
    lamp: [238, 244, 255],
    day: [0.82, 0.83, 0.86],
    night: [0.35, 0.37, 0.43],
    aisle: '#f2b705',
    grade: { lift: [0.0, 0.004, 0.012], gain: [1.02, 1.0, 0.98], sat: 1.04, contrast: 1.1, sepia: 0, shadow: [-0.015, 0.006, 0.022], high: [0.025, 0.01, -0.015] },
  },
];

/** Usine noire : aucune lumière, sinon les voyants. */
export const BLACK_AMBIENT: [number, number, number] = [0.2, 0.23, 0.3];

export function eraOf(act: number): EraId {
  return act <= 1 ? 0 : act === 2 ? 1 : act === 3 ? 2 : 3;
}
