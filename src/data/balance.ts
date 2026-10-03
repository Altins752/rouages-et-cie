/**
 * Toutes les valeurs chiffrées du jeu, et seulement ici.
 * Sources : docs/cadrage.md (v1) et POC v6.1 (voir docs/decisions.md).
 * Toute modification impose de relancer `npm run sim`.
 */

/** Pas de temps fixe de la simulation (secondes de jeu). */
export const SIM_DT = 0.05;

// ---------------------------------------------------------------- Postes

export const STATION_COUNT = 4;
/** Chaînes par usine (une rangée de 4 postes chacune). */
export const LINES = 4;
/** Ancien nom : une unité de chaque poste par chaîne. */
export const MAX_UNITS = LINES;
/** Pile devant un poste d'une chaîne : au-delà, l'amont se bloque. */
export const BUFFER_CAP = 6;
/** Temps de marche entre deux postes adjacents (s). */
export const WALK_TIME = 1;
/** Portage sans convoyeur : porter la pièce à la pile suivante et revenir (s). */
export const CARRY_TIME = 1;
/** Choix de tâche des polyvalents (plus en aval, rester sur son poste, marche). */
export const ASSIGN = { downstream: 10, stay: 14, walk: 3, feedPenalty: 30 };
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
export const TIER_RESEARCH = [0, 300, 150_000, 3_000_000, 750_000_000];
/** Acte minimal pour rechercher chaque palier. */
export const TIER_MIN_ACT = [0, 1, 2, 3, 4];
/** Recherches de confort du bureau d'études. */
export const RESEARCH_EXTRA = {
  workshop: { cost: 12000, act: 2 },
  preventive: { cost: 40000, act: 2 },
  predictive: { cost: 900000, act: 3 },
};

// ------------------------------------------------------------- Outillage

/**
 * Outillage : une piste par poste et par palier, commune à toute la partie (conservée aux
 * déménagements). Vitesse = 1 + gain × (1 − e^(−niveau / tau)) ; coût = prix de l'unité × 1,5 × 1,16^niveau.
 */
export const TOOL_MAX = 50;
export const TOOL_GAIN = 1.6;
export const TOOL_TAU = 18;
export const TOOL_COST_FACTOR = 0.8;
export const TOOL_COST_GROWTH = 1.09;

// ------------------------------------------------------------- Convoyeurs

/** Un convoyeur manuel par chaîne, tourné à la manivelle par un ouvrier : plus de portage. */
export const CONVEYOR = {
  /** Prix = part de la valeur des machines de la chaîne, avec un minimum. */
  share: 0.6,
  min: 40,
};

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
  { id: 'laiton', price: 18, raw: 5, k: 1.1, minTier: 1, research: 30000, act: 1 },
  { id: 'inox', price: 50, raw: 16, k: 1.7, minTier: 1, research: 100_000, act: 2 },
  { id: 'titane', price: 160, raw: 55, k: 2.4, minTier: 2, research: 2_500_000, act: 3 },
  { id: 'carbure', price: 600, raw: 220, k: 3.2, minTier: 3, research: 8_000_000, act: 4 },
  { id: 'diamant', price: 3000, raw: 1200, k: 4.5, minTier: 4, research: 1_500_000_000, act: 4 },
];

/** Part du facteur matériau appliquée à chaque poste. */
export const MATERIAL_STATION_SHARE = [0.5, 1, 1, 0.3];

// ------------------------------------------------------------- Personnel

export const WORKER_SALARY = [0, 0.03, 0.10, 0.35, 1.5]; // €/s par niveau (1 à 4)
/** On n'embauche que des manœuvres : formations, puis promotion au bout de 5 formations. */
export const TRAINING = {
  perTraining: 0.04,
  perLevel: 5,
  /** Coût de la première formation à chaque niveau, × growth par formation suivante. */
  cost: [0, 10, 60, 600, 8000],
  growth: 1.25,
  time: [0, 10, 20, 40, 60],
};
export const PROMOTION = {
  cost: [0, 0, 60, 400, 8000],
  time: [0, 0, 20, 60, 150],
};
/** Polyvalents : moins chers, moins productifs, ils circulent et relèvent les ouvriers fatigués. */
export const POLY = { salaryShare: 0.7, productivity: 0.75, maxPerFactory: 6 };
/** Marcel est polyvalent mais pleinement productif. */
export const MARCEL_PRODUCTIVITY = 1;

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
  /** Relève : un ouvrier surchargé passe la main à un collègue libre et souffle (s). */
  restTime: 6,
  /** En dessous de ce moral, un ouvrier surchargé passe la main s'il le peut. */
  tired: 0.7,
};
/** Ingénieur méthodes : part de la caisse qu'il peut engager par modernisation. */
export const METHODS = { budgets: [0.25, 0.5, 0.75], period: 5 };
/** Un rôle est signalé coûteux quand son salaire dépasse cette part des recettes. */
export const ROLE_WARN_SHARE = 0.25;
export const CANTEEN_COST = [0, 0, 6000, 40000, 300000, 4_000_000];

/** Rôles support. */
export interface RoleDef {
  readonly id: RoleId;
  readonly act: number;
  readonly salary: number;
  readonly cost: number;
}
export type RoleId = 'foreman' | 'supervisor' | 'hr' | 'methods' | 'logistics' | 'sales' | 'controller';
export const ROLES: readonly RoleDef[] = [
  { id: 'foreman', act: 1, salary: 0.2, cost: 0 },
  { id: 'supervisor', act: 2, salary: 5, cost: 0 },
  { id: 'hr', act: 2, salary: 5, cost: 0 },
  { id: 'methods', act: 2, salary: 5, cost: 0 },
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
  readonly maxFactories: number;
  /** Frais de hall de la 2e usine (× growth par usine suivante). */
  readonly hall: number;
  readonly vmax: number;
  readonly goal: { kind: 'debt' } | { kind: 'share'; share: number; hold: number } | { kind: 'cash'; amount: number } | { kind: 'none' };
}

export const ACTS: readonly ActDef[] = [
  { id: 0, market: 5, maxFactories: 1, hall: 0, vmax: 3, goal: { kind: 'debt' } },
  { id: 1, market: 220, maxFactories: 2, hall: 400, vmax: 4, goal: { kind: 'share', share: 0.5, hold: 30 } },
  { id: 2, market: 3000, maxFactories: 4, hall: 3000, vmax: 4.5, goal: { kind: 'share', share: 0.5, hold: 30 } },
  { id: 3, market: 32000, maxFactories: 8, hall: 15000, vmax: 5, goal: { kind: 'share', share: 0.5, hold: 30 } },
  { id: 4, market: 10_000_000, maxFactories: 16, hall: 100000, vmax: 5, goal: { kind: 'cash', amount: 2e9 } },
  // Bac à sable : marché sans plafond pratique.
  { id: 5, market: 1e12, maxFactories: 16, hall: 100000, vmax: 5, goal: { kind: 'none' } },
];
export const SANDBOX_ACT = 5;
export const HALL_GROWTH = 1.5;
export const FACTORY_COPY_FACTOR = 1.2;

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
  /** Contrats long terme, réputation des contrats ponctuels. */
  act: 2,
  /** Commandes spéciales (contrats ponctuels) dès l'acte I, une à la fois avant l'acte II. */
  spotAct: 1,
  /** Taille d'une commande : secondes de la production mesurée du matériau. */
  spotSize: [120, 300],
  /** Difficulté : délai = temps nécessaire × slack ; prix = prix de base × (1 + prime). */
  spotLevels: [
    { slack: 2, premium: 0.08 },
    { slack: 1.3, premium: 0.15 },
    { slack: 1.1, premium: 0.25 },
  ],
  /** Production minimale d'un matériau (pièces/s) pour qu'on en commande. */
  spotMinRate: 0.05,
  /** Part de la production du matériau qu'une commande acceptée met de côté ; le reste se vend. */
  spotShare: 0.5,
  spotOffers: 3,
  spotRefresh: 150,
  longPrice: [1.08, 1.22],
  /** Prélèvement d'un contrat long terme, en part du marché. */
  longShare: [0.04, 0.12],
  longOffers: 2,
  longRefresh: 240,
  /** Rupture si le stock manque pendant ce temps (s). */
  longGrace: 30,
  maxLong: 4,
  repSpotOk: 0.5,
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

/**
 * Défis du bac à sable : un nouveau site avec une contrainte et un objectif.
 * produced : écrous à produire depuis le début du défi ; cash : caisse à atteindre ;
 * maxTier : palier de machine le plus haut permis ; time : durée limite (s de jeu).
 */
export type ChallengeId = 'nofire' | 'artisan' | 'chrono';
/** Capital de départ d'un défi : on repart presque de rien (recherches et savoir-faire gardés). */
export const CHALLENGE_CAPITAL = 1000;
export const CHALLENGES: { id: ChallengeId; produced?: number; cash?: number; maxTier?: number; time?: number }[] = [
  { id: 'nofire', produced: 500_000 },
  { id: 'artisan', cash: 1_000_000, maxTier: 1 },
  { id: 'chrono', produced: 3500, time: 1800 },
];

/**
 * Caractère des ouvriers, tiré à l'embauche (poids). speed : cadence ; fatigue : vitesse de
 * baisse du moral ; wear : usure de sa machine ; training : prix et durée des formations.
 * Le « bon camarade » remonte le moral de sa chaîne (MATE).
 */
export type TraitId = '' | 'fast' | 'steady' | 'mate' | 'careful' | 'gifted';
export const TRAITS: { id: TraitId; weight: number; speed: number; fatigue: number; wear: number; training: number }[] = [
  { id: '', weight: 40, speed: 1, fatigue: 1, wear: 1, training: 1 },
  { id: 'fast', weight: 18, speed: 1.15, fatigue: 1.6, wear: 1, training: 1 },
  { id: 'steady', weight: 16, speed: 0.92, fatigue: 0.4, wear: 1, training: 1 },
  { id: 'mate', weight: 10, speed: 1, fatigue: 1, wear: 1, training: 1 },
  { id: 'careful', weight: 8, speed: 1, fatigue: 1, wear: 0.7, training: 1 },
  { id: 'gifted', weight: 8, speed: 1, fatigue: 1, wear: 1, training: 0.6 },
];
/** Effet du bon camarade sur sa chaîne (ou toute l'usine s'il est polyvalent). */
export const MATE = { drop: 0.8, recovery: 1.4 };

/**
 * Récompenses des quêtes (story/quests) : secondes de marché de l'acte, ou « tool » pour un
 * niveau d'outillage offert sur le poste le moins outillé. L'objectif de l'acte ne rapporte rien.
 */
export const QUEST_REWARD: Record<string, number | 'tool'> = {
  'p-hire': 1.25, 'p-team': 3, 'p-tool': 2.5, 'p-unit': 3, 'p-conveyor': 5, 'p-line': 6,
  'i-research': 2, 'i-modern': 3, 'i-train': 'tool', 'i-promo': 2, 'i-foreman': 1, 'i-steel': 2, 'i-factory': 3, 'i-share': 5,
  'ii-night': 1, 'ii-poly': 1, 'ii-hr': 'tool', 'ii-semi': 4, 'ii-wind': 2, 'ii-contract': 3, 'ii-methods': 2, 'ii-four': 6,
  'iii-robot': 4, 'iii-tech': 3, 'iii-logistics': 2, 'iii-titane': 4, 'iii-controller': 2, 'iii-million': 5,
  'iv-carbide': 6, 'iv-twelve': 8, 'iv-black': 10, 'iv-wind': 3, 'iv-diamond': 4,
};

/**
 * Équipe de nuit : ce que l'usine produit pendant l'absence du joueur.
 * Rendement = part de la cadence normale ; durée = temps de travail maximal par absence.
 */
export const NIGHT = {
  act: 2,
  /** Absence courte (onglet en arrière-plan) rattrapée à plein régime, sans équipe de nuit. */
  grace: 300,
  rate: { per: 0.005, max: 50, cost: 1500, growth: 1.25 },
  duration: { base: 1800, per: 900, max: 10, cost: 6000, growth: 2.2 },
};
/** Durée minimale d'une crise avant la suivante (directeur d'incidents). */
export const CRISIS_GAP = 120;
