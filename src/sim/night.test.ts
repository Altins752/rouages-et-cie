import { describe, expect, it } from 'vitest';
import { NIGHT } from '../data/balance';
import * as A from './actions';
import { advance } from './engine';
import { nightCost, nightDuration, nightRate } from './formulas';
import { catchUp } from './offline';
import { createGame } from './state';
import type { GameState } from './types';

function act2(seed = 4): GameState {
  const s = createGame(seed);
  s.act = 2;
  s.debt = 0;
  s.money = 1e7;
  for (let i = 0; i < 4; i++) A.hire(s, 0);
  advance(s, 120, { red: false }, 0.1);
  return s;
}

describe('équipe de nuit', () => {
  it('se recrute à l’acte II ; la durée suppose une équipe', () => {
    const s = createGame(1);
    s.act = 1;
    s.money = 1e6;
    expect(A.upgradeNight(s, 'rate').ok).toBe(false);
    s.act = 2;
    expect(A.upgradeNight(s, 'duration').ok).toBe(false);
    expect(A.upgradeNight(s, 'rate').ok).toBe(true);
    expect(nightRate(s)).toBeCloseTo(0.005, 6);
    expect(nightDuration(s)).toBe(NIGHT.duration.base);
    expect(A.upgradeNight(s, 'duration').ok).toBe(true);
    expect(nightDuration(s)).toBe(NIGHT.duration.base + NIGHT.duration.per);
  });

  it('50 niveaux de rendement jusqu’à 25 %, 10 paliers de durée jusqu’à 3 h', () => {
    const s = createGame(1);
    s.act = 2;
    s.money = 1e15;
    for (let i = 0; i < NIGHT.rate.max; i++) expect(A.upgradeNight(s, 'rate').ok).toBe(true);
    expect(A.upgradeNight(s, 'rate').ok).toBe(false);
    for (let i = 0; i < NIGHT.duration.max; i++) expect(A.upgradeNight(s, 'duration').ok).toBe(true);
    expect(A.upgradeNight(s, 'duration').ok).toBe(false);
    expect(nightRate(s)).toBeCloseTo(0.25, 6);
    expect(nightDuration(s)).toBe(3 * 3600);
    expect(nightCost('rate', 49)).toBeGreaterThan(nightCost('rate', 0) * 1000);
  });

  it('les niveaux sont gardés au déménagement', () => {
    const s = act2();
    A.upgradeNight(s, 'rate');
    A.upgradeNight(s, 'duration');
    s.market.goalReached = true;
    expect(A.move(s).ok).toBe(true);
    expect(s.night).toEqual({ rate: 1, duration: 1 });
  });
});

describe('absence', () => {
  it('une absence courte est rattrapée à plein régime', () => {
    const s = act2();
    const r = catchUp(s, 200);
    expect(r.mode).toBe('grace');
    expect(r.worked).toBe(200);
    expect(r.produced).toBeGreaterThan(30);
  });

  it('sans équipe de nuit, rien ne tourne ; le manque à gagner est compté', () => {
    const s = act2();
    const t0 = s.t;
    const r = catchUp(s, 8 * 3600);
    expect(r.mode).toBe('none');
    expect(r.produced).toBe(0);
    expect(s.t).toBe(t0);
    expect(r.missed).toBeGreaterThan(0);
  });

  it('l’équipe de nuit travaille à son rendement, pendant sa durée au plus', () => {
    const s = act2();
    for (let i = 0; i < 20; i++) A.upgradeNight(s, 'rate');
    const t0 = s.t;
    const r = catchUp(s, 8 * 3600);
    expect(r.mode).toBe('night');
    expect(r.worked).toBe(NIGHT.duration.base);
    expect(r.rate).toBeCloseTo(0.1, 6);
    expect(s.t - t0).toBeCloseTo(NIGHT.duration.base * 0.1, 0);
    expect(r.produced).toBeGreaterThan(0);
    expect(r.missed).toBeGreaterThan(r.money);
  });

  it('la part de marché ne progresse pas hors ligne', () => {
    const s = act2();
    for (let i = 0; i < 50; i++) A.upgradeNight(s, 'rate');
    for (let i = 0; i < 10; i++) A.upgradeNight(s, 'duration');
    s.market.goalT = 3;
    const before = { goalT: s.market.goalT, shareEma: s.market.shareEma, reached: s.market.goalReached };
    catchUp(s, 3 * 3600);
    expect(s.market.goalT).toBe(before.goalT);
    expect(s.market.shareEma).toBe(before.shareEma);
    expect(s.market.goalReached).toBe(before.reached);
  });
});
