import { describe, expect, it } from 'vitest';
import { CONTRACTS, MATERIALS } from '../data/balance';
import * as A from './actions';
import { advance } from './engine';
import { createGame } from './state';
import type { GameState } from './types';

function act1(seed = 21): GameState {
  const s = createGame(seed);
  s.money = 1000;
  A.payDebt(s);
  s.money = 1e5;
  for (let i = 0; i < 4; i++) A.hire(s, 0);
  return s;
}

describe('commandes spéciales', () => {
  it('arrivent dès l’acte I, une à la fois, taillées sur la production mesurée', () => {
    const s = act1();
    advance(s, 400, { red: false }, 0.1);
    expect(s.spot.length).toBe(1);
    const c = s.spot[0];
    const rate = s.market.prodRate[c.material];
    const secs = c.qty / (rate * CONTRACTS.spotShare);
    // 2 à 5 min de production (à l'arrondi près, la cadence a bougé depuis l'offre)
    expect(secs).toBeGreaterThan(CONTRACTS.spotSize[0] * 0.6);
    expect(secs).toBeLessThan(CONTRACTS.spotSize[1] * 1.6);
    const lv = CONTRACTS.spotLevels[c.level!];
    expect(c.price).toBeCloseTo(MATERIALS[c.material].price * (1 + lv.premium), 6);
    advance(s, 400, { red: false }, 0.1);
    expect(s.spot.length).toBe(1);
  });

  it('ne demandent qu’un matériau qu’on produit déjà', () => {
    const s = act1(5);
    s.research.materials[1] = true;
    advance(s, 2000, { red: false }, 0.25);
    expect(s.spot.every((c) => s.factories.some((f) => f.material === c.material))).toBe(true);
  });

  it('une commande tranquille se tient sans rien changer', () => {
    const s = act1(9);
    let tested = false;
    for (let k = 0; k < 40 && !tested; k++) {
      advance(s, 60, { red: false }, 0.1);
      const c = s.spot.find((x) => !x.accepted && (x.level ?? 0) === 0);
      if (!c) {
        if (s.spot[0] && !s.spot[0].accepted) A.declineSpot(s, s.spot[0].id);
        continue;
      }
      A.acceptSpot(s, c.id);
      const done0 = s.stats.contractsDone;
      for (let t = 0; t < c.duration + 10 && s.stats.contractsDone === done0; t += 5) {
        A.deliverSpot(s, c.id);
        advance(s, 5, { red: false }, 0.1);
      }
      expect(s.stats.contractsDone).toBe(done0 + 1);
      tested = true;
    }
    expect(tested).toBe(true);
  });

  it('à l’acte I, une commande manquée ne coûte que la prime', () => {
    const s = act1();
    s.reputation = 10;
    s.spot.push({ id: 999, material: 0, qty: 10000, delivered: 0, price: 5, deadline: 0, duration: 10, accepted: false, counted: 0, level: 2 });
    A.acceptSpot(s, 999);
    advance(s, 12, { red: false }, 0.25);
    expect(s.spot.find((c) => c.id === 999)).toBeUndefined();
    expect(s.reputation).toBe(10);
    expect(s.stats.contractsFailed).toBe(1);
  });
});
