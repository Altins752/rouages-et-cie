/**
 * Moteur de jeu pur : aucun accès au DOM, au canvas ni à l'audio.
 * Déterministe (aléa à graine dans l'état), avance par pas de temps de jeu.
 * Le moteur reste juste quelle que soit la taille du pas : chaque ouvrier et
 * chaque machine consomment un budget de temps et enchaînent les pièces.
 */
import {
  ACTS, BUFFER_CAP, CONTRACTS, CRISIS_GAP, ENERGY, FERRUM, MATERIALS, MORALE, PROLOGUE, ROBOT_NO_TECH_FACTOR,
  ROBOT_TIER, BLACK_TIER, ROLES, TIER_KW, TIER_OPERATOR_LEVEL, WALK_TIME, WEAR, WORKER_SALARY, DOOR_POS,
  REPUTATION, ASSIGN,
} from '../data/balance';
import { daylight, windFactor } from './env';
import {
  clamp, knowHow, moraleActive, moraleCap, moraleFactor, priceMult, scrapRate, specBonus, stationCycle, trainCost, trainTime,
  unitPrice,
} from './formulas';
import { rand, randInt, randRange } from './rng';
import type { Chain, GameState, SimEvent, Worker } from './types';

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

export function step(s: GameState, dt: number, input: StepInput): void {
  s.t += dt;
  s.actT += dt;
  s.stats.playTime += dt;
  const money0 = s.money;
  const flow = { revenue: 0, raw: 0, salaries: 0, energy: 0, maintenance: 0, contracts: 0 };
  let soldBase = 0;
  let produced = 0;

  timers(s, dt);
  if (s.roles.foreman && crossed(s.t, dt, 5)) for (let i = 0; i < s.chains.length; i++) assignHomes(s, i);
  if (s.roles.hr && crossed(s.t, dt, 5)) hrDecisions(s);

  // Production
  const prodByMat = MATERIALS.map(() => 0);
  for (const c of s.chains) for (const st of c.stations) for (const u of st.units) u.busyT = 0;
  for (let ci = 0; ci < s.chains.length; ci++) {
    const c = s.chains[ci];
    const before = c.produced;
    robots(s, c, ci, dt, input.red);
    prodByMat[c.material] += c.produced - before;
  }
  for (const w of s.workers) {
    if (w.state === 'train') continue;
    const c = s.chains[w.chain];
    if (!c) continue;
    const before = c.produced;
    workerStep(s, w, c, dt, input.red);
    prodByMat[c.material] += c.produced - before;
  }
  for (let m = 0; m < prodByMat.length; m++) produced += prodByMat[m];

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
  for (const w of s.workers) sal += WORKER_SALARY[w.level];
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
      w.level = w.trainTo;
      w.state = 'idle';
      w.timer = 0;
      w.pos = DOOR_POS;
      w.from = DOOR_POS;
      if (w.level === 4) s.stats.retrained++;
      emit(s, { type: 'trained', worker: w.id, level: w.level });
    }
  }
  for (let ci = 0; ci < s.chains.length; ci++) {
    const c = s.chains[ci];
    if (c.matChange > 0) c.matChange = Math.max(0, c.matChange - dt);
    c.stations.forEach((st, si) =>
      st.units.forEach((u, ui) => {
        if (u.service <= 0) return;
        u.service -= dt;
        if (u.service <= 0) {
          u.service = 0;
          const wasRepair = u.serviceKind === 'repair';
          u.serviceKind = 'none';
          u.broken = false;
          u.wear = 0;
          if (wasRepair) emit(s, { type: 'repaired', chain: ci, station: si, unit: ui });
        }
      }),
    );
  }
  if (s.market.priceWar > 0) {
    s.market.priceWar -= dt;
    if (s.market.priceWar <= 0) {
      s.market.priceWar = 0;
      emit(s, { type: 'warEnd' });
    }
  }
}

// ------------------------------------------------------------------ Ouvriers

function techPresent(s: GameState, ci: number): boolean {
  for (const w of s.workers) if (w.chain === ci && w.level >= 4 && w.state !== 'train') return true;
  return false;
}

function robots(s: GameState, c: Chain, ci: number, dt: number, red: boolean): void {
  let tech: boolean | null = null;
  for (let si = 3; si >= 0; si--) {
    const st = c.stations[si];
    if (st.tier < ROBOT_TIER) continue;
    if (tech === null) tech = techPresent(s, ci);
    const cyc = stationCycle(s, c, st, si);
    const rate = (st.tier >= BLACK_TIER || tech ? 1 : ROBOT_NO_TECH_FACTOR) * s.energy.factor;
    for (let ui = 0; ui < st.units.length; ui++) {
      const u = st.units[ui];
      if (u.broken || u.service > 0) continue;
      let budget = dt;
      let guard = 0;
      while (budget > 1e-9 && guard++ < 400) {
        if (!u.busy) {
          if (si > 0 && c.buf[si] <= 0) break;
          if (si < 3 && c.buf[si + 1] + inProgress(st) >= BUFFER_CAP) break;
          if (si > 0) c.buf[si]--;
          u.busy = true;
          u.prog = 0;
        }
        const need = (cyc - u.prog) / rate;
        const d = Math.min(budget, need);
        u.prog += d * rate;
        u.busyT += d;
        budget -= d;
        if (u.prog >= cyc - 1e-9) {
          u.busy = false;
          u.prog = 0;
          complete(s, c, ci, si, ui, red);
        }
      }
    }
  }
}

function complete(s: GameState, c: Chain, ci: number, si: number, ui: number, red: boolean): void {
  if (si < 3) {
    c.buf[si + 1]++;
  } else if (rand(s) < scrapRate(c, red)) {
    c.scrapped++;
    s.stats.scrapped++;
    s.money -= MATERIALS[c.material].raw;
    emit(s, { type: 'scrap', chain: ci });
    return;
  } else {
    s.stock[c.material]++;
    c.produced++;
    s.stats.produced++;
  }
  emit(s, { type: 'piece', chain: ci, station: si, unit: ui });
}

interface Job { s: number; i: number }

function inProgress(st: { units: { busy: boolean; worker: number }[] }): number {
  let n = 0;
  for (const u of st.units) if (u.busy || u.worker >= 0) n++;
  return n;
}

/** Un collègue qualifié attend-il déjà, debout à ce poste ? */
function idleAt(s: GameState, ci: number, si: number, req: number, except: Worker): boolean {
  for (const o of s.workers) {
    if (o !== except && o.chain === ci && o.state === 'idle' && o.rest <= 0 && o.level >= req && Math.abs(o.pos - si) < 0.01) return true;
  }
  return false;
}

function pickJob(s: GameState, c: Chain, ci: number, w: Worker): Job | null {
  if (w.rest > 0) return null;
  let best: Job | null = null;
  let bs = -1e9;
  for (let si = 3; si >= 0; si--) {
    const st = c.stations[si];
    if (st.tier >= ROBOT_TIER) continue;
    if (w.level < TIER_OPERATOR_LEVEL[st.tier]) continue;
    if (si > 0 && c.buf[si] <= 0) continue;
    if (si < 3 && c.buf[si + 1] + inProgress(st) >= BUFFER_CAP) continue;
    let ui = -1;
    for (let k = 0; k < st.units.length; k++) {
      const u = st.units[k];
      if (!u.broken && u.service <= 0 && !u.busy && u.worker < 0) {
        ui = k;
        break;
      }
    }
    if (ui < 0) continue;
    // Inutile de traverser l'atelier : un collègue sur place prendra la pièce.
    if (Math.abs(w.pos - si) > 0.01 && idleAt(s, ci, si, TIER_OPERATOR_LEVEL[st.tier], w)) continue;
    let sc = si * ASSIGN.downstream + (w.last === si ? ASSIGN.stay : 0) - Math.abs(w.pos - si) * ASSIGN.walk;
    if (si === 0 && c.buf[1] >= BUFFER_CAP - 1) sc -= ASSIGN.feedPenalty;
    if (w.home >= 0) sc += w.home === si ? ASSIGN.home : -ASSIGN.notHome;
    if (sc > bs) {
      bs = sc;
      best = { s: si, i: ui };
    }
  }
  return best;
}

function release(c: Chain, w: Worker): void {
  if (w.ts >= 0) {
    const u = c.stations[w.ts]?.units[w.tu];
    if (u && u.worker === w.id) {
      u.worker = -1;
      u.busy = false;
      u.prog = 0;
    }
    if (w.ts > 0) c.buf[w.ts]++;
  }
  w.ts = -1;
  w.tu = -1;
  w.state = 'idle';
  w.timer = 0;
}

/** Libère un ouvrier de sa tâche en rendant la pièce à la pile. */
export function releaseWorker(s: GameState, w: Worker): void {
  const c = s.chains[w.chain];
  if (c && (w.state === 'walk' || w.state === 'work')) {
    // position courante pour le rendu
    if (w.state === 'walk' && w.walkTotal > 0) w.pos = w.ts - (w.ts - w.from) * (w.timer / w.walkTotal);
    release(c, w);
  }
}

function workerStep(s: GameState, w: Worker, c: Chain, dt: number, red: boolean): void {
  let budget = dt;
  let idle = 0;
  let guard = 0;
  // Un ouvrier qui vient de finir reprend une tâche tout de suite, même sans temps restant :
  // sinon un autre ouvrier traité après lui pourrait lui prendre son poste.
  while (guard++ < 24) {
    if (w.state === 'idle') {
      const job = pickJob(s, c, w.chain, w);
      if (!job) {
        idle = budget;
        break;
      }
      const u = c.stations[job.s].units[job.i];
      u.worker = w.id;
      if (job.s > 0) c.buf[job.s]--;
      w.ts = job.s;
      w.tu = job.i;
      w.from = w.pos;
      w.walkTotal = Math.abs(w.pos - job.s) * WALK_TIME;
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
      const u = c.stations[w.ts].units[w.tu];
      if (!u || u.broken || u.service > 0) {
        release(c, w);
        continue;
      }
      u.busy = true;
      u.prog = 0;
      w.state = 'work';
    }
    if (w.state === 'work') {
      const st = c.stations[w.ts];
      const u = st?.units[w.tu];
      if (!u || u.broken || u.service > 0 || u.worker !== w.id) {
        release(c, w);
        continue;
      }
      const cyc = stationCycle(s, c, st, w.ts);
      const rate = (1 + specBonus(w, w.ts)) * moraleFactor(s, w) * (st.tier > 0 ? s.energy.factor : 1);
      const need = (cyc - u.prog) / rate;
      const d = Math.min(budget, need);
      u.prog += d * rate;
      u.busyT += d;
      budget -= d;
      w.spec[w.ts] += d;
      if (u.prog >= cyc - 1e-9) {
        const si = w.ts;
        const ui = w.tu;
        u.busy = false;
        u.prog = 0;
        u.worker = -1;
        w.last = si;
        w.ts = -1;
        w.tu = -1;
        w.state = 'idle';
        complete(s, c, s.chains.indexOf(c), si, ui, red);
        // Relève : surchargé, il laisse la place à un collègue libre et souffle un moment.
        if (moraleActive(s) && w.load > MORALE.highLoad && w.morale < MORALE.tired && reliefAvailable(s, c, w, st.tier)) {
          w.rest = MORALE.restTime;
          idle = budget;
          break;
        }
      }
    }
  }
  const occ = (dt - idle) / dt;
  w.load += (occ - w.load) * (1 - Math.exp(-dt / MORALE.loadTau));
}

function reliefAvailable(s: GameState, c: Chain, w: Worker, tier: number): boolean {
  const ci = s.chains.indexOf(c);
  const req = TIER_OPERATOR_LEVEL[tier];
  for (const o of s.workers) {
    if (o !== w && o.chain === ci && o.state === 'idle' && o.rest <= 0 && o.level >= req) return true;
  }
  return false;
}

/** Postes attitrés par le contremaître : répartit les ouvriers selon la charge de chaque poste. */
export function assignHomes(s: GameState, ci: number): void {
  const c = s.chains[ci];
  const ws = s.workers.filter((w) => w.chain === ci && w.state !== 'train').sort((a, b) => a.level - b.level || a.id - b.id);
  for (const w of ws) w.home = -1;
  const need = c.stations.map((st) => (st.tier < ROBOT_TIER ? st.units.length : 0));
  const req = c.stations.map((st) => TIER_OPERATOR_LEVEL[st.tier]);
  const cyc = c.stations.map((st, si) => stationCycle(s, c, st, si));
  const ops = [0, 0, 0, 0];
  const free = [...ws];
  const take = (si: number): boolean => {
    const k = free.findIndex((w) => w.level >= req[si]);
    if (k < 0) return false;
    free[k].home = si;
    free.splice(k, 1);
    ops[si]++;
    return true;
  };
  // D'abord les postes les plus exigeants, un ouvrier chacun.
  const order = [0, 1, 2, 3].filter((si) => need[si] > 0).sort((a, b) => req[b] - req[a] || cyc[b] - cyc[a]);
  for (const si of order) take(si);
  // Puis le poste le moins bien servi.
  let guard = 0;
  while (free.length && guard++ < 64) {
    let best = -1;
    let bv = Infinity;
    for (const si of order) {
      if (ops[si] >= need[si]) continue;
      if (!free.some((w) => w.level >= req[si])) continue;
      const v = ops[si] / cyc[si];
      if (v < bv) {
        bv = v;
        best = si;
      }
    }
    if (best < 0 || !take(best)) break;
  }
}

/**
 * Ressources humaines : forment un ouvrier quand une machine manque d'opérateur qualifié
 * (un technicien par chaîne robotisée), si la trésorerie le permet. Elles n'embauchent pas.
 */
function hrDecisions(s: GameState): void {
  for (let ci = 0; ci < s.chains.length; ci++) {
    const c = s.chains[ci];
    const ws = s.workers.filter((w) => w.chain === ci);
    const lv = (w: Worker) => (w.state === 'train' ? w.trainTo : w.level);
    const reqs: number[] = [];
    if (s.act >= 3 && c.stations.some((st) => st.tier === ROBOT_TIER)) reqs.push(4);
    reqs.push(3, 2);
    for (const req of reqs) {
      if (req === 3 && s.act < 2) continue;
      let need = 0;
      if (req === 4) need = 1;
      else for (const st of c.stations) if (st.tier < ROBOT_TIER && TIER_OPERATOR_LEVEL[st.tier] >= req) need += st.units.length;
      if (ws.filter((w) => lv(w) >= req).length >= need) continue;
      const pool = ws.filter((w) => w.state !== 'train' && w.level === req - 1);
      if (!pool.length) continue;
      const cost = trainCost(s, req);
      if (s.money < cost * 2) continue;
      const w = pool.find((x) => x.state === 'idle') ?? pool[pool.length - 1];
      s.money -= cost;
      releaseWorker(s, w);
      w.state = 'train';
      w.timer = trainTime(s, req);
      w.trainTo = req;
      w.home = -1;
      emit(s, { type: 'hrTrain', worker: w.id, level: req });
      break;
    }
  }
}

// ------------------------------------------------------- Usure et pannes

function wearAndBreakdowns(s: GameState, dt: number, red: boolean): number {
  let spent = 0;
  const kwear = (1 - knowHow(s, 'wear')) * (red ? WEAR.redZoneFactor : 1);
  for (let ci = 0; ci < s.chains.length; ci++) {
    const c = s.chains[ci];
    const k = MATERIALS[c.material].k;
    for (let si = 0; si < 4; si++) {
      const st = c.stations[si];
      if (st.tier === 0 && !WEAR.manualWears) continue;
      const mf = 1 + (k - 1) * [0.5, 1, 1, 0.3][si];
      for (let ui = 0; ui < st.units.length; ui++) {
        const u = st.units[ui];
        if (u.broken || u.service > 0) continue;
        const load = u.busyT + WEAR.idleFactor * Math.max(0, dt - u.busyT);
        u.wear = Math.min(1, u.wear + (load / WEAR.fullLoadTime) * mf * kwear);
        const price = unitPrice(st.tier, si, ui + 1);
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
          emit(s, { type: 'preventive', chain: ci, station: si, unit: ui });
          continue;
        }
        if (u.wear > WEAR.breakStart && u.busyT > 0) {
          const p = Math.pow((u.wear - WEAR.breakStart) / (1 - WEAR.breakStart), 2) * (WEAR.breakPerMin / 60) * dt;
          if (rand(s) < p) {
            u.broken = true;
            s.stats.breakdowns++;
            emit(s, { type: 'breakdown', chain: ci, station: si, unit: ui });
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
  }
  return spent;
}

// ---------------------------------------------------------------- Énergie

function energy(s: GameState, dt: number): number {
  const e = s.energy;
  const save = 1 - knowHow(s, 'energy');
  let demand = 0;
  for (const c of s.chains) {
    for (const st of c.stations) {
      if (st.tier === 0) continue;
      const kw = TIER_KW[st.tier] * save;
      for (const u of st.units) {
        if (u.broken || u.service > 0) continue;
        demand += kw * (u.busyT + ENERGY.idleShare * Math.max(0, dt - u.busyT));
      }
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

function producible(s: GameState): number[] {
  const set = new Set<number>();
  for (const c of s.chains) set.add(c.material);
  return [...set];
}

function contracts(s: GameState, dt: number): { revenue: number; raw: number; base: number } {
  let revenue = 0;
  let raw = 0;
  let base = 0;
  const act = ACTS[s.act];
  if (s.act < CONTRACTS.act) return { revenue, raw, base };
  const mult = priceMult(s);
  const mats = producible(s);

  // Nouvelles offres
  if (s.t >= s.nextSpot) {
    s.nextSpot = s.t + CONTRACTS.spotRefresh * randRange(s, 0.7, 1.3);
    const offers = s.spot.filter((c) => !c.accepted);
    if (offers.length >= CONTRACTS.spotOffers) s.spot.splice(s.spot.indexOf(offers[0]), 1);
    const m = mats[randInt(s, mats.length)];
    const p = MATERIALS[m].price;
    const secs = randRange(s, CONTRACTS.spotSize[0], CONTRACTS.spotSize[1]);
    const qty = Math.max(10, Math.round((act.market * 0.5 * secs) / p / 5) * 5);
    s.spot.push({
      id: s.nextId++, material: m, qty, delivered: 0,
      price: p * randRange(s, CONTRACTS.spotPrice[0], CONTRACTS.spotPrice[1]) * mult,
      deadline: 0, duration: Math.round(randRange(s, CONTRACTS.spotDeadline[0], CONTRACTS.spotDeadline[1]) / 10) * 10,
      accepted: false, counted: 0,
    });
  }
  if (s.t >= s.nextLong) {
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
    if (s.roles.logistics) {
      const d = Math.min(s.stock[sc.material], sc.qty - sc.delivered);
      if (d > 0) {
        s.stock[sc.material] -= d;
        sc.delivered += d;
      }
    }
    if (sc.delivered >= sc.qty) {
      const value = sc.qty * sc.price;
      revenue += value;
      raw += sc.qty * MATERIALS[sc.material].raw;
      // la part de marché a déjà compté ces pièces au fil de leur mise de côté
      base += Math.max(0, sc.qty - sc.counted) * MATERIALS[sc.material].price;
      s.reputation = clamp(s.reputation + CONTRACTS.repSpotOk, 0, REPUTATION.max);
      s.stats.contractsDone++;
      s.spot.splice(k, 1);
      emit(s, { type: 'spotDone', id: sc.id, value });
      continue;
    }
    if (s.t > sc.deadline) {
      s.spot.splice(k, 1);
      s.reputation = clamp(s.reputation + CONTRACTS.repSpotFail, 0, REPUTATION.max);
      emit(s, { type: 'spotFailed', id: sc.id });
      continue;
    }
    s.reserved[sc.material] += sc.qty - sc.delivered;
  }
  for (let m = 0; m < s.reserved.length; m++) s.reserved[m] = Math.min(s.reserved[m], s.stock[m]);
  // Part de marché : une pièce mise de côté pour un client est une pièce vendue à ce client.
  const avail = s.stock.slice();
  const accepted = s.spot.filter((c) => c.accepted).sort((a, b) => a.deadline - b.deadline);
  for (const sc of accepted) {
    const alloc = Math.min(sc.qty - sc.delivered, Math.max(0, avail[sc.material]));
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
  for (const w of s.workers) {
    if (w.load > MORALE.highLoad) w.morale -= (MORALE.dropPerMin / 60) * dt;
    else if (w.load < MORALE.lowLoad) w.morale += (MORALE.risePerMin / 60) * dt * rec;
    w.morale = clamp(w.morale, 0, cap);
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
  for (const c of s.chains) for (const st of c.stations) if (st.tier > 0) for (const u of st.units) {
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

// ------------------------------------------------- Débauchage par Ferrum (test)

/** Utilisé par les tests et l'IA : nombre d'ouvriers d'une chaîne. */
export function chainWorkers(s: GameState, ci: number): Worker[] {
  return s.workers.filter((w) => w.chain === ci);
}

