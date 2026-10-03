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
    expect(f.state.tooling[0][3]).toBe(1);
    expect(f.state.factories[0].lines[0].slots[0]!.post).toBe(s.workers[1].id);
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
    const prev = SAVE_VERSION - 1;
    const real = migrations[prev];
    raw.version = prev;
    raw.state.money = 5;
    migrations[prev] = (d) => {
      (d.state as { money: number }).money = 42;
      return d;
    };
    try {
      const f = deserialize(JSON.stringify(raw))!;
      expect(f.version).toBe(SAVE_VERSION);
      expect(f.state.money).toBe(42);
    } finally {
      if (real) migrations[prev] = real;
      else delete migrations[prev];
    }
  });

  it('une partie d’avant la refonte (v1, v2) n’est pas reprise : nouvelle partie', () => {
    const s = createGame(3);
    const raw = JSON.parse(serialize(s, 0));
    for (const v of [1, 2]) {
      raw.version = v;
      expect(deserialize(JSON.stringify(raw))).toBeNull();
    }
  });

  it('refuse une sauvegarde illisible ou d’une version future', () => {
    expect(deserialize('pas du json')).toBeNull();
    expect(deserialize(JSON.stringify({ version: SAVE_VERSION + 1, state: {} }))).toBeNull();
    expect(deserialize(JSON.stringify({ version: 0, state: {} }))).toBeNull();
  });
});

describe('progression hors ligne', () => {
  it('avant l’acte II, la forge ne tourne pas en l’absence du joueur', () => {
    const s = createGame(4);
    for (let i = 0; i < 3; i++) A.hire(s, 0);
    const r = catchUp(s, 3600);
    expect(r.mode).toBe('none');
    expect(r.sold).toBe(0);
    expect(s.t).toBe(0);
  });

  it('v3 → v4 : une partie existante reçoit une équipe de nuit vide', () => {
    const s = createGame(3);
    const raw = JSON.parse(serialize(s, 0));
    raw.version = 3;
    delete raw.state.night;
    const f = deserialize(JSON.stringify(raw))!;
    expect(f.version).toBe(SAVE_VERSION);
    expect(f.state.night).toEqual({ rate: 0, duration: 0 });
  });
});
