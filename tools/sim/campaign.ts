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
import { candidates } from '../../src/sim/advisor';
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
  done: boolean;
}

const REAL_DT = 0.25;
const ACT_LIMIT = 8 * 3600; // s réelles avant de déclarer un acte bloqué

function affordable(s: GameState): boolean {
  if (s.act === 0 && s.money > 1) return true; // remboursement partiel
  if (A.canMove(s) || A.canBuyout(s)) return true;
  for (const c of candidates(s)) if (c.kind !== 'hire' && c.cost <= s.money) return true;
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
  let logged = 0;
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
      if (ai.log.slice(before).some((l) => l.cost > 0) && firstBuy < 0) firstBuy = real - actStartReal;
      if (affordable(s)) lastAffordable = real;
      maxWait = Math.max(maxWait, real - lastAffordable);
    }
    if (verbose && ai.log.length > logged) {
      for (const l of ai.log.slice(logged)) {
        console.log(`  ${(real / 60).toFixed(1).padStart(6)} min  ${actName(l.act).padEnd(9)} ${l.what.padEnd(28)} ${l.cost ? Math.round(l.cost) + ' €' : ''}   caisse ${Math.round(s.money)}`);
      }
      logged = ai.log.length;
    }
    if (s.act !== act || s.ended) {
      acts.push({ act, real: real - actStartReal, game: s.t - actStartGame, firstBuy, maxWait, done: true });
      act = s.act;
      actStartReal = real;
      actStartGame = s.t;
      firstBuy = -1;
      maxWait = 0;
      lastAffordable = real;
    }
    if (real - actStartReal > ACT_LIMIT) {
      acts.push({ act, real: real - actStartReal, game: s.t - actStartGame, firstBuy, maxWait, done: false });
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
    console.log('  Étape        réel (min)   jeu (min)   1er achat (s)   attente max (s)');
    for (const a of r.acts) {
      console.log(
        `  ${actName(a.act).padEnd(11)} ${mm(a.real).padStart(9)} ${mm(a.game).padStart(11)} ${String(Math.round(a.firstBuy)).padStart(14)} ${String(Math.round(a.maxWait)).padStart(16)}  ${a.done ? '' : 'BLOQUÉ'}`,
      );
    }
    const blocked = r.acts.some((a) => !a.done);
    console.log(`  Total ${blocked ? 'BLOQUÉ' : ''} ${mm(r.total)} min réelles (${(r.total / 3600).toFixed(2)} h)  · fin : ${r.s.ending ?? '—'} · savoir-faire gagné ${r.s.stats.knowHowEarned}`);
    out[p.id] = { acts: r.acts.map((a) => ({ act: a.act, realMin: +mm(a.real), gameMin: +mm(a.game), firstBuy: Math.round(a.firstBuy), maxWait: Math.round(a.maxWait), done: a.done })), totalH: +(r.total / 3600).toFixed(2) };
    if (blocked) okAll = false;
    if (p.id === 'actif') {
      const pro = r.acts[0];
      const checks = [
        ['histoire complète entre 5 et 6 h', r.total >= 5 * 3600 && r.total <= 6 * 3600],
        ['prologue entre 5 et 10 min', pro && pro.real >= 300 && pro.real <= 600],
        ['premier achat avant 60 s', pro && pro.firstBuy >= 0 && pro.firstBuy <= 60],
        ['jamais plus de 3 min sans achat possible', r.acts.every((a) => a.maxWait <= 180)],
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
