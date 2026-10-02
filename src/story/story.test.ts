import { describe, expect, it } from 'vitest';
import * as A from '../sim/actions';
import { advance } from '../sim/engine';
import { createGame } from '../sim/state';
import { storyTick } from './director';
import { BEATS, MILESTONES } from './script';

describe('histoire', () => {
  it('le prologue s’ouvre sur la lettre de la banque et Marcel', () => {
    const s = createGame(1);
    const out = storyTick(s);
    expect(out.msgs[0].from).toContain('Banque');
    expect(out.msgs.some((m) => m.from === 'Marcel')).toBe(true);
    // une seule fois
    expect(storyTick(s).msgs.length).toBe(0);
  });

  it('les messages se déclenchent par paliers, pas au chronomètre', () => {
    const s = createGame(1);
    storyTick(s);
    advance(s, 300, { red: false }, 0.25);
    const ids = storyTick(s).msgs.map((m) => m.text);
    // Marcel seul pendant 5 minutes : pas de message d'embauche
    expect(ids.some((t) => t.includes('Bienvenue'))).toBe(false);
    A.hire(s, 0);
    expect(storyTick(s).msgs.some((m) => m.text.includes('Bienvenue'))).toBe(true);
  });

  it('l’échéance dépassée produit un télex de la banque', () => {
    const s = createGame(1);
    storyTick(s);
    advance(s, 1201, { red: false }, 0.5);
    const out = storyTick(s, s.fx);
    expect(out.msgs.some((m) => m.text.includes('majorée de 10 %'))).toBe(true);
  });

  it('les jalons récompensent une fois et seulement dans leur acte', () => {
    const s = createGame(1);
    for (let i = 0; i < 3; i++) A.hire(s, 0);
    const m0 = s.money;
    const out = storyTick(s);
    const team = out.milestones.find((m) => m.id === 'p-team');
    expect(team).toBeDefined();
    expect(s.money).toBeCloseTo(m0 + out.milestones.reduce((a, m) => a + m.reward, 0), 6);
    expect(storyTick(s).milestones.length).toBe(0);
    expect(MILESTONES.filter((m) => m.act === 4).length).toBeGreaterThanOrEqual(4);
  });

  it('chaque palier a un identifiant unique', () => {
    const ids = BEATS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
