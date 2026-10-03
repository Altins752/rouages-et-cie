import { describe, expect, it } from 'vitest';
import { TRAITS, TRAINING } from '../data/balance';
import * as A from './actions';
import { advance } from './engine';
import { skill, trainingCost } from './formulas';
import { createGame, rollTrait } from './state';
import type { GameState } from './types';

function act2(seed = 3): GameState {
  const s = createGame(seed);
  s.act = 2;
  s.debt = 0;
  s.research.tier = 2;
  s.money = 1e6;
  return s;
}

describe('caractère des ouvriers', () => {
  it('est tiré à l’embauche, de façon déterministe, selon les poids', () => {
    const draw = () => {
      const s = act2(17);
      for (let k = 0; k < 40; k++) {
        A.addUnit(s, 0, k % 4);
        A.hire(s, 0);
        A.hirePoly(s, 0);
      }
      return s.workers.map((w) => w.trait).join(',');
    };
    expect(draw()).toBe(draw());
    const s = act2(17);
    const n: Record<string, number> = {};
    for (let k = 0; k < 2000; k++) {
      const t = rollTrait(s);
      n[t] = (n[t] ?? 0) + 1;
    }
    const total = TRAITS.reduce((x, t) => x + t.weight, 0);
    for (const t of TRAITS) expect(Math.abs((n[t.id] ?? 0) / 2000 - t.weight / total)).toBeLessThan(0.04);
  });

  it('rapide : plus de cadence ; doué : formations moins chères', () => {
    const s = act2();
    A.hire(s, 0);
    const w = s.workers[1];
    w.trait = '';
    const base = skill(w);
    const cost = trainingCost(s, w);
    w.trait = 'fast';
    expect(skill(w)).toBeCloseTo(base * 1.15, 6);
    w.trait = 'gifted';
    expect(trainingCost(s, w)).toBeLessThan(cost);
    expect(TRAINING.perTraining).toBeGreaterThan(0);
  });

  it('soigneux : sa machine s’use moins', () => {
    const wear = (trait: '' | 'careful') => {
      const s = act2(5);
      for (let i = 0; i < 4; i++) A.hire(s, 0);
      A.modernize(s, 0, 1);
      const w = s.workers.find((x) => x.station === 1)!;
      w.level = 2;
      for (const x of s.workers) x.trait = '';
      w.trait = trait;
      advance(s, 600, { red: false }, 0.25);
      return s.factories[0].lines[0].slots[1]!.wear;
    };
    expect(wear('careful') / wear('')).toBeCloseTo(0.7, 1);
  });

  it('bon camarade : sa chaîne garde le moral', () => {
    const run = (mate: boolean) => {
      const s = act2(5);
      A.modernize(s, 0, 1);
      A.addUnit(s, 0, 0);
      A.addUnit(s, 0, 2);
      for (let i = 0; i < 6; i++) A.hire(s, 0);
      for (const w of s.workers) {
        w.trait = '';
        if (w.station === 1) w.level = 2;
      }
      if (mate) s.workers.find((w) => w.line === 0 && w.station === 0)!.trait = 'mate';
      advance(s, 2400, { red: false }, 0.25);
      return s.workers.find((w) => w.line === 0 && w.station === 1)!.morale;
    };
    expect(run(true)).toBeGreaterThan(run(false) + 0.05);
  });
});
