/**
 * Accès de test (Playwright) : window.__rouages. Avance une vraie partie avec l'IA du
 * simulateur jusqu'à un acte donné, pour vérifier le rendu de chaque étape.
 */
import { G } from './game';
import type { Camera } from './render/scene';
import * as A from './sim/actions';
import { aiStep, newAi } from './sim/ai';
import { step } from './sim/engine';
import { createGame } from './sim/state';
import { silenceStory } from './story/director';
import { invalidatePanel, renderPanel } from './ui/panel';
import { telexClose } from './ui/telex';
import { closeOverlay } from './ui/overlay';

interface Hooks {
  begin: () => void;
  cam: Camera;
  getCanvas: () => HTMLCanvasElement;
  absence: (s: number) => void;
  startFinale: () => void;
}

export function installDebug(h: Hooks): void {
  const api = {
    G,
    A,
    /** Démarre une partie neuve sans passer par l'écran titre. */
    start(seed = 7) {
      G.s = createGame(seed);
      closeOverlay();
      h.begin();
    },
    /** Avance la simulation de `seconds` (sans IA). */
    skip(seconds: number) {
      for (let t = 0; t < seconds; t += 0.25) step(G.s, 0.25, { red: false });
      G.s.fx.length = 0;
      invalidatePanel();
      renderPanel();
    },
    /** Joue avec l'IA jusqu'à l'acte demandé, puis `extra` secondes de plus. */
    playTo(act: number, extra = 120, seed = 11) {
      const s = createGame(seed);
      const ai = newAi();
      let k = 0;
      let guard = 0;
      const until = () => s.act >= act || s.ended;
      while (!until() && guard++ < 400000) {
        step(s, 0.25, { red: false });
        if (++k % 16 === 0) aiStep(ai, s);
        s.fx.length = 0;
      }
      for (let t = 0; t < extra; t += 0.25) {
        step(s, 0.25, { red: false });
        if (++k % 16 === 0 && !(act === 4 && A.canBuyout(s))) aiStep(ai, s);
        s.fx.length = 0;
      }
      silenceStory(s);
      G.s = s;
      G.chain = 0;
      closeOverlay();
      telexClose();
      h.begin();
      return { act: s.act, chains: s.chains.length, money: s.money };
    },
    absence: h.absence,
    finale: h.startFinale,
    cam: h.cam,
  };
  (window as unknown as { __rouages: typeof api }).__rouages = api;
}
