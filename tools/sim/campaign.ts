/**
 * Campagne complète simulée sur le vrai moteur (src/sim), 3 profils de joueur.
 *   npm run sim                 → les 3 profils
 *   npm run sim -- actif        → un seul profil
 *   npm run sim -- actif -v     → avec le journal des achats
 * Le temps réel est simulé : le compte-tours suit le modèle du jeu (balance.ts, TACHO).
 */
import { writeFileSync } from 'node:fs';
import { ACTS, MATERIALS, TACHO } from '../../src/data/balance';
import { aiStep, actName, newAi } from '../../src/sim/ai';
import { candidates, firstStepCost } from '../../src/sim/advisor';
import * as A from '../../src/sim/actions';
import { step } from '../../src/sim/engine';
import { createGame } from '../../src/sim/state';
import { storyTick } from '../../src/story/director';
import type { GameState } from '../../src/sim/types';

interface Profile {
  id: string;
  name: string;
  /** Part du temps passée à maintenir le clic (zone verte). */
  hold: number;
  /** Mitraille en zone rouge en permanence. */
  red: boolean;
  /** Délai de réaction entre deux décisions (s réelles). */
  think: number;
}

export const PROFILES: Profile[] = [
  { id: 'calme', name: 'Calme (sans clic)', hold: 0, red: false, think: 15 },
  { id: 'actif', name: 'Actif (zone verte)', hold: 0.5, red: false, think: 8 },
  { id: 'rouge', name: 'Gros cliqueur (zone rouge)', hold: 0, red: true, think: 6 },
];

interface ActResult {
  act: number;
  real: number;
  game: number;
  firstBuy: number;
  maxWait: number;
  /** Plus longue attente sans achat rentabilisé en moins de 5 min. */
  maxDry: number;
  /** Achats par tranche de 10 minutes réelles. */
  buysPer10: number;
  done: boolean;
}

const REAL_DT = 0.25;
const ACT_LIMIT = 8 * 3600; // s réelles avant de déclarer un acte bloqué

/** Payback maximal (s de jeu) pour qu'un achat compte comme « utile » : 5 min réelles à la vitesse moyenne du joueur actif (×2,5). */
const USEFUL_PAYBACK = 750;

/**
 * Un achat est-il possible maintenant ? « any » : n'importe quel achat qui augmente les recettes,
 * même de peu (critère) ; sinon seulement ceux rentabilisés en moins de 5 min réelles (information).
 */
function affordable(s: GameState, any = false): boolean {
  if (s.act === 0 && s.money >= s.debt) return true;
  if (A.canMove(s) || A.canBuyout(s)) return true;
  for (const c of candidates(s)) {
    if (c.kind === 'hire' || c.kind === 'poly' || c.kind === 'material') continue;
    if (firstStepCost(c) <= s.money && (any || c.payback <= USEFUL_PAYBACK)) return true;
  }
  for (const id of ['tier', 'workshop', 'preventive', 'predictive'] as const) {
    if (A.researchAvailable(s, id) && A.researchCost(s, id) <= s.money) return true;
  }
  for (let m = 1; m < MATERIALS.length; m++) {
    const id = `mat:${m}` as const;
    if (A.researchAvailable(s, id) && A.researchCost(s, id) <= s.money) return true;
  }
  return false;
}

export function runProfile(p: Profile, verbose = false, seed = 11): { acts: ActResult[]; total: number; s: GameState } {
  const s = createGame(seed);
  const ai = newAi();
  let rev = 0;
  let real = 0;
  let think = 0;
  let actStartReal = 0;
  let actStartGame = 0;
  let firstBuy = -1;
  let lastAffordable = 0;
  let maxWait = 0;
  let lastUseful = 0;
  let maxDry = 0;
  let logged = 0;
  let buys = 0;
  const acts: ActResult[] = [];
  let act = s.act;
  while (s.act <= 4 && !s.ended) {
    // Compte-tours (modèle du jeu, en temps réel)
    const holding = p.hold > 0 && (real % 40) < 40 * p.hold;
    if (p.red) rev = 0.9;
    else if (holding && rev < TACHO.holdTarget) rev = Math.min(TACHO.holdTarget, rev + REAL_DT * TACHO.holdRate);
    else if (!holding) rev = Math.max(0, rev - REAL_DT * (TACHO.decayBase + TACHO.decayQuad * rev * rev));
    const vmax = ACTS[s.act].vmax;
    const speed = 1 + rev * (vmax - 1);
    const red = rev > TACHO.redZone;
    let left = REAL_DT * speed;
    while (left > 1e-9) {
      const d = Math.min(0.25, left);
      step(s, d, { red });
      left -= d;
    }
    s.fx.length = 0;
    real += REAL_DT;
    think += REAL_DT;
    if (think >= p.think) {
      think = 0;
      const before = ai.log.length;
      storyTick(s);
      aiStep(ai, s);
      const bought = ai.log.slice(before).filter((l) => l.cost > 0).length;
      buys += bought;
      if (bought && firstBuy < 0) firstBuy = real - actStartReal;
      if (affordable(s)) {
        lastUseful = real;
        lastAffordable = real;
      } else if (affordable(s, true)) lastAffordable = real;
      maxWait = Math.max(maxWait, real - lastAffordable);
      maxDry = Math.max(maxDry, real - lastUseful);
    }
    if (verbose && ai.log.length > logged) {
      for (const l of ai.log.slice(logged)) {
        console.log(`  ${(real / 60).toFixed(1).padStart(6)} min  ${actName(l.act).padEnd(9)} ${l.what.padEnd(28)} ${l.cost ? Math.round(l.cost) + ' €' : ''}   caisse ${Math.round(s.money)}`);
      }
      logged = ai.log.length;
    }
    if (s.act !== act || s.ended) {
      acts.push({ act, real: real - actStartReal, game: s.t - actStartGame, firstBuy, maxWait, maxDry, buysPer10: buys / Math.max(1e-6, (real - actStartReal) / 600), done: true });
      buys = 0;
      act = s.act;
      actStartReal = real;
      actStartGame = s.t;
      firstBuy = -1;
      maxWait = 0;
      maxDry = 0;
      lastAffordable = real;
      lastUseful = real;
    }
    if (real - actStartReal > ACT_LIMIT) {
      acts.push({ act, real: real - actStartReal, game: s.t - actStartGame, firstBuy, maxWait, maxDry, buysPer10: buys / Math.max(1e-6, (real - actStartReal) / 600), done: false });
      break;
    }
  }
  return { acts, total: real, s };
}

const mm = (x: number) => (x / 60).toFixed(1);

function main(): void {
  const args = process.argv.slice(2);
  const verbose = args.includes('-v');
  const only = args.find((a) => !a.startsWith('-'));
  const seedArg = args.find((a) => a.startsWith('--seed='));
  const seed = seedArg ? +seedArg.slice(7) : 11;
  const profiles = only ? PROFILES.filter((p) => p.id === only) : PROFILES;
  const out: Record<string, unknown> = {};
  let okAll = true;
  for (const p of profiles) {
    const t0 = Date.now();
    const r = runProfile(p, verbose, seed);
    console.log(`\n${p.name}  (calcul ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    console.log('  Étape        réel (min)   jeu (min)   1er achat (s)   attente max (s)   sans achat < 5 min (s)   achats/10 min');
    for (const a of r.acts) {
      console.log(
        `  ${actName(a.act).padEnd(11)} ${mm(a.real).padStart(9)} ${mm(a.game).padStart(11)} ${String(Math.round(a.firstBuy)).padStart(14)} ${String(Math.round(a.maxWait)).padStart(16)} ${String(Math.round(a.maxDry)).padStart(24)} ${a.buysPer10.toFixed(1).padStart(15)}  ${a.done ? '' : 'BLOQUÉ'}`,
      );
    }
    const blocked = r.acts.some((a) => !a.done);
    console.log(`  Total ${blocked ? 'BLOQUÉ' : ''} ${mm(r.total)} min réelles (${(r.total / 3600).toFixed(2)} h)  · fin : ${r.s.ending ?? '—'} · savoir-faire gagné ${r.s.stats.knowHowEarned}`);
    out[p.id] = { acts: r.acts.map((a) => ({ act: a.act, realMin: +mm(a.real), gameMin: +mm(a.game), firstBuy: Math.round(a.firstBuy), maxWait: Math.round(a.maxWait), maxDry: Math.round(a.maxDry), buysPer10: +a.buysPer10.toFixed(1), done: a.done })), totalH: +(r.total / 3600).toFixed(2) };
    if (blocked) okAll = false;
    if (p.id === 'actif') {
      const pro = r.acts[0];
      const checks = [
        ['histoire complète entre 5 et 6 h', r.total >= 5 * 3600 && r.total <= 6 * 3600],
        ['prologue entre 5 et 10 min', pro && pro.real >= 300 && pro.real <= 600],
        ['premier achat avant 60 s', pro && pro.firstBuy >= 0 && pro.firstBuy <= 60],
        ['jamais plus de 3 min sans achat qui augmente les recettes', r.acts.every((a) => a.maxWait <= 180)],
        ['au moins 4 achats par 10 min dans chaque acte', r.acts.every((a) => a.buysPer10 >= 4)],
      ] as const;
      for (const [label, ok] of checks) {
        console.log(`  [${ok ? 'OK' : '!!'}] ${label}`);
        if (!ok) okAll = false;
      }
    }
  }
  if (!only) writeFileSync('tools/sim/last-run.json', JSON.stringify(out, null, 2));
  console.log(okAll ? '\nCritères d’acceptation : respectés' : '\nCritères d’acceptation : NON respectés');
}

main();
