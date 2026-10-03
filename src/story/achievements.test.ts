import { describe, expect, it } from 'vitest';
import * as A from '../sim/actions';
import { createGame } from '../sim/state';
import { ACHIEVEMENTS } from './achievements';

const check = (id: string) => ACHIEVEMENTS.find((a) => a.id === id)!.check!;

describe('succès', () => {
  it('ont un identifiant unique, un nom et une description', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of ACHIEVEMENTS) expect(a.name.length && a.desc.length).toBeTruthy();
  });

  it('se lisent dans l’état de la partie', () => {
    const s = createGame(1);
    expect(check('free')(s)).toBe(false);
    s.money = 900;
    A.payDebt(s);
    expect(check('free')(s)).toBe(true);
    expect(check('quick')(s)).toBe(true);
    s.money = 1e15;
    for (let k = 0; k < 50; k++) A.upgradeTool(s, 0, 3);
    expect(check('taylor')(s)).toBe(true);
    expect(check('empire')(s)).toBe(false);
  });
});
