import { describe, expect, it } from 'vitest';
import * as A from '../sim/actions';
import { advance } from '../sim/engine';
import { catchUp } from '../sim/offline';
import { SAVE_VERSION, createGame } from '../sim/state';
import { deserialize, migrations, serialize } from './save';

describe('sauvegarde versionnée', () => {
  it('aller-retour sans perte', () => {
    const s = createGame(9);
    A.hire(s, 0);
    A.upgradeTool(s, 0, 3);
    advance(s, 120, { red: false }, 0.1);
    const f = deserialize(serialize(s, 1234))!;
    expect(f.savedAt).toBe(1234);
    expect(f.state.workers.length).toBe(2);
    expect(f.state.chains[0].stations[3].tool).toBe(1);
    expect(f.state.t).toBeCloseTo(s.t, 6);
    // la partie reprend à l'identique
    s.fx = [];
    advance(s, 60, { red: false }, 0.1);
    advance(f.state, 60, { red: false }, 0.1);
    f.state.fx = [];
    s.fx = [];
    expect(JSON.stringify(f.state)).toBe(JSON.stringify(s));
  });

  it('complète les champs manquants d’une vieille partie', () => {
    const s = createGame(3);
    const raw = JSON.parse(serialize(s, 0));
    delete raw.state.energy;
    delete raw.state.knowHow.levels.cadence;
    delete raw.state.stats.knowHowEarned;
    const f = deserialize(JSON.stringify(raw))!;
    expect(f.state.energy.factor).toBe(1);
    expect(f.state.knowHow.levels.cadence).toBe(0);
    expect(f.state.stats.knowHowEarned).toBe(0);
  });

  it('applique les migrations dans l’ordre', () => {
    const s = createGame(3);
    const raw = JSON.parse(serialize(s, 0));
    raw.version = 0;
    raw.state.money = 5;
    migrations[0] = (d) => {
      (d.state as { money: number }).money = 42;
      return d;
    };
    try {
      const f = deserialize(JSON.stringify(raw))!;
      expect(f.version).toBe(SAVE_VERSION);
      expect(f.state.money).toBe(42);
    } finally {
      delete migrations[0];
    }
  });

  it('v1 → v2 : les contrats en cours gardent leurs pièces déjà comptées', () => {
    const s = createGame(3);
    const raw = JSON.parse(serialize(s, 0));
    raw.version = 1;
    raw.state.spot = [{ id: 1, material: 0, qty: 50, delivered: 12, price: 3, deadline: 100, duration: 120, accepted: true }];
    const f = deserialize(JSON.stringify(raw))!;
    expect(f.state.spot[0].counted).toBe(12);
  });

  it('refuse une sauvegarde illisible ou d’une version future', () => {
    expect(deserialize('pas du json')).toBeNull();
    expect(deserialize(JSON.stringify({ version: SAVE_VERSION + 1, state: {} }))).toBeNull();
    expect(deserialize(JSON.stringify({ version: 0, state: {} }))).toBeNull();
  });
});

describe('progression hors ligne', () => {
  it('l’usine tourne à vitesse ×1, plafonnée à 8 h', () => {
    const s = createGame(4);
    for (let i = 0; i < 3; i++) A.hire(s, 0);
    const r = catchUp(s, 3600);
    expect(r.seconds).toBe(3600);
    expect(r.sold).toBeGreaterThan(500);
    expect(s.t).toBeCloseTo(3600, 0);
    const s2 = createGame(4);
    expect(catchUp(s2, 48 * 3600).seconds).toBe(8 * 3600);
  });
});
