/**
 * Tutoriel : Marcel guide sur des rails au début de chaque phase. Complet au prologue (le reste
 * du panneau est grisé, chaque étape se fait), court à chaque acte (il montre où sont les
 * nouveautés). Toujours désactivable : « Je connais, Marcel », Échap, ou l'option du menu.
 */
import { G } from '../game';
import type { GameState } from '../sim/types';
import type { GuideStep } from '../story/quests';
import { guideActive, railActive, startGuide } from './guide';

const posts = (s: GameState) => s.workers.filter((w) => w.kind === 'post').length;
const lineFull = (s: GameState) => s.factories[0].lines[0].slots.every((m) => m && m.post >= 0);

/** Rails par acte. Au prologue, les étapes d'action se valident en agissant. */
const RAILS: Record<number, GuideStep[]> = {
  0: [
    { target: 'scene', text: 'Bienvenue à la forge, petit. Maintiens le clic sur l’atelier, ou la barre d’espace : le temps file plus vite. Essaie.', until: () => G.rev > 0.3 },
    { target: 'scene', text: 'Voilà. Le clic ne fabrique rien : il fait passer le temps. Plus vite tu cliques, plus ça tourne… et plus ça s’use.' },
    { tab: 'equipe', target: 'act:hire', text: 'Tout seul, je cours d’un établi à l’autre. Embauche quelqu’un.', until: (s) => posts(s) >= 1 },
    { target: 'scene', text: 'Tu vois ? Il a pris un poste, et il n’en bougera plus. Moi, je bouche les trous.' },
    { tab: 'equipe', target: 'act:hire', text: 'Un ouvrier par poste : complète la chaîne 1.', until: lineFull },
    { target: 'scene', text: 'Regarde les piles entre les postes : là où ça s’entasse, c’est le poste qui coince. Le goulot.' },
    { tab: 'atelier', target: 'act:tool', text: 'Un outillage sur ce poste, et toute la chaîne avance. Si la caisse ne suffit pas encore, le bouton te dit dans combien de temps.', until: (s) => s.tooling[0].some((x) => x > 0) },
    { target: 'sel:#obj', text: 'La banque attend ses 800 €, l’échéance est là. Tant que je te montre, elle ne court pas.' },
    { target: 'sel:#quests', text: 'Pour la suite, mon carnet te propose quoi faire. Le « ? » d’une ligne, et je te montre. Allez, au boulot.' },
  ],
  1: [
    { target: 'sel:#obj', text: 'La dette est payée, la forge est à toi. Maintenant, la ville : il faut en tenir la moitié du marché.' },
    { tab: 'rd', target: 'sel:#list .card', text: 'Nouvel onglet : le bureau d’études. Machines, matériaux… Tout commence ici.' },
    { tab: 'equipe', target: 'sel:[data-act="role"][data-i="foreman"]', text: 'Le contremaître : il te dit la cadence de chaque poste et qui freine sa chaîne.' },
    { target: 'sel:#quests', text: 'Le carnet a de nouvelles pages. Suis-les, ça vient tout seul.' },
  ],
  2: [
    { target: 'sel:#obj', text: 'La région. Plus grand, plus cher. Les machines consomment, les gars fatiguent.' },
    { tab: 'equipe', target: 'sel:[data-act="night"][data-i="rate"]', text: 'Nouveau : l’équipe de nuit. Sans elle, l’usine dort quand tu dors.' },
    { tab: 'atelier', target: 'sel:[data-act="energy"][data-i="wind"]', text: 'L’énergie : le réseau coûte, le vent et le soleil beaucoup moins.' },
    { tab: 'marche', text: 'Les clients passent des contrats, ici. Bien payés, mais il faut livrer à temps.' },
    { tab: 'equipe', target: 'sel:[data-act="role"][data-i="methods"]', text: 'Et l’ingénieur méthodes : tu lui donnes une consigne, il modernise à ta place.' },
  ],
  3: [
    { target: 'sel:#obj', text: 'Le pays entier. Les robots arrivent, et avec eux des questions difficiles.' },
    { tab: 'rd', target: 'sel:#list .card', text: 'Un robot n’a besoin de personne à son poste. Il faudra quand même un technicien.' },
    { tab: 'equipe', target: 'sel:[data-act="role"][data-i="controller"]', text: 'Les nouveaux rôles coûtent cher. Garde un œil sur tes recettes : un rôle se congédie à tout moment.' },
    { tab: 'donnees', text: 'Les données, enfin au complet. Chaque rôle y ajoute ses courbes.' },
  ],
  4: [
    { target: 'sel:#obj', text: 'Le monde. Deux milliards, et Ferrum est à nous. L’usine de ton grand-père avec.' },
    { tab: 'rd', target: 'sel:#list .card', text: 'L’usine noire : sans personne, sans lumière. Puis le diamant.' },
    { target: 'sel:#quests', text: 'Le carnet te mène jusqu’au rachat. Je suis fier de toi, tu sais.' },
  ],
};

export function railDone(s: GameState, act: number): boolean {
  return !!s.story.flags[`rail-${act}`];
}

/**
 * Lance le rail de l'acte au bon moment : partie en cours, rien d'autre à l'écran, début d'acte.
 * Une partie reprise en cours d'acte ne le rejoue pas.
 */
export function tutorialTick(free: boolean): void {
  const s = G.s;
  if (!G.started || G.paused || G.finale || !free || guideActive()) return;
  const steps = RAILS[s.act];
  if (!steps || railDone(s, s.act)) return;
  if (!G.settings.tutorial || s.actT > 90) {
    s.story.flags[`rail-${s.act}`] = 1;
    return;
  }
  s.story.flags[`rail-${s.act}`] = 1;
  startGuide(steps, { title: 'Marcel', rail: s.act === 0 });
}

/** Pendant le rail du prologue, l'échéance de la dette ne court pas. */
export function freezeDebt(gameDt: number): void {
  if (railActive() && G.s.act === 0 && gameDt > 0) G.s.due += gameDt;
}

