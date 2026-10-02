import { KNOW_HOW, LINES, MATERIALS, MORALE, PROLOGUE, ROLES, STATION_COUNT, DOOR_POS, TIER_COUNT } from '../data/balance';
import type { KnowHowId, RoleId } from '../data/balance';
import type { Factory, GameState, Line, Machine, Worker, WorkerKind } from './types';

/** v3 : refonte en usines et chaînes ; les parties v1 et v2 ne sont pas reprises. */
export const SAVE_VERSION = 3;

export const WORKER_NAMES = [
  'Marcel', 'Josette', 'Ahmed', 'Lucie', 'Paulo', 'Inès', 'Gégé', 'Nadia', 'Yvon', 'Sonia', 'Kévin', 'Odile',
  'Bruno', 'Malik', 'Fanny', 'René', 'Aïcha', 'Didier', 'Mireille', 'Thierry', 'Samia', 'Jojo', 'Christiane', 'Farid',
  'Huguette', 'Lionel', 'Rachida', 'Momo', 'Sylvie', 'Toni', 'Germaine', 'Karim', 'Ginette', 'Pascal', 'Leïla', 'Bernard',
];

export function newMachine(tier = 0): Machine {
  return { tier, wear: 0, broken: false, service: 0, serviceKind: 'none', busy: false, prog: 0, post: -1, user: -1, busyT: 0, rate: 0 };
}

export function newLine(full = false, tier = 0): Line {
  return {
    slots: Array.from({ length: STATION_COUNT }, () => (full ? newMachine(tier) : null)),
    buf: [0, 0, 0, 0],
    conveyor: false,
    crank: -1,
    produced: 0,
  };
}

/** Une usine neuve : la première chaîne équipée d'établis, les autres vides. */
export function newFactory(id: number, material = 0): Factory {
  return {
    id,
    material,
    lines: Array.from({ length: LINES }, (_, i) => newLine(i === 0)),
    matChange: 0,
    produced: 0,
    scrapped: 0,
  };
}

export function newWorker(s: GameState, factory: number, kind: WorkerKind, name?: string): Worker {
  const id = s.nextId++;
  let n = name;
  if (!n) {
    const k = s.nameIdx++;
    const base = WORKER_NAMES[1 + (k % (WORKER_NAMES.length - 1))];
    const round = Math.floor(k / (WORKER_NAMES.length - 1));
    n = round > 0 ? `${base} ${round + 1}` : base;
  }
  return {
    id, name: n, kind, level: 1, trainings: 0, trained: 0, factory, line: -1, station: -1,
    morale: MORALE.start, load: 0, state: 'idle', pos: DOOR_POS, from: DOOR_POS, walkTotal: 0, timer: 0,
    tl: -1, ts: -1, carryLine: -1, carryTo: -1, course: 'none', last: -1, rest: 0,
  };
}

function roles(): Record<RoleId, boolean> {
  const r = {} as Record<RoleId, boolean>;
  for (const d of ROLES) r[d.id] = false;
  return r;
}

export function emptyKnowHow(): Record<KnowHowId, number> {
  const r = {} as Record<KnowHowId, number>;
  for (const d of KNOW_HOW) r[d.id] = 0;
  return r;
}

export function createGame(seed = 1): GameState {
  const s: GameState = {
    version: SAVE_VERSION,
    seed,
    rng: seed | 0,
    t: 0,
    actT: 0,
    act: 0,
    money: PROLOGUE.startMoney,
    debt: PROLOGUE.debt,
    due: PROLOGUE.due,
    factories: [newFactory(0)],
    workers: [],
    tooling: Array.from({ length: TIER_COUNT }, () => [0, 0, 0, 0]),
    methods: { targets: [0, 0, 0, 0], budget: 1, active: false },
    nextId: 0,
    nameIdx: 0,
    stock: MATERIALS.map(() => 0),
    reserved: MATERIALS.map(() => 0),
    research: { tier: 0, materials: MATERIALS.map((_, i) => i === 0), preventive: false, predictive: false, workshop: false },
    roles: roles(),
    canteen: 0,
    energy: { solar: 0, wind: 0, battery: 0, charge: 0, factor: 1, cut: false, demand: 0, solarKw: 0, windKw: 0, batteryKw: 0, gridKw: 0, shortKw: 0, cost: 0 },
    market: { acc: 0, shareEma: 0, goalT: 0, goalReached: false, priceWar: 0, ferrumDone: [false, false, false], rateEma: 0, prodRate: MATERIALS.map(() => 0) },
    spot: [],
    long: [],
    nextSpot: 30,
    nextLong: 60,
    reputation: 0,
    knowHow: { points: 0, levels: emptyKnowHow() },
    stats: {
      revenueAct: 0, revenueTotal: 0, produced: 0, sold: 0, scrapped: 0, laidOff: 0, retrained: 0, moves: 0,
      breakdowns: 0, contractsDone: 0, maxShare: 0, playTime: 0, actEnd: [], peakRevenueRate: 0, knowHowEarned: 0,
      trainings: 0, promotions: 0,
    },
    crisis: { active: null, until: 0, queue: [] },
    story: { seen: {}, flags: {} },
    milestones: {},
    ended: false,
    ending: null,
    history: { h5: [], h60: [], acc: [], accT: 0, acc60: [], acc60T: 0 },
    flow: { revenue: 0, raw: 0, salaries: 0, energy: 0, maintenance: 0, contracts: 0 },
    fx: [],
  };
  const marcel = newWorker(s, 0, 'poly', 'Marcel');
  marcel.pos = 1.5;
  marcel.from = 1.5;
  s.workers.push(marcel);
  return s;
}

export function findWorker(s: GameState, id: number): Worker | undefined {
  return s.workers.find((w) => w.id === id);
}

/** Toutes les machines d'une usine, avec leur chaîne et leur poste. */
export function* machines(f: Factory): Generator<{ m: Machine; l: number; s: number }> {
  for (let l = 0; l < f.lines.length; l++) {
    const line = f.lines[l];
    for (let st = 0; st < line.slots.length; st++) {
      const m = line.slots[st];
      if (m) yield { m, l, s: st };
    }
  }
}
