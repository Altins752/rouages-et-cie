/**
 * Toutes les valeurs chiffrées du jeu, et seulement ici.
 * Sources : docs/cadrage.md (v1) et POC v6.1 (voir docs/decisions.md).
 * Toute modification impose de relancer `npm run sim`.
 */

/** Pas de temps fixe de la simulation (secondes de jeu). */
export const SIM_DT = 0.05;

// ---------------------------------------------------------------- Postes

export const STATION_COUNT = 4;
/** Unités max par poste et par chaîne. */
export const MAX_UNITS = 4;
/** Pile devant un poste : au-delà, l'amont se bloque. */
export const BUFFER_CAP = 8;
/** Temps de marche entre deux postes adjacents (s). */
export const WALK_TIME = 1;
/** Affectation automatique : poids du choix de tâche (plus en aval, rester sur son poste, marche). */
export const ASSIGN = { downstream: 10, stay: 14, walk: 3, feedPenalty: 30, home: 40, notHome: 12 };
/** Position de la porte, en « postes » (au-delà du contrôle). */
export const DOOR_POS = 4.5;

// ------------------------------------------------------------ Technologie

export const TIER_COUNT = 5;
/** Temps de cycle en fonte (s) par palier et par poste. Palier 0 = POC v6.1. */
export const CYCLE: readonly (readonly number[])[] = [
  [2.0, 3.0, 2.5, 1.0],
  [1.14, 2.0, 1.52, 0.8],
  [0.5, 0.8, 0.56, 0.33],
  [0.14, 0.24, 0.16, 0.09],
  [0.04, 0.06, 0.05, 0.02],
];
/** Prix de la première unité (€) par palier et par poste. */
export const UNIT_PRICE: readonly (readonly number[])[] = [
  [15, 20, 18, 12],
  [120, 180, 150, 105],
  [1600, 2400, 2000, 1400],
  [24000, 36000, 30000, 21000],
  [480000, 720000, 600000, 420000],
];
/** Unité supplémentaire sur un même poste : × la précédente. */
export const UNIT_GROWTH = 1.35;
/** Revente des anciennes unités lors d'une modernisation. */
export const RESALE = 0.25;
/** Consommation par unité (kW) à pleine charge. */
export const TIER_KW = [0, 1.5, 25, 150, 2500];
/** Niveau d'opérateur requis par palier (0 = aucun humain). */
export const TIER_OPERATOR_LEVEL = [1, 2, 3, 0, 0];
/** Palier robotisé : un technicien par chaîne, sinon cadence réduite. */
export const ROBOT_TIER = 3;
export const BLACK_TIER = 4;
export const ROBOT_NO_TECH_FACTOR = 0.5;
/** Recherche des paliers (€). */
export const TIER_RESEARCH = [0, 300, 25000, 500000, 150_000_000];
/** Acte minimal pour rechercher chaque palier. */
export const TIER_MIN_ACT = [0, 1, 2, 3, 4];
/** Recherches de confort du bureau d'études. */
export const RESEARCH_EXTRA = {
  workshop: { cost: 12000, act: 2 },
  preventive: { cost: 40000, act: 2 },
  predictive: { cost: 900000, act: 3 },
};

// ------------------------------------------------------------- Outillage

export const TOOL_MAX = 3;
export const TOOL_SPEED = 1.25;
/** Coût = prix de la première unité du palier actuel × 1,5 × 2^niveau. */
export const TOOL_COST_FACTOR = 1.5;

// ------------------------------------------------------------- Matériaux

export interface MaterialDef {
  readonly id: string;
  readonly price: number;
  readonly raw: number;
  /** Facteur de cycle (plein sur frappe et taraudage). */
  readonly k: number;
  /** Palier minimal sur frappe et taraudage. */
  readonly minTier: number;
  readonly research: number;
  /** Acte à partir duquel la recherche est proposée. */
  readonly act: number;
}

export const MATERIALS: readonly MaterialDef[] = [
  { id: 'fonte', price: 3, raw: 0.6, k: 1.0, minTier: 0, research: 0, act: 0 },
  { id: 'acier', price: 7, raw: 1.8, k: 1.3, minTier: 0, research: 500, act: 1 },
  { id: 'laiton', price: 18, raw: 5, k: 1.1, minTier: 1, research: 25000, act: 1 },
  { id: 'inox', price: 50, raw: 16, k: 1.7, minTier: 1, research: 30000, act: 2 },
  { id: 'titane', price: 160, raw: 55, k: 2.4, minTier: 2, research: 400000, act: 3 },
  { id: 'carbure', price: 600, raw: 220, k: 3.2, minTier: 3, research: 8_000_000, act: 4 },
  { id: 'diamant', price: 3000, raw: 1200, k: 4.5, minTier: 4, research: 500_000_000, act: 4 },
];

/** Part du facteur matériau appliquée à chaque poste. */
export const MATERIAL_STATION_SHARE = [0.5, 1, 1, 0.3];

// ------------------------------------------------------------- Personnel

export const WORKER_SALARY = [0, 0.03, 0.10, 0.35, 1.5]; // €/s par niveau (1 à 4)
export const TRAIN_COST = [0, 0, 100, 800, 15000]; // coût pour atteindre le niveau
export const TRAIN_TIME = [0, 0, 30, 120, 300]; // s de jeu
export const MAX_WORKERS_PER_CHAIN = 20;
/** Spécialisation : +1 % toutes les 5 min sur le même poste, plafond +20 %. */
export const SPEC_STEP_TIME = 300;
export const SPEC_STEP = 0.01;
export const SPEC_MAX = 0.2;

/** Moral (à partir de l'acte II). */
export const MORALE = {
  act: 2,
  start: 0.8,
  cap: 0.85,
  canteenCap: 0.15,
  canteenRecovery: 1.5,
  highLoad: 0.85,
  lowLoad: 0.7,
  dropPerMin: 0.01,
  risePerMin: 0.02,
  floor: 0.7, // cadence = floor + (1 − floor) × moral
  /** Constante de temps de la mesure d'occupation (s). */
  loadTau: 60,
  /** La RH remonte le moral plus vite. */
  hrRecovery: 1.5,
};
export const CANTEEN_COST = [0, 0, 6000, 40000, 300000, 4_000_000];

/** Rôles support. */
export interface RoleDef {
  readonly id: RoleId;
  readonly act: number;
  readonly salary: number;
  readonly cost: number;
}
export type RoleId = 'foreman' | 'supervisor' | 'hr' | 'logistics' | 'sales' | 'controller';
export const ROLES: readonly RoleDef[] = [
  { id: 'foreman', act: 1, salary: 0.2, cost: 0 },
  { id: 'supervisor', act: 2, salary: 5, cost: 0 },
  { id: 'hr', act: 2, salary: 5, cost: 0 },
  { id: 'logistics', act: 3, salary: 60, cost: 0 },
  { id: 'sales', act: 3, salary: 80, cost: 0 },
  { id: 'controller', act: 3, salary: 120, cost: 0 },
];

// --------------------------------------------- Usure, pannes, maintenance

export const WEAR = {
  /** Usure 0 → 1 en 2 h de jeu à pleine charge. */
  fullLoadTime: 7200,
  idleFactor: 0.3,
  redZoneFactor: 5,
  /** Le palier manuel (établis) ne s'use pas. */
  manualWears: false,
  breakStart: 0.5,
  breakPerMin: 0.2,
  externalRepairShare: 0.25,
  externalRepairTime: 60,
  internalRepairShare: 0.08,
  internalRepairTime: 20,
  serviceShare: 0.1,
  serviceTime: 30,
  preventiveAt: 0.6,
  preventiveShare: 0.03,
  preventiveTime: 10,
  predictiveShare: 0.015,
};

// ---------------------------------------------------------------- Énergie

export const ENERGY = {
  act: 2,
  gridPrice: 0.04, // € par kW·s
  idleShare: 0.3,
  sellPrice: 0.015,
  /** Sans trésorerie, les machines tournent au moins à ce régime. */
  cutFloor: 0.3,
  dayLength: 480, // s de jeu
  solar: { kw: 50, cost: 1000, growth: 1.17 },
  wind: { kw: 200, cost: 5000, growth: 1.17, min: 0.55 },
  battery: { capacity: 10000, cost: 3000, growth: 1.17 },
  max: { solar: 40, wind: 24, battery: 12 },
};

// -------------------------------------------------------------- Rebut

export const SCRAP = {
  base: 0.02,
  redZone: 0.04,
  materialChange: 0.06,
  materialChangeTime: 60,
  /** Le contrôle modernisé rebute moins (× par palier). */
  tierFactor: [1, 0.8, 0.6, 0.4, 0.25],
};

// ------------------------------------------------------- Compte-tours

export const TACHO = {
  tapGain: 0.12,
  decayBase: 0.08,
  decayQuad: 0.5,
  holdTarget: 0.5,
  holdRate: 0.9,
  redZone: 0.8,
};

// --------------------------------------------------------- Actes, marché

export interface ActDef {
  readonly id: number;
  /** Marché en € de ventes par seconde (au prix de base). */
  readonly market: number;
  readonly maxChains: number;
  /** Frais de hall de la 2e chaîne (× growth par chaîne suivante). */
  readonly hall: number;
  readonly vmax: number;
  readonly goal: { kind: 'debt' } | { kind: 'share'; share: number; hold: number } | { kind: 'cash'; amount: number } | { kind: 'none' };
}

export const ACTS: readonly ActDef[] = [
  { id: 0, market: 4, maxChains: 1, hall: 0, vmax: 3, goal: { kind: 'debt' } },
  { id: 1, market: 180, maxChains: 2, hall: 400, vmax: 4, goal: { kind: 'share', share: 0.5, hold: 30 } },
  { id: 2, market: 2200, maxChains: 4, hall: 3000, vmax: 4.5, goal: { kind: 'share', share: 0.5, hold: 30 } },
  { id: 3, market: 56000, maxChains: 8, hall: 15000, vmax: 5, goal: { kind: 'share', share: 0.5, hold: 30 } },
  { id: 4, market: 10_000_000, maxChains: 16, hall: 100000, vmax: 5, goal: { kind: 'cash', amount: 1.5e9 } },
  // Bac à sable : marché sans plafond pratique.
  { id: 5, market: 1e12, maxChains: 16, hall: 100000, vmax: 5, goal: { kind: 'none' } },
];
export const SANDBOX_ACT = 5;
export const HALL_GROWTH = 1.8;
export const CHAIN_COPY_FACTOR = 1.2;

export const PROLOGUE = {
  startMoney: 20,
  debt: 800,
  due: 1200,
  lateFactor: 1.1,
  extension: 600,
};

/** Moyenne glissante de la part de marché (constante de temps, s). */
export const SHARE_TAU = 15;

// -------------------------------------------------------------- Contrats

export const CONTRACTS = {
  act: 2,
  spotPrice: [0.85, 1.3],
  /** Taille d'un contrat ponctuel en secondes de marché. */
  spotSize: [20, 60],
  spotDeadline: [120, 300],
  spotOffers: 3,
  spotRefresh: 90,
  longPrice: [1.08, 1.22],
  /** Prélèvement d'un contrat long terme, en part du marché. */
  longShare: [0.04, 0.12],
  longOffers: 2,
  longRefresh: 240,
  /** Rupture si le stock manque pendant ce temps (s). */
  longGrace: 30,
  maxLong: 4,
  repSpotOk: 3,
  repSpotFail: -2,
  repLongBreak: -4,
};

export const REPUTATION = {
  max: 100,
  perLevel: 20,
  pricePerLevel: 0.05,
  /** Part conservée lors d'un déménagement. */
  keepOnMove: 0.5,
};

// ----------------------------------------------------------------- Ferrum

export const FERRUM = {
  thresholds: [0.3, 0.5, 0.7],
  priceWar: { factor: 0.85, duration: 300 },
  poachMorale: 0.1,
};

// --------------------------------------------------------------- Prestige

export const PRESTIGE = {
  /** Savoir-faire = ⌊(CA / 10 000)^0,3⌋. */
  divisor: 10000,
  exponent: 0.3,
  capitalShare: 0.15,
  /** Bonus de cadence par point dépensé dans « gestes sûrs ». */
};

export interface KnowHowDef {
  readonly id: KnowHowId;
  readonly max: number;
  /** Coût du niveau n (1-indexé) = base × n. */
  readonly base: number;
  /** Effet par niveau. */
  readonly per: number;
}
export type KnowHowId = 'cadence' | 'price' | 'wear' | 'training' | 'hall' | 'capital' | 'energy';
export const KNOW_HOW: readonly KnowHowDef[] = [
  { id: 'cadence', max: 10, base: 1, per: 0.03 },
  { id: 'price', max: 5, base: 2, per: 0.05 },
  { id: 'wear', max: 5, base: 1, per: 0.12 },
  { id: 'training', max: 4, base: 1, per: 0.2 },
  { id: 'hall', max: 5, base: 1, per: 0.1 },
  { id: 'capital', max: 5, base: 2, per: 0.25 },
  { id: 'energy', max: 4, base: 1, per: 0.15 },
];

// ---------------------------------------------------------------- Divers

/** Progression hors ligne plafonnée (s réelles). */
export const OFFLINE_CAP = 8 * 3600;
/** Durée minimale d'une crise avant la suivante (directeur d'incidents). */
export const CRISIS_GAP = 120;
