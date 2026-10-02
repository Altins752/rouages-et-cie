import type { KnowHowId, RoleId } from '../data/balance';

export interface Unit {
  wear: number;
  broken: boolean;
  /** Temps restant d'intervention (réparation ou révision), 0 si aucune. */
  service: number;
  serviceKind: 'none' | 'repair' | 'service';
  /** En cours d'usinage. */
  busy: boolean;
  prog: number;
  /** Ouvrier qui a réservé ou occupe l'unité (-1 si aucun). */
  worker: number;
  /** Temps occupé pendant le dernier pas (énergie, usure). */
  busyT: number;
}

export interface Station {
  tier: number;
  tool: number;
  units: Unit[];
}

export interface Chain {
  id: number;
  material: number;
  stations: Station[];
  /** buf[s] = pièces en attente devant le poste s (buf[0] inutilisé : barres illimitées). */
  buf: number[];
  /** Temps restant de rodage après un changement de matériau. */
  matChange: number;
  produced: number;
  scrapped: number;
  /** Mesure du gaspillage (s·unité en veille) depuis le dernier échantillon. */
  idleUnitT: number;
  busyUnitT: number;
}

export type WorkerState = 'idle' | 'walk' | 'work' | 'train';

export interface Worker {
  id: number;
  name: string;
  level: number;
  chain: number;
  /** Secondes passées sur chaque poste (spécialisation). */
  spec: number[];
  morale: number;
  /** Occupation, moyenne glissante 0–1. */
  load: number;
  state: WorkerState;
  /** Position en « postes » (0 = découpe … 3 = contrôle, 4,5 = porte). */
  pos: number;
  from: number;
  walkTotal: number;
  timer: number;
  ts: number;
  tu: number;
  trainTo: number;
  last: number;
  /** Poste attitré par le contremaître (-1 si aucun). */
  home: number;
  /** Ouvrier sans poste depuis la robotisation. */
  displaced: boolean;
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
  maxShare: number;
  playTime: number;
  /** Instant (jeu) de fin de chaque acte. */
  actEnd: number[];
  peakRevenueRate: number;
  knowHowEarned: number;
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
  chains: Chain[];
  workers: Worker[];
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
  | { type: 'piece'; chain: number; station: number; unit: number }
  | { type: 'scrap'; chain: number }
  | { type: 'sale'; value: number; n: number }
  | { type: 'breakdown'; chain: number; station: number; unit: number }
  | { type: 'repaired'; chain: number; station: number; unit: number }
  | { type: 'trained'; worker: number; level: number }
  | { type: 'deadline'; debt: number }
  | { type: 'goal' }
  | { type: 'ferrum'; event: 'poach' | 'war' | 'exclusive'; name?: string }
  | { type: 'warEnd' }
  | { type: 'spotDone'; id: number; value: number }
  | { type: 'spotFailed'; id: number }
  | { type: 'longBroken'; id: number }
  | { type: 'gridCut' }
  | { type: 'gridBack' }
  | { type: 'preventive'; chain: number; station: number; unit: number }
  | { type: 'milestone'; id: string };
