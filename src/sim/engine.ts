/**
 * Moteur de jeu pur : aucun accès au DOM, au canvas ni à l'audio.
 * Déterministe (aléa à graine dans l'état), avance par pas de temps de jeu.
 * Le moteur reste juste quelle que soit la taille du pas : chaque ouvrier et
 * chaque machine consomment un budget de temps et enchaînent les pièces.
 *
 * Une usine compte jusqu'à 4 chaînes de 4 postes. Une pièce reste sur sa chaîne ;
 * si le poste suivant manque sur sa chaîne, elle passe sur la chaîne la moins chargée
 * qui l'a. Les ouvriers attitrés ne quittent jamais leur poste ; les polyvalents
 * circulent et relèvent les ouvriers fatigués ou absents.
 */
import {
  ACTS, BUFFER_CAP, CARRY_TIME, CONTRACTS, CRISIS_GAP, ENERGY, FERRUM, MATERIALS, METHODS, MORALE, POLY, PROLOGUE,
  ROBOT_NO_TECH_FACTOR, ROBOT_TIER, BLACK_TIER, ROLES, TIER_KW, TIER_OPERATOR_LEVEL, WALK_TIME, WEAR, WORKER_SALARY,
  DOOR_POS, REPUTATION, ASSIGN, MATE, TRAITS, CHALLENGES,
} from '../data/balance';
import { daylight, windFactor } from './env';
import {
  canPromote, canTrain, clamp, knowHow, machineCycle, modernizeCost, moraleActive, moraleCap, priceMult,
  promotionCost, promotionTime, scrapRate, tierCap, trainingCost, trainingTime, trait, unitPrice, workerSpeed,
} from './formulas';
import { rand, randInt, randRange } from './rng';
import { machines } from './state';
import type { Factory, GameState, Line, Machine, SimEvent, Worker, SpotContract } from './types';

export interface StepInput {
  /** Compte-tours en zone rouge : usure ×5, plus de rebut. */
  red: boolean;
}

const FX_MAX = 600;
/** Les événements purement visuels sont abandonnés si personne ne les lit ; les autres jamais. */
export function emit(s: GameState, e: SimEvent): void {
  if (s.fx.length >= FX_MAX && (e.type === 'piece' || e.type === 'sale' || e.type === 'scrap')) return;
  s.fx.push(e);
}

/** Indices des échantillons d'historique. */
export const HIST = {
  t: 0, prod: 1, sold: 2, rev: 3, energy: 4, sal: 5, stock: 6, money: 7, share: 8, solar: 9, wind: 10,
  batt: 11, grid: 12, short: 13, raw: 14, maint: 15, morale: 16, idle: 17, contracts: 18,
} as const;
const HIST_LEN = 19;

/** Avance la simulation de `total` secondes de jeu, par pas fixes de `dt`. */
export function advance(s: GameState, total: number, input: StepInput, dt: number): void {
  let left = total;
  while (left > 1e-9) {
    const d = Math.min(dt, left);
    step(s, d, input);
    left -= d;
  }
}

/** Pièces sorties par machine pendant le pas (cadence mesurée pour le contremaître). */
const outCount = new Map<Machine, number>();

export function step(s: GameState, dt: number, input: StepInput): void {
  s.t += dt;
  s.actT += dt;
  s.stats.playTime += dt;
  const money0 = s.money;
  const flow = { revenue: 0, raw: 0, salaries: 0, energy: 0, maintenance: 0, contracts: 0 };
  let soldBase = 0;
  let produced = 0;

  timers(s, dt);
  if (s.roles.hr && crossed(s.t, dt, 5)) hrDecisions(s);
  if (s.roles.methods && s.methods.active && crossed(s.t, dt, METHODS.period)) methodsDecisions(s);

  // Production
  const prodByMat = MATERIALS.map(() => 0);
  outCount.clear();
  for (const f of s.factories) for (const { m } of machines(f)) m.busyT = 0;
  for (let fi = 0; fi < s.factories.length; fi++) {
    const f = s.factories[fi];
    const before = f.produced;
    robots(s, f, fi, dt, input.red);
    prodByMat[f.material] += f.produced - before;
  }
  for (const w of s.workers) {
    if (w.state === 'train') {
      w.load += (0 - w.load) * (1 - Math.exp(-dt / MORALE.loadTau));
      continue;
    }
    const f = s.factories[w.factory];
    if (!f) continue;
    const before = f.produced;
    if (w.kind === 'crank') crankStep(s, w, f, dt);
    else if (w.kind === 'post') postStep(s, w, f, dt, input.red);
    else polyStep(s, w, f, dt, input.red);
    prodByMat[f.material] += f.produced - before;
  }
  for (let m = 0; m < prodByMat.length; m++) produced += prodByMat[m];
  const k = 1 - Math.exp(-dt / 20);
  for (const f of s.factories) for (const { m } of machines(f)) m.rate += ((outCount.get(m) ?? 0) / dt - m.rate) * k;

  flow.maintenance += wearAndBreakdowns(s, dt, input.red);
  flow.energy += energy(s, dt);

  // Contrats (avant le marché : ils sont servis en priorité)
  const c = contracts(s, dt);
  flow.contracts += c.revenue;
  flow.raw += c.raw;
  soldBase += c.base;

  // Ventes au marché
  const sale = sales(s, dt);
  flow.revenue += sale.revenue;
  flow.raw += sale.raw;
  soldBase += sale.base;

  // Salaires
  let sal = 0;
  for (const w of s.workers) sal += salaryOf(w);
  for (const r of ROLES) if (s.roles[r.id]) sal += r.salary;
  sal *= dt;
  s.money -= sal;
  flow.salaries += sal;

  morale(s, dt);

  // Part de marché (au prix de base, moyenne glissante)
  const act = ACTS[s.act];
  const a = 1 - Math.exp(-dt / 15);
  s.market.rateEma += (soldBase / dt - s.market.rateEma) * a;
  s.market.shareEma = s.market.rateEma / act.market;
  for (let m = 0; m < prodByMat.length; m++) s.market.prodRate[m] += (prodByMat[m] / dt - s.market.prodRate[m]) * (1 - Math.exp(-dt / 30));
  if (s.act >= 1 && s.act < 5) s.stats.maxShare = Math.max(s.stats.maxShare, s.market.shareEma);
  goal(s, dt);
  challenge(s);
  ferrum(s);
  crisis(s);

  // Prologue : échéance de la dette
  if (s.act === 0 && s.debt > 0 && s.t > s.due) {
    s.debt = Math.round(s.debt * PROLOGUE.lateFactor);
    s.due = s.t + PROLOGUE.extension;
    emit(s, { type: 'deadline', debt: s.debt });
  }

  s.stats.revenueAct += flow.revenue + flow.contracts;
  s.stats.revenueTotal += flow.revenue + flow.contracts;
  const inv = 1 / dt;
  s.flow = {
    revenue: flow.revenue * inv, raw: flow.raw * inv, salaries: flow.salaries * inv, energy: flow.energy * inv,
    maintenance: flow.maintenance * inv, contracts: flow.contracts * inv,
  };
  s.stats.peakRevenueRate = Math.max(s.stats.peakRevenueRate, s.market.rateEma);
  history(s, dt, produced, soldBase, money0);
}

export function salaryOf(w: Worker): number {
  const base = WORKER_SALARY[w.level];
  return w.kind === 'poly' ? base * POLY.salaryShare : base;
}

function crossed(t: number, dt: number, period: number): boolean {
  return Math.floor(t / period) !== Math.floor((t - dt) / period);
}

// ------------------------------------------------------------------ Minuteries

function timers(s: GameState, dt: number): void {
  for (const w of s.workers) {
    if (w.rest > 0) w.rest = Math.max(0, w.rest - dt);
    if (w.state !== 'train') continue;
    w.timer -= dt;
    if (w.timer <= 0) {
      const promoted = w.course === 'promote';
      if (promoted) {
        w.level++;
        w.trainings = 0;
        s.stats.promotions++;
        if (w.level === 4) s.stats.retrained++;
      } else {
        w.trainings++;
        w.trained++;
        s.stats.trainings++;
      }
      w.course = 'none';
      w.state = 'idle';
      w.timer = 0;
      w.pos = DOOR_POS;
      w.from = DOOR_POS;
      emit(s, { type: 'trained', worker: w.id, level: w.level, promoted });
    }
  }
  for (let fi = 0; fi < s.factories.length; fi++) {
    const f = s.factories[fi];
    if (f.matChange > 0) f.matChange = Math.max(0, f.matChange - dt);
    for (const { m, l, s: st } of machines(f)) {
      if (m.service <= 0) continue;
      m.service -= dt;
      if (m.service <= 0) {
        m.service = 0;
        const wasRepair = m.serviceKind === 'repair';
        m.serviceKind = 'none';
        m.broken = false;
        m.wear = 0;
        if (wasRepair) emit(s, { type: 'repaired', factory: fi, line: l, station: st });
      }
    }
  }
  if (s.market.priceWar > 0) {
    s.market.priceWar -= dt;
    if (s.market.priceWar <= 0) {
      s.market.priceWar = 0;
      emit(s, { type: 'warEnd' });
    }
  }
}

// ------------------------------------------------------------------ Flux des pièces

/** Chaîne qui reçoit la sortie du poste (l, st) : la sienne si elle a le poste suivant, sinon la moins chargée qui l'a. -2 = stock, -1 = aucune. */
export function nextLine(f: Factory, l: number, st: number): number {
  if (st >= 3) return -2;
  if (f.lines[l].slots[st + 1]) return l;
  let best = -1;
  let bv = Infinity;
  for (let k = 0; k < f.lines.length; k++) {
    if (!f.lines[k].slots[st + 1]) continue;
    const v = f.lines[k].buf[st + 1];
    if (v < bv) {
      bv = v;
      best = k;
    }
  }
  return best;
}

function outputSpace(f: Factory, l: number, st: number): boolean {
  const t = nextLine(f, l, st);
  if (t === -2) return true;
  if (t < 0) return false;
  return f.lines[t].buf[st + 1] < BUFFER_CAP;
}

function inputReady(line: Line, st: number): boolean {
  return st === 0 || line.buf[st] > 0;
}

function machineFree(m: Machine): boolean {
  return !m.broken && m.service <= 0 && !m.busy && m.user < 0;
}

/** Le convoyeur d'une chaîne tourne-t-il (convoyeur acheté et ouvrier à la manivelle présent) ? */
export function conveyorActive(s: GameState, line: Line): boolean {
  if (!line.conveyor || line.crank < 0) return false;
  const w = s.workers.find((x) => x.id === line.crank);
  return !!w && w.state !== 'train' && w.rest <= 0;
}

function controlTier(f: Factory): number {
  let t = 0;
  for (const l of f.lines) if (l.slots[3]) t = Math.max(t, l.slots[3]!.tier);
  return t;
}

/** Dépose une pièce finie au poste (l, st) dans la pile suivante, ou au stock après le contrôle. */
function deposit(s: GameState, f: Factory, fi: number, l: number, st: number, red: boolean, target = -9): void {
  const t = target === -9 ? nextLine(f, l, st) : target;
  if (st >= 3 || t === -2) {
    if (rand(s) < scrapRate(f, controlTier(f), red)) {
      f.scrapped++;
      s.stats.scrapped++;
      s.money -= MATERIALS[f.material].raw;
      emit(s, { type: 'scrap', factory: fi });
      return;
    }
    s.stock[f.material]++;
    f.produced++;
    f.lines[l].produced++;
    s.stats.produced++;
  } else if (t >= 0) {
    f.lines[t].buf[st + 1]++;
  } else {
    // aucun poste suivant : la pièce reste en attente sur sa chaîne
    f.lines[l].buf[Math.min(3, st + 1)]++;
  }
}

function finished(s: GameState, fi: number, l: number, st: number, m: Machine): void {
  outCount.set(m, (outCount.get(m) ?? 0) + 1);
  emit(s, { type: 'piece', factory: fi, line: l, station: st });
}

// ------------------------------------------------------------------ Robots

function techPresent(s: GameState, fi: number): boolean {
  for (const w of s.workers) if (w.factory === fi && w.level >= 4 && w.state !== 'train') return true;
  return false;
}

function robots(s: GameState, f: Factory, fi: number, dt: number, red: boolean): void {
  let tech: boolean | null = null;
  for (let st = 3; st >= 0; st--) {
    for (let l = 0; l < f.lines.length; l++) {
      const line = f.lines[l];
      const m = line.slots[st];
      if (!m || m.tier < ROBOT_TIER || m.broken || m.service > 0) continue;
      if (tech === null) tech = techPresent(s, fi);
      const cyc = machineCycle(s, f.material, m.tier, st);
      const rate = (m.tier >= BLACK_TIER || tech ? 1 : ROBOT_NO_TECH_FACTOR) * s.energy.factor;
      let budget = dt;
      let guard = 0;
      while (budget > 1e-9 && guard++ < 400) {
        if (!m.busy) {
          if (!inputReady(line, st) || !outputSpace(f, l, st)) break;
          if (st > 0) line.buf[st]--;
          m.busy = true;
          m.prog = 0;
        }
        const need = (cyc - m.prog) / rate;
        const d = Math.min(budget, need);
        m.prog += d * rate;
        m.busyT += d;
        budget -= d;
        if (m.prog >= cyc - 1e-9) {
          m.busy = false;
          m.prog = 0;
          deposit(s, f, fi, l, st, red);
          finished(s, fi, l, st, m);
        }
      }
    }
  }
}

// ------------------------------------------------------------------ Ouvriers

/** Rend la pièce en cours et libère la machine. */
function abandon(f: Factory, w: Worker): void {
  if (w.tl >= 0 && w.ts >= 0) {
    const line = f.lines[w.tl];
    const m = line?.slots[w.ts];
    if (m && m.user === w.id) {
      if (m.busy || w.state === 'walk') {
        if (w.ts > 0) line.buf[w.ts]++;
      }
      m.busy = false;
      m.prog = 0;
      m.user = -1;
    }
  }
  w.tl = -1;
  w.ts = -1;
}

/** Libère un ouvrier de sa tâche (formation, licenciement, modernisation…). */
export function releaseWorker(s: GameState, w: Worker): void {
  const f = s.factories[w.factory];
  if (!f) return;
  if (w.state === 'walk' && w.walkTotal > 0) w.pos = w.ts >= 0 ? w.ts - (w.ts - w.from) * (w.timer / w.walkTotal) : w.pos;
  if (w.state === 'carry' && w.carryTo >= 0) {
    f.lines[w.carryLine].buf[w.carryTo]++;
  }
  abandon(f, w);
  w.carryLine = -1;
  w.carryTo = -1;
  w.state = 'idle';
  w.timer = 0;
}

/** Fin d'une pièce par un humain : portage ou dépôt direct. Renvoie vrai s'il part porter. */
function humanFinish(s: GameState, f: Factory, fi: number, w: Worker, l: number, st: number, red: boolean): boolean {
  const line = f.lines[l];
  const m = line.slots[st]!;
  finished(s, fi, l, st, m);
  const t = nextLine(f, l, st);
  if (!conveyorActive(s, line) && t !== -2) {
    w.carryLine = t >= 0 ? t : l;
    w.carryTo = Math.min(3, st + 1);
    w.state = 'carry';
    w.timer = CARRY_TIME;
    return true;
  }
  deposit(s, f, fi, l, st, red, t);
  return false;
}

function updateLoad(w: Worker, dt: number, idle: number): void {
  const occ = (dt - idle) / dt;
  w.load += (occ - w.load) * (1 - Math.exp(-dt / MORALE.loadTau));
}

/** Un polyvalent qualifié est-il disponible pour relever un ouvrier de cette usine ? */
function polyAvailable(s: GameState, fi: number, req: number): boolean {
  for (const o of s.workers) {
    if (o.kind === 'poly' && o.factory === fi && o.state === 'idle' && o.rest <= 0 && o.level >= req) return true;
  }
  return false;
}

function postStep(s: GameState, w: Worker, f: Factory, dt: number, red: boolean): void {
  const fi = w.factory;
  let budget = dt;
  let idle = 0;
  let guard = 0;
  while (guard++ < 24) {
    if (w.state === 'carry') {
      if (budget <= 1e-9) break;
      const d = Math.min(budget, w.timer);
      w.timer -= d;
      budget -= d;
      if (w.timer > 1e-9) break;
      if (w.carryTo >= 0) {
        if (w.carryTo === 3 && w.carryLine >= 0 && !f.lines[w.carryLine].slots[3]) f.lines[w.carryLine].buf[3]++;
        else f.lines[w.carryLine].buf[w.carryTo]++;
      }
      w.carryLine = -1;
      w.carryTo = -1;
      w.state = 'idle';
      continue;
    }
    if (w.state === 'walk') {
      if (budget <= 1e-9) break;
      const d = Math.min(budget, w.timer);
      w.timer -= d;
      budget -= d;
      if (w.timer > 1e-9) break;
      w.pos = w.station;
      w.state = 'idle';
      continue;
    }
    if (w.state === 'work') {
      const line = f.lines[w.line];
      const m = line.slots[w.station];
      if (!m || m.user !== w.id || m.broken || m.service > 0) {
        abandon(f, w);
        w.state = 'idle';
        continue;
      }
      if (budget <= 1e-9) break;
      const cyc = machineCycle(s, f.material, m.tier, w.station);
      const rate = workerSpeed(s, w) * (m.tier > 0 ? s.energy.factor : 1);
      const need = (cyc - m.prog) / rate;
      const d = Math.min(budget, need);
      m.prog += d * rate;
      m.busyT += d;
      budget -= d;
      if (m.prog < cyc - 1e-9) break;
      m.busy = false;
      m.prog = 0;
      m.user = -1;
      w.tl = -1;
      w.ts = -1;
      w.last = w.station;
      w.state = 'idle';
      humanFinish(s, f, fi, w, w.line, w.station, red);
      // Relève : fatigué et surchargé, il laisse la place à un polyvalent libre.
      if (moraleActive(s) && w.load > MORALE.highLoad && w.morale < MORALE.tired && polyAvailable(s, fi, TIER_OPERATOR_LEVEL[m.tier])) {
        w.rest = MORALE.restTime;
      }
      continue;
    }
    // idle
    if (w.line < 0 || w.station < 0) {
      idle = budget;
      break;
    }
    if (Math.abs(w.pos - w.station) > 0.01) {
      w.from = w.pos;
      w.walkTotal = Math.abs(w.pos - w.station) * WALK_TIME;
      w.timer = w.walkTotal;
      w.state = 'walk';
      continue;
    }
    if (w.rest > 0) {
      idle = budget;
      break;
    }
    const line = f.lines[w.line];
    const m = line.slots[w.station];
    if (!m || m.tier >= ROBOT_TIER || w.level < TIER_OPERATOR_LEVEL[m.tier] || !machineFree(m) || !inputReady(line, w.station) || !outputSpace(f, w.line, w.station)) {
      idle = budget;
      break;
    }
    if (w.station > 0) line.buf[w.station]--;
    m.busy = true;
    m.prog = 0;
    m.user = w.id;
    w.tl = w.line;
    w.ts = w.station;
    w.state = 'work';
  }
  updateLoad(w, dt, idle);
}

/** Le titulaire du poste est-il absent (formation, pause, pas encore qualifié, en route) ? */
function postAbsent(s: GameState, m: Machine): boolean {
  if (m.post < 0) return true;
  const o = s.workers.find((x) => x.id === m.post);
  if (!o) return true;
  return o.state === 'train' || o.rest > 0 || o.level < TIER_OPERATOR_LEVEL[m.tier] || o.state === 'walk';
}

interface Job { l: number; st: number }

function pickJob(s: GameState, f: Factory, w: Worker): Job | null {
  if (w.rest > 0) return null;
  let best: Job | null = null;
  let bs = -1e9;
  for (let st = 3; st >= 0; st--) {
    for (let l = 0; l < f.lines.length; l++) {
      const line = f.lines[l];
      const m = line.slots[st];
      if (!m || m.tier >= ROBOT_TIER || w.level < TIER_OPERATOR_LEVEL[m.tier] || !machineFree(m)) continue;
      if (!inputReady(line, st) || !outputSpace(f, l, st)) continue;
      if (!postAbsent(s, m)) continue;
      let sc = st * ASSIGN.downstream + (w.last === st ? ASSIGN.stay : 0) - Math.abs(w.pos - st) * ASSIGN.walk;
      if (st === 0 && line.buf[1] >= BUFFER_CAP - 1) sc -= ASSIGN.feedPenalty;
      if (sc > bs) {
        bs = sc;
        best = { l, st };
      }
    }
  }
  return best;
}

function polyStep(s: GameState, w: Worker, f: Factory, dt: number, red: boolean): void {
  const fi = w.factory;
  let budget = dt;
  let idle = 0;
  let guard = 0;
  while (guard++ < 24) {
    if (w.state === 'carry') {
      if (budget <= 1e-9) break;
      const d = Math.min(budget, w.timer);
      w.timer -= d;
      budget -= d;
      if (w.timer > 1e-9) break;
      if (w.carryTo >= 0) f.lines[w.carryLine].buf[w.carryTo]++;
      w.carryLine = -1;
      w.carryTo = -1;
      w.state = 'idle';
      continue;
    }
    if (w.state === 'idle') {
      const job = pickJob(s, f, w);
      if (!job) {
        idle = budget;
        break;
      }
      const line = f.lines[job.l];
      const m = line.slots[job.st]!;
      m.user = w.id;
      if (job.st > 0) line.buf[job.st]--;
      w.tl = job.l;
      w.ts = job.st;
      w.from = w.pos;
      w.walkTotal = Math.abs(w.pos - job.st) * WALK_TIME;
      w.timer = w.walkTotal;
      w.state = 'walk';
    }
    if (budget <= 1e-9) break;
    if (w.state === 'walk') {
      const d = Math.min(budget, w.timer);
      w.timer -= d;
      budget -= d;
      if (w.timer > 1e-9) break;
      w.pos = w.ts;
      const m = f.lines[w.tl]?.slots[w.ts];
      if (!m || m.broken || m.service > 0 || m.user !== w.id) {
        if (w.ts > 0 && f.lines[w.tl]) f.lines[w.tl].buf[w.ts]++;
        if (m && m.user === w.id) m.user = -1;
        w.tl = -1;
        w.ts = -1;
        w.state = 'idle';
        continue;
      }
      m.busy = true;
      m.prog = 0;
      w.state = 'work';
    }
    if (w.state === 'work') {
      const line = f.lines[w.tl];
      const m = line?.slots[w.ts];
      if (!m || m.broken || m.service > 0 || m.user !== w.id) {
        abandon(f, w);
        w.state = 'idle';
        continue;
      }
      const cyc = machineCycle(s, f.material, m.tier, w.ts);
      const rate = workerSpeed(s, w) * (m.tier > 0 ? s.energy.factor : 1);
      const need = (cyc - m.prog) / rate;
      const d = Math.min(budget, need);
      m.prog += d * rate;
      m.busyT += d;
      budget -= d;
      if (m.prog < cyc - 1e-9) break;
      const l = w.tl;
      const st = w.ts;
      m.busy = false;
      m.prog = 0;
      m.user = -1;
      w.tl = -1;
      w.ts = -1;
      w.last = st;
      w.state = 'idle';
      humanFinish(s, f, fi, w, l, st, red);
    }
  }
  updateLoad(w, dt, idle);
}

/** L'ouvrier à la manivelle travaille quand sa chaîne tourne. */
function crankStep(s: GameState, w: Worker, f: Factory, dt: number): void {
  const line = f.lines[w.line];
  if (!line) {
    updateLoad(w, dt, dt);
    return;
  }
  w.pos = -0.55;
  const active = line.slots.some((m) => m && m.busy);
  w.state = active ? 'work' : 'idle';
  updateLoad(w, dt, active && w.rest <= 0 ? 0 : dt);
  void s;
}

// ------------------------------------------------------------------ Opérations partagées

/** Envoie un ouvrier en formation ou en promotion (sans vérifier la caisse). */
export function startCourse(s: GameState, w: Worker, kind: 'train' | 'promote'): number {
  const cost = kind === 'train' ? trainingCost(s, w) : promotionCost(s, w);
  releaseWorker(s, w);
  w.state = 'train';
  w.course = kind;
  w.timer = kind === 'train' ? trainingTime(s, w) : promotionTime(s, w);
  s.money -= cost;
  return cost;
}

/** Modernise une machine d'un palier (sans vérifier la caisse). */
export function modernizeMachine(s: GameState, f: Factory, l: number, st: number, rank: number): number {
  const m = f.lines[l].slots[st]!;
  const cost = modernizeCost(m.tier, st, rank);
  if (m.user >= 0) {
    const u = s.workers.find((x) => x.id === m.user);
    if (u) releaseWorker(s, u);
  }
  m.tier++;
  m.wear = 0;
  m.broken = false;
  m.service = 0;
  m.busy = false;
  m.prog = 0;
  m.user = -1;
  s.money -= cost;
  return cost;
}

/** Rang d'une machine parmi celles de son poste dans l'usine (ordre des chaînes). */
export function machineRank(f: Factory, l: number, st: number): number {
  let r = 0;
  for (let k = 0; k < l; k++) if (f.lines[k].slots[st]) r++;
  return r;
}

/**
 * Ressources humaines : forment et promeuvent d'abord les ouvriers dont la machine exige un
 * niveau supérieur, puis forment celui qui freine le plus sa chaîne. Elles n'embauchent pas.
 */
function hrDecisions(s: GameState): void {
  for (let fi = 0; fi < s.factories.length; fi++) {
    const f = s.factories[fi];
    const ws = s.workers.filter((w) => w.factory === fi && w.state !== 'train');
    // 1. Qualification requise par la machine du poste
    let done = false;
    for (const w of ws) {
      if (w.kind !== 'post') continue;
      const m = f.lines[w.line]?.slots[w.station];
      if (!m || m.tier >= ROBOT_TIER || w.level >= TIER_OPERATOR_LEVEL[m.tier]) continue;
      if (canPromote(w)) {
        startCourse(s, w, 'promote');
        emit(s, { type: 'hrTrain', worker: w.id, promote: true });
        done = true;
        break;
      }
      if (canTrain(w)) {
        startCourse(s, w, 'train');
        emit(s, { type: 'hrTrain', worker: w.id, promote: false });
        done = true;
        break;
      }
    }
    if (done) continue;
    // 1 bis. Préparer les ouvriers des machines que l'ingénieur méthodes va moderniser
    if (s.roles.methods && s.methods.active) {
      for (const w of ws) {
        if (w.kind !== 'post') continue;
        const m = f.lines[w.line]?.slots[w.station];
        if (!m || m.tier >= (s.methods.targets[w.station] ?? 0) || m.tier + 1 >= ROBOT_TIER) continue;
        if (w.level >= TIER_OPERATOR_LEVEL[m.tier + 1]) continue;
        if (canPromote(w) && s.money >= promotionCost(s, w) * 2) {
          startCourse(s, w, 'promote');
          emit(s, { type: 'hrTrain', worker: w.id, promote: true });
          done = true;
          break;
        }
        if (canTrain(w) && s.money >= trainingCost(s, w) * 3) {
          startCourse(s, w, 'train');
          emit(s, { type: 'hrTrain', worker: w.id, promote: false });
          done = true;
          break;
        }
      }
      if (done) continue;
    }
    // 2. Technicien pour une usine robotisée
    if (s.act >= 3 && f.lines.some((l) => l.slots.some((m) => m && m.tier === ROBOT_TIER)) && !s.workers.some((w) => w.factory === fi && (w.level >= 4 || (w.state === 'train' && w.level === 3 && w.course === 'promote')))) {
      const cand = ws.filter((w) => w.kind !== 'crank').sort((a, b) => b.level * 10 + b.trainings - (a.level * 10 + a.trainings))[0];
      if (cand) {
        if (canPromote(cand) && s.money >= promotionCost(s, cand) * 1.5) {
          startCourse(s, cand, 'promote');
          emit(s, { type: 'hrTrain', worker: cand.id, promote: true });
          continue;
        }
        if (canTrain(cand) && s.money >= trainingCost(s, cand) * 2) {
          startCourse(s, cand, 'train');
          emit(s, { type: 'hrTrain', worker: cand.id, promote: false });
          continue;
        }
      }
    }
    // 3. L'ouvrier qui freine le plus sa chaîne
    let worst: Worker | null = null;
    let wr = Infinity;
    for (const w of ws) {
      if (w.kind !== 'post' || !canTrain(w)) continue;
      const m = f.lines[w.line]?.slots[w.station];
      if (!m || m.tier >= ROBOT_TIER) continue;
      const r = workerSpeed(s, w) / machineCycle(s, f.material, m.tier, w.station);
      if (r < wr) {
        wr = r;
        worst = w;
      }
    }
    if (worst && s.money >= trainingCost(s, worst) * 3) {
      startCourse(s, worst, 'train');
      emit(s, { type: 'hrTrain', worker: worst.id, promote: false });
    }
  }
}

/** Ingénieur méthodes : modernise selon la consigne, les postes les plus lents d'abord. */
function methodsDecisions(s: GameState): void {
  const share = METHODS.budgets[s.methods.budget] ?? 0.5;
  let best: { f: Factory; l: number; st: number; cost: number; cap: number } | null = null;
  for (const f of s.factories) {
    for (let st = 0; st < 4; st++) {
      const target = s.methods.targets[st] ?? 0;
      let cap = 0;
      for (const l of f.lines) {
        const m = l.slots[st];
        if (m) cap += 1 / machineCycle(s, f.material, m.tier, st);
      }
      for (let l = 0; l < f.lines.length; l++) {
        const m = f.lines[l].slots[st];
        if (!m || m.tier >= target || m.tier + 1 > s.research.tier || m.tier + 1 >= 5 || m.tier + 1 > tierCap(s)) continue;
        if (m.post >= 0 && m.tier + 1 < ROBOT_TIER) {
          const w = s.workers.find((x) => x.id === m.post);
          if (w && w.level < TIER_OPERATOR_LEVEL[m.tier + 1]) continue;
        }
        const cost = modernizeCost(m.tier, st, machineRank(f, l, st));
        if (cost > s.money * share) continue;
        if (!best || cap < best.cap) best = { f, l, st, cost, cap };
        break;
      }
    }
  }
  if (!best) return;
  const fi = s.factories.indexOf(best.f);
  modernizeMachine(s, best.f, best.l, best.st, machineRank(best.f, best.l, best.st));
  emit(s, { type: 'methods', factory: fi, line: best.l, station: best.st, tier: best.f.lines[best.l].slots[best.st]!.tier });
}

// ------------------------------------------------------- Usure et pannes

function wearAndBreakdowns(s: GameState, dt: number, red: boolean): number {
  let spent = 0;
  const kwear = (1 - knowHow(s, 'wear')) * (red ? WEAR.redZoneFactor : 1);
  const careful = new Set<number>();
  for (const w of s.workers) if (w.trait === 'careful') careful.add(w.id);
  for (let fi = 0; fi < s.factories.length; fi++) {
    const f = s.factories[fi];
    const k = MATERIALS[f.material].k;
    for (const { m: u, l, s: st } of machines(f)) {
      if (u.tier === 0 && !WEAR.manualWears) continue;
      if (u.broken || u.service > 0) continue;
      const mf = 1 + (k - 1) * [0.5, 1, 1, 0.3][st];
      const load = u.busyT + WEAR.idleFactor * Math.max(0, dt - u.busyT);
      const care = u.post >= 0 && careful.has(u.post) ? TRAITS.find((t) => t.id === 'careful')!.wear : 1;
      u.wear = Math.min(1, u.wear + (load / WEAR.fullLoadTime) * mf * kwear * care);
      const price = unitPrice(u.tier, st, machineRank(f, l, st));
      if (s.research.preventive && u.wear >= WEAR.preventiveAt) {
        const share = s.research.predictive ? WEAR.predictiveShare : WEAR.preventiveShare;
        const cost = price * share;
        s.money -= cost;
        spent += cost;
        if (s.research.predictive) u.wear = 0;
        else {
          u.service = WEAR.preventiveTime;
          u.serviceKind = 'service';
        }
        emit(s, { type: 'preventive', factory: fi, line: l, station: st });
        continue;
      }
      if (u.wear > WEAR.breakStart && u.busyT > 0) {
        const p = Math.pow((u.wear - WEAR.breakStart) / (1 - WEAR.breakStart), 2) * (WEAR.breakPerMin / 60) * dt;
        if (rand(s) < p) {
          u.broken = true;
          s.stats.breakdowns++;
          emit(s, { type: 'breakdown', factory: fi, line: l, station: st });
          if (s.research.workshop) {
            const cost = price * WEAR.internalRepairShare;
            s.money -= cost;
            spent += cost;
            u.service = WEAR.internalRepairTime;
            u.serviceKind = 'repair';
          }
        }
      }
    }
  }
  return spent;
}


// ---------------------------------------------------------------- Énergie

function energy(s: GameState, dt: number): number {
  const e = s.energy;
  const save = 1 - knowHow(s, 'energy');
  let demand = 0;
  for (const f of s.factories) {
    for (const { m: u } of machines(f)) {
      if (u.tier === 0 || u.broken || u.service > 0) continue;
      demand += TIER_KW[u.tier] * save * (u.busyT + ENERGY.idleShare * Math.max(0, dt - u.busyT));
    }
  }
  const solarKw = e.solar * ENERGY.solar.kw * daylight(s.t);
  const windKw = e.wind * ENERGY.wind.kw * windFactor(s.t);
  const renew = (solarKw + windKw) * dt;
  let deficit = Math.max(0, demand - renew);
  let surplus = Math.max(0, renew - demand);
  const cap = e.battery * ENERGY.battery.capacity;
  let battOut = 0;
  if (surplus > 0) {
    const inBatt = Math.min(surplus, cap - e.charge);
    e.charge += inBatt;
    surplus -= inBatt;
    battOut = -inBatt;
  } else if (deficit > 0) {
    battOut = Math.min(e.charge, deficit);
    e.charge -= battOut;
    deficit -= battOut;
  }
  let cost = 0;
  let grid = 0;
  let short = 0;
  if (surplus > 0) s.money += surplus * ENERGY.sellPrice;
  const wasCut = e.cut;
  if (deficit > 0) {
    if (s.money >= 0) {
      grid = deficit;
      cost = deficit * ENERGY.gridPrice;
      s.money -= cost;
      e.cut = false;
    } else {
      short = deficit;
      e.cut = true;
    }
  } else e.cut = false;
  e.factor = e.cut && demand > 0 ? Math.max(ENERGY.cutFloor, (demand - short) / demand) : 1;
  if (e.cut && !wasCut) emit(s, { type: 'gridCut' });
  if (!e.cut && wasCut) emit(s, { type: 'gridBack' });
  e.demand = demand / dt;
  e.solarKw = solarKw;
  e.windKw = windKw;
  e.batteryKw = battOut / dt;
  e.gridKw = grid / dt;
  e.shortKw = short / dt;
  e.cost = (cost - surplus * ENERGY.sellPrice) / dt;
  return cost - surplus * ENERGY.sellPrice;
}

// ---------------------------------------------------------------- Ventes

function sales(s: GameState, dt: number): { revenue: number; raw: number; base: number } {
  const act = ACTS[s.act];
  const mk = s.market;
  const maxPrice = MATERIALS[MATERIALS.length - 1].price;
  mk.acc = Math.min(mk.acc + act.market * dt, act.market * 1 + maxPrice);
  const mult = priceMult(s);
  let revenue = 0;
  let raw = 0;
  let base = 0;
  let n = 0;
  for (let m = MATERIALS.length - 1; m >= 0; m--) {
    const avail = s.stock[m] - s.reserved[m];
    if (avail <= 0) continue;
    const p = MATERIALS[m].price;
    const k = Math.min(avail, Math.floor(mk.acc / p));
    if (k <= 0) continue;
    s.stock[m] -= k;
    mk.acc -= k * p;
    revenue += k * p * mult;
    raw += k * MATERIALS[m].raw;
    base += k * p;
    n += k;
  }
  s.money += revenue - raw;
  s.stats.sold += n;
  if (n > 0) emit(s, { type: 'sale', value: revenue, n });
  return { revenue, raw, base };
}

// -------------------------------------------------------------- Contrats

/** Pièces qu'une commande peut encore mettre de côté maintenant (sa part de la production). */
export function spotRoom(sc: SpotContract): number {
  return Math.max(0, Math.min(sc.qty, Math.floor(sc.quota ?? sc.qty)) - sc.delivered);
}

function producible(s: GameState): number[] {
  const set = new Set<number>();
  for (const f of s.factories) set.add(f.material);
  return [...set];
}

function contracts(s: GameState, dt: number): { revenue: number; raw: number; base: number } {
  let revenue = 0;
  let raw = 0;
  let base = 0;
  const act = ACTS[s.act];
  if (s.act < CONTRACTS.spotAct || s.act > 4) return { revenue, raw, base };
  const mult = priceMult(s);
  const mats = producible(s);

  // Nouvelles offres, taillées sur la production mesurée : 2 à 5 min de production.
  if (s.t >= s.nextSpot) {
    s.nextSpot = s.t + CONTRACTS.spotRefresh * randRange(s, 0.7, 1.3);
    const single = s.act < CONTRACTS.act;
    if (!single || s.spot.length === 0) {
      const offers = s.spot.filter((c) => !c.accepted);
      if (offers.length >= CONTRACTS.spotOffers) s.spot.splice(s.spot.indexOf(offers[0]), 1);
      const able = mats.filter((m) => s.market.prodRate[m] >= CONTRACTS.spotMinRate);
      if (able.length) {
        const m = able[randInt(s, able.length)];
        const p = MATERIALS[m].price;
        const rate = s.market.prodRate[m];
        const level = randInt(s, CONTRACTS.spotLevels.length);
        const lv = CONTRACTS.spotLevels[level];
        const share = rate * CONTRACTS.spotShare;
        const qty = Math.max(5, Math.round((share * randRange(s, CONTRACTS.spotSize[0], CONTRACTS.spotSize[1])) / 5) * 5);
        s.spot.push({
          id: s.nextId++, material: m, qty, delivered: 0, level, quota: 0,
          price: p * (1 + lv.premium) * mult,
          deadline: 0, duration: Math.ceil((qty / share) * lv.slack / 10) * 10,
          accepted: false, counted: 0,
        });
      }
    }
  }
  if (s.act >= CONTRACTS.act && s.t >= s.nextLong) {
    s.nextLong = s.t + CONTRACTS.longRefresh * randRange(s, 0.7, 1.3);
    const offers = s.long.filter((c) => !c.accepted);
    if (offers.length >= CONTRACTS.longOffers) s.long.splice(s.long.indexOf(offers[0]), 1);
    const m = mats[randInt(s, mats.length)];
    const p = MATERIALS[m].price;
    s.long.push({
      id: s.nextId++, material: m,
      rate: (act.market * randRange(s, CONTRACTS.longShare[0], CONTRACTS.longShare[1])) / p,
      price: p * randRange(s, CONTRACTS.longPrice[0], CONTRACTS.longPrice[1]) * mult,
      accepted: false, acc: 0, short: 0,
    });
  }

  // Commercial : signe les contrats long terme tenables.
  if (s.roles.sales) {
    for (const lc of s.long) {
      if (lc.accepted || s.long.filter((x) => x.accepted).length >= CONTRACTS.maxLong) continue;
      const used = s.long.filter((x) => x.accepted && x.material === lc.material).reduce((a, x) => a + x.rate, 0);
      if (used + lc.rate <= s.market.prodRate[lc.material] * 0.6) {
        lc.accepted = true;
      }
    }
  }

  // Contrats long terme : prélèvement continu
  for (let k = s.long.length - 1; k >= 0; k--) {
    const lc = s.long[k];
    if (!lc.accepted) continue;
    lc.acc += lc.rate * dt;
    const n = Math.floor(lc.acc);
    if (n > 0) {
      const take = Math.min(n, s.stock[lc.material]);
      s.stock[lc.material] -= take;
      lc.acc -= take;
      revenue += take * lc.price;
      raw += take * MATERIALS[lc.material].raw;
      base += take * MATERIALS[lc.material].price;
      if (take < n) {
        lc.short += dt;
        lc.acc = Math.min(lc.acc, lc.rate * 2 + 1);
      } else lc.short = Math.max(0, lc.short - dt);
    }
    if (lc.short > CONTRACTS.longGrace) {
      s.long.splice(k, 1);
      s.reputation = clamp(s.reputation + CONTRACTS.repLongBreak, 0, REPUTATION.max);
      emit(s, { type: 'longBroken', id: lc.id });
    }
  }

  // Contrats ponctuels : réservation, livraison (logistique), échéance
  for (let m = 0; m < s.reserved.length; m++) s.reserved[m] = 0;
  for (let k = s.spot.length - 1; k >= 0; k--) {
    const sc = s.spot[k];
    if (!sc.accepted) continue;
    sc.quota = Math.min(sc.qty, (sc.quota ?? sc.delivered) + CONTRACTS.spotShare * Math.max(s.market.prodRate[sc.material], 0.01) * dt);
    if (s.roles.logistics) {
      const d = Math.min(s.stock[sc.material], spotRoom(sc));
      if (d > 0) {
        s.stock[sc.material] -= d;
        sc.delivered += d;
      }
    }
    if (sc.delivered >= sc.qty) {
      const value = sc.qty * sc.price;
      // le client fait partie du marché : sa commande remplace des ventes, seule la prime est en plus
      s.market.acc -= sc.qty * MATERIALS[sc.material].price;
      revenue += value;
      raw += sc.qty * MATERIALS[sc.material].raw;
      // la part de marché a déjà compté ces pièces au fil de leur mise de côté
      base += Math.max(0, sc.qty - sc.counted) * MATERIALS[sc.material].price;
      s.reputation = clamp(s.reputation + CONTRACTS.repSpotOk, 0, REPUTATION.max);
      s.stats.contractsDone++;
      s.spot.splice(k, 1);
      emit(s, { type: 'spotDone', id: sc.id, value, level: sc.level ?? 0, late: s.t > sc.deadline });
      continue;
    }
    if (s.t > sc.deadline) {
      s.spot.splice(k, 1);
      s.stats.contractsFailed++;
      // les pièces déjà livrées sont payées au prix normal : on ne perd que la prime
      if (sc.delivered > 0) {
        s.market.acc -= sc.delivered * MATERIALS[sc.material].price;
        revenue += sc.delivered * MATERIALS[sc.material].price * mult;
        raw += sc.delivered * MATERIALS[sc.material].raw;
      }
      // acte I : on perd seulement la prime ; la réputation compte à partir de l'acte II
      if (s.act >= CONTRACTS.act) s.reputation = clamp(s.reputation + CONTRACTS.repSpotFail, 0, REPUTATION.max);
      emit(s, { type: 'spotFailed', id: sc.id });
      continue;
    }
    s.reserved[sc.material] += spotRoom(sc);
  }
  for (let m = 0; m < s.reserved.length; m++) s.reserved[m] = Math.min(s.reserved[m], s.stock[m]);
  // Part de marché : une pièce mise de côté pour un client est une pièce vendue à ce client.
  const avail = s.stock.slice();
  const accepted = s.spot.filter((c) => c.accepted).sort((a, b) => a.deadline - b.deadline);
  for (const sc of accepted) {
    const alloc = Math.min(spotRoom(sc), Math.max(0, avail[sc.material]));
    avail[sc.material] -= alloc;
    const committed = sc.delivered + alloc;
    if (committed > sc.counted) {
      base += (committed - sc.counted) * MATERIALS[sc.material].price;
      sc.counted = committed;
    }
  }
  s.money += revenue - raw;
  return { revenue, raw, base };
}

// ---------------------------------------------------------------- Moral

function morale(s: GameState, dt: number): void {
  if (!moraleActive(s)) return;
  const cap = moraleCap(s);
  const rec = (s.canteen > 0 ? MORALE.canteenRecovery : 1) * (s.roles.hr ? MORALE.hrRecovery : 1);
  // bons camarades : leur chaîne (ou toute l'usine pour un polyvalent)
  const mates = new Set<string>();
  for (const w of s.workers) if (w.trait === 'mate' && w.state !== 'train') mates.add(w.kind === 'poly' ? `${w.factory}` : `${w.factory}:${w.line}`);
  for (const w of s.workers) {
    const mate = mates.size > 0 && (mates.has(`${w.factory}`) || mates.has(`${w.factory}:${w.line}`));
    if (w.load > MORALE.highLoad) w.morale -= (MORALE.dropPerMin / 60) * dt * trait(w).fatigue * (mate ? MATE.drop : 1);
    else if (w.load < MORALE.lowLoad) w.morale += (MORALE.risePerMin / 60) * dt * rec * (mate ? MATE.recovery : 1);
    w.morale = clamp(w.morale, 0, cap);
  }
}

// ---------------------------------------------------------- Défi du bac à sable

function challenge(s: GameState): void {
  const ch = s.challenge;
  if (!ch || ch.state !== 'on') return;
  const def = CHALLENGES.find((c) => c.id === ch.id);
  if (!def) return;
  const won = (def.produced === undefined || s.stats.produced - ch.p0 >= def.produced) && (def.cash === undefined || s.money >= def.cash);
  if (won) {
    ch.state = 'won';
    s.milestones[`challenge-${ch.id}`] = true;
    emit(s, { type: 'challenge', id: ch.id, won: true });
  } else if (def.time !== undefined && s.t - ch.t0 > def.time) {
    ch.state = 'lost';
    emit(s, { type: 'challenge', id: ch.id, won: false });
  }
}

// ---------------------------------------------------------- Objectif d'acte

function goal(s: GameState, dt: number): void {
  const g = ACTS[s.act].goal;
  const mk = s.market;
  if (g.kind === 'share') {
    if (mk.goalReached) return;
    if (mk.shareEma >= g.share) mk.goalT += dt;
    else mk.goalT = 0;
    if (mk.goalT >= g.hold) {
      mk.goalReached = true;
      emit(s, { type: 'goal' });
    }
  } else if (g.kind === 'cash') {
    const ok = s.money >= g.amount;
    if (ok && !mk.goalReached) emit(s, { type: 'goal' });
    mk.goalReached = ok;
  }
}

// ---------------------------------------------------------- Ferrum et crises

function ferrum(s: GameState): void {
  if (s.act < 1 || s.act > 4) return;
  const ev: ('poach' | 'war' | 'exclusive')[] = ['poach', 'war', 'exclusive'];
  FERRUM.thresholds.forEach((th, k) => {
    if (s.market.ferrumDone[k] || s.market.shareEma < th) return;
    if (k === 2 && s.act < CONTRACTS.act) return;
    s.market.ferrumDone[k] = true;
    s.crisis.queue.push(ev[k]);
  });
}

function crisis(s: GameState): void {
  const cr = s.crisis;
  if (cr.active && s.t >= cr.until) cr.active = null;
  if (cr.active || !cr.queue.length) return;
  const id = cr.queue.shift()!;
  cr.active = id;
  cr.until = s.t + CRISIS_GAP;
  if (id === 'poach') {
    const pool = s.workers.filter((w) => w.name !== 'Marcel' && w.state !== 'train');
    let name: string | undefined;
    if (pool.length) {
      const w = pool[randInt(s, pool.length)];
      name = w.name;
      releaseWorker(s, w);
      s.workers.splice(s.workers.indexOf(w), 1);
    }
    if (moraleActive(s)) for (const w of s.workers) w.morale = Math.max(0, w.morale - FERRUM.poachMorale);
    emit(s, { type: 'ferrum', event: 'poach', name });
  } else if (id === 'war') {
    s.market.priceWar = FERRUM.priceWar.duration;
    cr.until = s.t + Math.max(CRISIS_GAP, FERRUM.priceWar.duration);
    emit(s, { type: 'ferrum', event: 'war' });
  } else if (id === 'exclusive') {
    const k = s.long.findIndex((x) => x.accepted);
    if (k >= 0) s.long.splice(k, 1);
    else s.long = s.long.filter((x) => x.accepted);
    emit(s, { type: 'ferrum', event: 'exclusive' });
  }
}

// ---------------------------------------------------------------- Historique

function history(s: GameState, dt: number, produced: number, soldBase: number, _money0: number): void {
  const h = s.history;
  if (!h.acc.length) h.acc = new Array(HIST_LEN).fill(0);
  const e = s.energy;
  let morale = 0;
  for (const w of s.workers) morale += w.morale;
  morale = s.workers.length ? morale / s.workers.length : 0;
  let busy = 0;
  let units = 0;
  for (const fa of s.factories) for (const { m: u } of machines(fa)) {
    if (u.tier === 0) continue;
    units++;
    busy += u.busyT / dt;
  }
  const f = s.flow;
  const sample = [
    0, produced / dt, soldBase / dt, f.revenue + f.contracts, f.energy, f.salaries, s.stock.reduce((a, b) => a + b, 0),
    s.money, s.market.shareEma, e.solarKw, e.windKw, e.batteryKw, e.gridKw, e.shortKw, f.raw, f.maintenance, morale,
    units ? 1 - busy / units : 0, f.contracts,
  ];
  for (let i = 1; i < HIST_LEN; i++) h.acc[i] += sample[i] * dt;
  h.accT += dt;
  if (h.accT >= 5) {
    const p = h.acc.map((v) => v / h.accT);
    p[HIST.t] = s.t;
    p[HIST.stock] = sample[HIST.stock];
    p[HIST.money] = s.money;
    h.h5.push(p.map((v) => Math.round(v * 1000) / 1000));
    if (h.h5.length > 180) h.h5.shift();
    if (!h.acc60.length) h.acc60 = new Array(HIST_LEN).fill(0);
    for (let i = 1; i < HIST_LEN; i++) h.acc60[i] += p[i] * h.accT;
    h.acc60T += h.accT;
    if (h.acc60T >= 60) {
      const q = h.acc60.map((v) => v / h.acc60T);
      q[HIST.t] = s.t;
      q[HIST.stock] = p[HIST.stock];
      q[HIST.money] = s.money;
      h.h60.push(q.map((v) => Math.round(v * 1000) / 1000));
      if (h.h60.length > 240) h.h60.shift();
      h.acc60 = new Array(HIST_LEN).fill(0);
      h.acc60T = 0;
    }
    h.acc = new Array(HIST_LEN).fill(0);
    h.accT = 0;
  }
}

