import { describe, expect, it } from 'vitest';
import * as A from '../sim/actions';
import { advance } from '../sim/engine';
import { createGame } from '../sim/state';
import { storyTick } from './director';
import { QUEST_REWARD } from '../data/balance';
import { QUESTS, activeQuests } from './quests';
import { BEATS } from './script';

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

  it('les quêtes actives sont les trois premières non faites, plus l’objectif de l’acte', () => {
    const s = createGame(1);
    expect(activeQuests(s).map((q) => q.id)).toEqual(['p-hire', 'p-team', 'p-tool', 'p-goal']);
    A.hire(s, 0);
    const m0 = s.money;
    const out = storyTick(s);
    expect(out.quests.map((q) => q.id)).toEqual(['p-hire']);
    expect(s.money).toBeCloseTo(m0 + out.quests[0].reward, 6);
    expect(storyTick(s).quests.length).toBe(0);
    expect(activeQuests(s).map((q) => q.id)).toEqual(['p-team', 'p-tool', 'p-unit', 'p-goal']);
  });

  it('une quête faite d’avance se valide dès qu’elle devient active', () => {
    const s = createGame(1);
    s.money = 1e4;
    A.upgradeTool(s, 0, 2);
    A.addUnit(s, 0, 0);
    expect(storyTick(s).quests.map((q) => q.id)).toEqual(['p-tool']);
    for (let i = 0; i < 4; i++) A.hire(s, 0);
    const ids = storyTick(s).quests.map((q) => q.id);
    expect(ids).toContain('p-hire');
    expect(ids).toContain('p-team');
  });

  it('certaines quêtes offrent un niveau d’outillage', () => {
    const s = createGame(1);
    s.act = 1;
    s.debt = 0;
    s.money = 1e5;
    s.milestones['i-research'] = true;
    s.milestones['i-modern'] = true;
    for (let i = 0; i < 4; i++) A.hire(s, 0);
    const before = s.tooling[0].reduce((a, b) => a + b, 0);
    A.train(s, s.workers[1].id);
    advance(s, 30, { red: false }, 0.25);
    const out = storyTick(s);
    const q = out.quests.find((x) => x.id === 'i-train')!;
    expect(q.tool).not.toBe('');
    expect(s.tooling[0].reduce((a, b) => a + b, 0)).toBe(before + 1);
  });

  it('chaque quête a une aide, un identifiant unique et une récompense (sauf l’objectif)', () => {
    const ids = QUESTS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const q of QUESTS) {
      expect(q.help.length).toBeGreaterThan(0);
      if (q.goal) expect(QUEST_REWARD[q.id]).toBeUndefined();
      else expect(QUEST_REWARD[q.id]).toBeDefined();
    }
    for (let act = 0; act <= 4; act++) expect(QUESTS.filter((q) => q.act === act && q.goal).length).toBe(1);
  });

  it('chaque palier a un identifiant unique', () => {
    const ids = BEATS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
