import type { KnowHowId, RoleId, TraitId } from '../data/balance';

/** Un poste d'une chaîne : établi ou machine. */
export interface Machine {
  tier: number;
  wear: number;
  broken: boolean;
  /** Temps restant d'intervention (réparation ou révision), 0 si aucune. */
  service: number;
  serviceKind: 'none' | 'repair' | 'service';
  /** En cours d'usinage. */
  busy: boolean;
  prog: number;
  /** Ouvrier attitré au poste (-1 : poste vacant). */
  post: number;
  /** Ouvrier qui usine en ce moment, attitré ou polyvalent (-1 : personne). */
  user: number;
  /** Temps occupé pendant le dernier pas (énergie, usure). */
  busyT: number;
  /** Pièces sorties par seconde (moyenne glissante, rapport du contremaître). */
  rate: number;
}

/** Une chaîne : une rangée de 4 postes, ses piles, son convoyeur. */
export interface Line {
  /** slots[s] : le poste s de la chaîne, ou null s'il n'est pas encore acheté. */
  slots: (Machine | null)[];
  /** buf[s] = pièces en attente devant le poste s (buf[0] inutilisé : barres illimitées). */
  buf: number[];
  conveyor: boolean;
  /** Ouvrier à la manivelle du convoyeur (-1 : aucun). */
  crank: number;
  produced: number;
}

/** Une usine (un hall) : jusqu'à 4 chaînes, un matériau. */
export interface Factory {
  id: number;
  material: number;
  lines: Line[];
  /** Temps restant de rodage après un changement de matériau. */
  matChange: number;
  produced: number;
  scrapped: number;
}

/** post : attitré à un poste ; poly : polyvalent ; crank : à la manivelle d'un convoyeur. */
export type WorkerKind = 'post' | 'poly' | 'crank';
export type WorkerState = 'idle' | 'walk' | 'work' | 'carry' | 'train';

export interface Worker {
  id: number;
  name: string;
  kind: WorkerKind;
  level: number;
  /** Formations suivies au niveau actuel (0 à 5). */
  trainings: number;
  /** Formations suivies depuis l'embauche (productivité). */
  trained: number;
  factory: number;
  /** Poste attitré (ouvrier fixe) ou chaîne du convoyeur (manivelle) ; -1 sinon. */
  line: number;
  station: number;
  morale: number;
  /** Occupation, moyenne glissante 0–1. */
  load: number;
  state: WorkerState;
  /** Position en « postes » (0 = découpe … 3 = contrôle, 4,5 = porte). */
  pos: number;
  from: number;
  walkTotal: number;
  timer: number;
  /** Machine visée ou occupée : chaîne et poste (-1). */
  tl: number;
  ts: number;
  /** Pièce portée sans convoyeur : chaîne et poste de destination (-1). */
  carryLine: number;
  carryTo: number;
  /** Stage en cours. */
  course: 'none' | 'train' | 'promote';
  last: number;
  /** Pause en cours (relève), en secondes. */
  rest: number;
  /** Caractère tiré à l'embauche ('' : ordinaire). */
  trait: TraitId;
}

/** Consigne de l'ingénieur méthodes. */
export interface Methods {
  /** Palier visé par type de poste. */
  targets: number[];
  /** Indice dans METHODS.budgets (part de la caisse engageable). */
  budget: number;
  active: boolean;
}

export interface SpotContract {
  id: number;
  material: number;
  qty: number;
  delivered: number;
  /** Prix unitaire négocié (€). */
  price: number;
  /** Délai : instant limite (temps de jeu) une fois accepté, ou durée proposée. */
  deadline: number;
  duration: number;
  accepted: boolean;
  /** Pièces déjà comptées dans la part de marché (au fil de la mise de côté). */
  counted: number;
  /** Difficulté : 0 tranquille, 1 serrée, 2 coup de bourre (absent des vieilles parties). */
  level?: number;
  /** Pièces qu'on peut déjà mettre de côté : la commande prend une part de la production, au fil de l'eau. */
  quota?: number;
}

export interface LongContract {
  id: number;
  material: number;
  /** Pièces par seconde. */
  rate: number;
  price: number;
  accepted: boolean;
  acc: number;
  short: number;
}

export interface History {
  /** Échantillons toutes les 5 s de jeu : voir HIST. */
  h5: number[][];
  /** Échantillons toutes les 60 s de jeu. */
  h60: number[][];
  acc: number[];
  accT: number;
  acc60: number[];
  acc60T: number;
}

export interface Energy {
  solar: number;
  wind: number;
  battery: number;
  charge: number;
  /** Régime des machines (1 = normal, < 1 = coupure réseau). */
  factor: number;
  cut: boolean;
  /** Dernier pas : kW demandés, solaire, éolien, batterie, réseau, manque. */
  demand: number;
  solarKw: number;
  windKw: number;
  batteryKw: number;
  gridKw: number;
  shortKw: number;
  cost: number;
}

export interface Market {
  acc: number;
  shareEma: number;
  goalT: number;
  goalReached: boolean;
  priceWar: number;
  ferrumDone: boolean[];
  /** Ventes au prix de base (moyenne glissante, €/s). */
  rateEma: number;
  /** Pièces finies par seconde et par matériau (moyenne glissante). */
  prodRate: number[];
}

export interface Crisis {
  active: string | null;
  until: number;
  queue: string[];
}

export interface Stats {
  revenueAct: number;
  revenueTotal: number;
  produced: number;
  sold: number;
  scrapped: number;
  laidOff: number;
  retrained: number;
  moves: number;
  breakdowns: number;
  contractsDone: number;
  /** Contrats ponctuels acceptés puis manqués (échéance dépassée). */
  contractsFailed: number;
  maxShare: number;
  playTime: number;
  /** Instant (jeu) de fin de chaque acte. */
  actEnd: number[];
  peakRevenueRate: number;
  knowHowEarned: number;
  trainings: number;
  promotions: number;
}

export interface Research {
  tier: number;
  materials: boolean[];
  preventive: boolean;
  predictive: boolean;
  workshop: boolean;
}

export interface GameState {
  version: number;
  seed: number;
  rng: number;
  /** Temps de jeu total. */
  t: number;
  /** Temps de jeu depuis le début de l'acte. */
  actT: number;
  act: number;
  money: number;
  debt: number;
  due: number;
  factories: Factory[];
  workers: Worker[];
  /** Outillage global : tooling[palier][poste], 0 à TOOL_MAX. Conservé aux déménagements. */
  tooling: number[][];
  methods: Methods;
  /** Équipe de nuit : niveaux de rendement et de durée (gardés au déménagement). */
  night: { rate: number; duration: number };
  nextId: number;
  nameIdx: number;
  stock: number[];
  /** Pièces mises de côté pour les contrats. */
  reserved: number[];
  research: Research;
  roles: Record<RoleId, boolean>;
  canteen: number;
  energy: Energy;
  market: Market;
  spot: SpotContract[];
  long: LongContract[];
  nextSpot: number;
  nextLong: number;
  reputation: number;
  knowHow: { points: number; levels: Record<KnowHowId, number> };
  stats: Stats;
  crisis: Crisis;
  story: { seen: Record<string, number>; flags: Record<string, number> };
  milestones: Record<string, boolean>;
  ended: boolean;
  ending: 'warm' | 'bitter' | null;
  history: History;
  /** Dernier pas : €/s par poste de dépense, pour le pupitre et les données. */
  flow: Flow;
  /** Événements à consommer par l'interface (non sauvegardés). */
  fx: SimEvent[];
}

export interface Flow {
  revenue: number;
  raw: number;
  salaries: number;
  energy: number;
  maintenance: number;
  contracts: number;
}

export type SimEvent =
  | { type: 'piece'; factory: number; line: number; station: number }
  | { type: 'scrap'; factory: number }
  | { type: 'sale'; value: number; n: number }
  | { type: 'breakdown'; factory: number; line: number; station: number }
  | { type: 'repaired'; factory: number; line: number; station: number }
  | { type: 'trained'; worker: number; level: number; promoted: boolean }
  | { type: 'hrTrain'; worker: number; promote: boolean }
  | { type: 'methods'; factory: number; line: number; station: number; tier: number }
  | { type: 'deadline'; debt: number }
  | { type: 'goal' }
  | { type: 'ferrum'; event: 'poach' | 'war' | 'exclusive'; name?: string }
  | { type: 'warEnd' }
  | { type: 'spotDone'; id: number; value: number; level: number; late: boolean }
  | { type: 'spotFailed'; id: number }
  | { type: 'longBroken'; id: number }
  | { type: 'gridCut' }
  | { type: 'gridBack' }
  | { type: 'preventive'; factory: number; line: number; station: number }
  | { type: 'milestone'; id: string };
