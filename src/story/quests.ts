/**
 * Quêtes : le carnet de Marcel. Chaque acte propose des quêtes dans un ordre conseillé ; les
 * trois premières non faites sont actives. La dernière est l'objectif de l'acte : elle se
 * montre toujours, mais ne bloque rien. Chaque quête porte son aide pas à pas (ui/guide).
 */
import { ACTS, QUEST_REWARD, TOOL_MAX } from '../data/balance';
import { conveyorActive } from '../sim/engine';
import type { GameState, Machine } from '../sim/types';

/** Une étape d'aide de Marcel. */
export interface GuideStep {
  text: string;
  /** Onglet où se trouve la cible (la bulle invite d'abord à l'ouvrir). */
  tab?: 'atelier' | 'equipe' | 'rd' | 'marche' | 'donnees';
  /**
   * Cible désignée : « act:hire » (premier bouton data-act="hire" du panneau),
   * « sel:<css> » (sélecteur quelconque), « scene » (l'usine). Absente : la bulle seule.
   */
  target?: string;
  /** L'étape se valide d'elle-même quand la condition est remplie ; sinon bouton « Compris ». */
  until?: (s: GameState) => boolean;
}

export interface Quest {
  id: string;
  act: number;
  label: string;
  /** Objectif de l'acte : sans récompense, affiché en dernier. */
  goal?: boolean;
  check: (s: GameState) => boolean;
  help: GuideStep[];
}

const machines = (s: GameState): Machine[] => s.factories.flatMap((f) => f.lines.flatMap((l) => l.slots.filter((m): m is Machine => !!m)));
const posts = (s: GameState) => s.workers.filter((w) => w.kind === 'post').length;
const role = (id: string) => `sel:[data-act="role"][data-i="${id}"]`;
const rd = (id: string) => `sel:[data-act="rd"][data-i="${id}"]`;
const mat = (i: number) => `sel:[data-act="mat"][data-i="${i}"]`;
const hasMat = (s: GameState, i: number) => s.factories.some((f) => f.material >= i);
const shareGoal = (s: GameState) => s.market.goalReached;

export const QUESTS: Quest[] = [
  // ---------------------------------------------------------------- Prologue
  {
    id: 'p-hire', act: 0, label: 'Embaucher un ouvrier', check: (s) => posts(s) >= 1,
    help: [{ tab: 'equipe', target: 'act:hire', text: 'Ici : Embaucher. Il prend le poste libre le plus utile et n’en bouge plus.', until: (s) => posts(s) >= 1 }],
  },
  {
    id: 'p-team', act: 0, label: 'Pourvoir les quatre postes de la chaîne 1',
    check: (s) => s.factories[0].lines[0].slots.every((m) => m && m.post >= 0),
    help: [
      { target: 'scene', text: 'Un poste sans titulaire, c’est la silhouette en pointillés. Moi, je bouche les trous, mais je ne suis pas partout.' },
      { tab: 'equipe', target: 'act:hire', text: 'Embauche jusqu’à avoir un ouvrier par poste.', until: (s) => s.factories[0].lines[0].slots.every((m) => m && m.post >= 0) },
    ],
  },
  {
    id: 'p-tool', act: 0, label: 'Améliorer un outillage', check: (s) => s.tooling[0].some((x) => x > 0),
    help: [
      { target: 'scene', text: 'Regarde où les pièces s’entassent : c’est le poste qui coince, le goulot.' },
      { tab: 'atelier', target: 'act:tool', text: 'Outille ce poste-là. Ça vaut pour tous les postes identiques, et ça coûte peu.', until: (s) => s.tooling[0].some((x) => x > 0) },
    ],
  },
  {
    id: 'p-unit', act: 0, label: 'Ouvrir un poste sur la chaîne 2',
    check: (s) => s.factories[0].lines[1].slots.some(Boolean),
    help: [{ tab: 'atelier', target: 'act:unit', text: 'Un deuxième établi au poste qui coince : il s’installe sur la chaîne 2, et ses pièces rejoignent la chaîne 1.', until: (s) => s.factories[0].lines[1].slots.some(Boolean) }],
  },
  {
    id: 'p-conveyor', act: 0, label: 'Faire tourner un convoyeur',
    check: (s) => s.factories.some((f) => f.lines.some((l) => conveyorActive(s, l))),
    help: [
      { tab: 'atelier', target: 'act:conveyor', text: 'Sans convoyeur, chaque pièce se porte à la main. Pose-en un sur une chaîne.', until: (s) => s.factories.some((f) => f.lines.some((l) => l.conveyor)) },
      { tab: 'equipe', target: 'act:hire', text: 'Il faut quelqu’un à la manivelle : embauche-le.', until: (s) => s.factories.some((f) => f.lines.some((l) => conveyorActive(s, l))) },
    ],
  },
  {
    id: 'p-line', act: 0, label: 'Compléter la chaîne 2',
    check: (s) => s.factories[0].lines[1].slots.every(Boolean),
    help: [{ tab: 'atelier', target: 'act:unit', text: 'Achète les postes qui manquent à la chaîne 2, un par un.', until: (s) => s.factories[0].lines[1].slots.every(Boolean) }],
  },
  {
    id: 'p-goal', act: 0, goal: true, label: 'Rembourser la dette de la forge', check: (s) => s.debt <= 0,
    help: [
      { target: 'sel:#obj', text: 'La dette et son échéance sont là, sur l’afficheur.' },
      { tab: 'marche', target: 'act:pay', text: 'Quand la caisse le permet, rembourse. Même en plusieurs fois.' },
    ],
  },
  // ---------------------------------------------------------------- Acte I
  {
    id: 'i-research', act: 1, label: 'Rechercher les machines mécaniques', check: (s) => s.research.tier >= 1,
    help: [{ tab: 'rd', target: rd('tier'), text: 'Le bureau d’études ouvre la porte aux machines. Les établis ont fait leur temps.', until: (s) => s.research.tier >= 1 }],
  },
  {
    id: 'i-modern', act: 1, label: 'Moderniser une machine', check: (s) => machines(s).some((m) => m.tier >= 1),
    help: [{ tab: 'atelier', target: 'act:modern', text: 'On modernise une machine à la fois. Elle va bien plus vite… mais son ouvrier doit être opérateur.', until: (s) => machines(s).some((m) => m.tier >= 1) }],
  },
  {
    id: 'i-train', act: 1, label: 'Former un ouvrier', check: (s) => s.stats.trainings >= 1,
    help: [{ tab: 'equipe', target: 'act:train', text: 'Chaque formation le rend un peu plus rapide. Les petits points au-dessus de sa tête, ce sont ses formations.', until: (s) => s.stats.trainings >= 1 }],
  },
  {
    id: 'i-promo', act: 1, label: 'Promouvoir un ouvrier', check: (s) => s.stats.promotions >= 1,
    help: [
      { tab: 'equipe', target: 'act:train', text: 'Cinq formations, et il peut passer au niveau du dessus.' },
      { tab: 'equipe', target: 'act:promote', text: 'Promouvoir : il saura conduire la machine modernisée.', until: (s) => s.stats.promotions >= 1 },
    ],
  },
  {
    id: 'i-foreman', act: 1, label: 'Recruter le contremaître', check: (s) => s.roles.foreman,
    help: [{ tab: 'equipe', target: role('foreman'), text: 'Lui, il voit la cadence de chaque poste et te dit qui freine sa chaîne.', until: (s) => s.roles.foreman }],
  },
  {
    id: 'i-steel', act: 1, label: 'Produire en acier doux', check: (s) => hasMat(s, 1),
    help: [
      { tab: 'rd', target: rd('mat:1'), text: 'L’acier se vend plus du double de la fonte.', until: (s) => s.research.materials[1] },
      { tab: 'atelier', target: mat(1), text: 'Passe l’usine en acier.', until: (s) => hasMat(s, 1) },
    ],
  },
  {
    id: 'i-factory', act: 1, label: 'Bâtir une deuxième usine', check: (s) => s.factories.length >= 2,
    help: [{ tab: 'atelier', target: 'act:buy-factory', text: 'Une usine neuve, équipée comme la meilleure. Les ouvriers, eux, sont à embaucher.', until: (s) => s.factories.length >= 2 }],
  },
  {
    id: 'i-share', act: 1, label: 'Atteindre 25 % du marché de la ville', check: (s) => s.market.shareEma >= 0.25,
    help: [{ target: 'sel:#obj', text: 'Ta part de marché s’affiche ici. Plus tu produis, plus elle monte.' }],
  },
  {
    id: 'i-goal', act: 1, goal: true, label: 'Tenir 50 % du marché pendant 30 s', check: shareGoal,
    help: [
      { target: 'sel:#obj', text: 'La moitié de la ville, tenue trente secondes. Ensuite, on déménage vers plus grand.' },
      { tab: 'marche', target: 'act:move', text: 'Quand c’est fait, le déménagement se lance d’ici.' },
    ],
  },
  // ---------------------------------------------------------------- Acte II
  {
    id: 'ii-night', act: 2, label: 'Recruter une équipe de nuit', check: (s) => s.night.rate >= 1,
    help: [{ tab: 'equipe', target: 'sel:[data-act="night"][data-i="rate"]', text: 'Quand tu n’es pas là, elle fait tourner l’usine. Un peu. Puis de plus en plus.', until: (s) => s.night.rate >= 1 }],
  },
  {
    id: 'ii-poly', act: 2, label: 'Embaucher un polyvalent', check: (s) => s.workers.some((w) => w.kind === 'poly' && w.name !== 'Marcel'),
    help: [{ tab: 'equipe', target: 'act:hire-poly', text: 'Moins cher, moins rapide, mais il relève ceux qui fatiguent. Le moral compte, ici.', until: (s) => s.workers.some((w) => w.kind === 'poly' && w.name !== 'Marcel') }],
  },
  {
    id: 'ii-hr', act: 2, label: 'Recruter les ressources humaines', check: (s) => s.roles.hr,
    help: [{ tab: 'equipe', target: role('hr'), text: 'Elles forment et promeuvent tes gars quand leur machine l’exige.', until: (s) => s.roles.hr }],
  },
  {
    id: 'ii-semi', act: 2, label: 'Première machine semi-automatique', check: (s) => machines(s).some((m) => m.tier >= 2),
    help: [
      { tab: 'rd', target: rd('tier'), text: 'Le semi-automatique se recherche d’abord.', until: (s) => s.research.tier >= 2 },
      { tab: 'atelier', target: 'act:modern', text: 'Puis on modernise. Il faudra un régleur pour la conduire.', until: (s) => machines(s).some((m) => m.tier >= 2) },
    ],
  },
  {
    id: 'ii-wind', act: 2, label: 'Installer une éolienne', check: (s) => s.energy.wind >= 1,
    help: [{ tab: 'atelier', target: 'sel:[data-act="energy"][data-i="wind"]', text: 'Les machines consomment. Le vent, lui, est gratuit.', until: (s) => s.energy.wind >= 1 }],
  },
  {
    id: 'ii-contract', act: 2, label: 'Livrer un contrat', check: (s) => s.stats.contractsDone >= 1,
    help: [
      { tab: 'marche', target: 'act:accept', text: 'Un client propose un contrat : accepte-le, les pièces sont mises de côté.', until: (s) => s.spot.some((c) => c.accepted) || s.stats.contractsDone >= 1 },
      { tab: 'marche', target: 'act:deliver', text: 'Quand le stock suffit, livre.', until: (s) => s.stats.contractsDone >= 1 },
    ],
  },
  {
    id: 'ii-methods', act: 2, label: 'Donner une consigne à l’ingénieur méthodes', check: (s) => s.roles.methods && s.methods.active,
    help: [
      { tab: 'equipe', target: role('methods'), text: 'Il modernise à ta place, selon ta consigne.', until: (s) => s.roles.methods },
      { tab: 'equipe', target: 'act:m-active', text: 'Choisis le palier visé pour chaque poste, puis applique la consigne.', until: (s) => s.methods.active },
    ],
  },
  {
    id: 'ii-four', act: 2, label: 'Quatre usines', check: (s) => s.factories.length >= 4,
    help: [{ tab: 'atelier', target: 'act:buy-factory', text: 'La région est grande. Bâtis.', until: (s) => s.factories.length >= 4 }],
  },
  {
    id: 'ii-goal', act: 2, goal: true, label: 'Tenir 50 % du marché régional pendant 30 s', check: shareGoal,
    help: [{ target: 'sel:#obj', text: 'Même objectif, marché plus grand. Puis on déménage.' }],
  },
  // ---------------------------------------------------------------- Acte III
  {
    id: 'iii-robot', act: 3, label: 'Premier robot', check: (s) => machines(s).some((m) => m.tier >= 3),
    help: [
      { tab: 'rd', target: rd('tier'), text: 'Les robots. Ton grand-père n’y aurait pas cru.', until: (s) => s.research.tier >= 3 },
      { tab: 'atelier', target: 'act:modern', text: 'Un robot n’a plus besoin d’ouvrier à son poste.', until: (s) => machines(s).some((m) => m.tier >= 3) },
    ],
  },
  {
    id: 'iii-tech', act: 3, label: 'Avoir un technicien', check: (s) => s.workers.some((w) => w.level >= 4),
    help: [{ tab: 'equipe', target: 'act:promote', text: 'Sans technicien, les robots tournent à moitié. Promeus un régleur.', until: (s) => s.workers.some((w) => w.level >= 4) }],
  },
  {
    id: 'iii-logistics', act: 3, label: 'Recruter l’opérateur logistique', check: (s) => s.roles.logistics,
    help: [{ tab: 'equipe', target: role('logistics'), text: 'Il livre les contrats tout seul. Attention, il coûte cher : regarde tes recettes.', until: (s) => s.roles.logistics }],
  },
  {
    id: 'iii-titane', act: 3, label: 'Produire en titane', check: (s) => hasMat(s, 4),
    help: [
      { tab: 'rd', target: rd('mat:4'), text: 'Le titane exige frappes et taraudages semi-automatiques.', until: (s) => s.research.materials[4] },
      { tab: 'atelier', target: mat(4), text: 'Passe une usine en titane.', until: (s) => hasMat(s, 4) },
    ],
  },
  {
    id: 'iii-controller', act: 3, label: 'Recruter le contrôleur de gestion', check: (s) => s.roles.controller,
    help: [{ tab: 'equipe', target: role('controller'), text: 'Lui, il te dit ce que tu gagnes vraiment. Et ce que tu perds quand tu dors.', until: (s) => s.roles.controller }],
  },
  {
    id: 'iii-million', act: 3, label: 'Un million d’écrous', check: (s) => s.stats.produced >= 1e6,
    help: [{ target: 'scene', text: 'Un million. Laisse tourner, et pense aux goulots.' }],
  },
  {
    id: 'iii-goal', act: 3, goal: true, label: 'Tenir 50 % du marché national pendant 30 s', check: shareGoal,
    help: [{ target: 'sel:#obj', text: 'Le pays entier. Après, le monde.' }],
  },
  // ---------------------------------------------------------------- Acte IV
  {
    id: 'iv-carbide', act: 4, label: 'Produire en carbure', check: (s) => hasMat(s, 5),
    help: [
      { tab: 'rd', target: rd('mat:5'), text: 'Le carbure exige des robots à la frappe et au taraudage.', until: (s) => s.research.materials[5] },
      { tab: 'atelier', target: mat(5), text: 'Passe une usine en carbure.', until: (s) => hasMat(s, 5) },
    ],
  },
  {
    id: 'iv-twelve', act: 4, label: 'Douze usines', check: (s) => s.factories.length >= 12,
    help: [{ tab: 'atelier', target: 'act:buy-factory', text: 'Le monde, c’est grand.', until: (s) => s.factories.length >= 12 }],
  },
  {
    id: 'iv-black', act: 4, label: 'Une usine dans le noir', check: (s) => s.factories.some((f) => f.lines.every((l) => l.slots.every((x) => !!x && x.tier === 4))),
    help: [{ tab: 'rd', target: rd('tier'), text: 'Une usine sans personne, sans lumière. Toute équipée en usine noire.' }],
  },
  {
    id: 'iv-wind', act: 4, label: 'Dix éoliennes', check: (s) => s.energy.wind >= 10,
    help: [{ tab: 'atelier', target: 'sel:[data-act="energy"][data-i="wind"]', text: 'Ça consomme, une usine mondiale.', until: (s) => s.energy.wind >= 10 }],
  },
  {
    id: 'iv-diamond', act: 4, label: 'Produire en diamant', check: (s) => hasMat(s, 6),
    help: [
      { tab: 'rd', target: rd('mat:6'), text: 'Le diamant synthétique. 3 000 € l’écrou.', until: (s) => s.research.materials[6] },
      { tab: 'atelier', target: mat(6), text: 'Il ne s’usine qu’en usine noire.', until: (s) => hasMat(s, 6) },
    ],
  },
  {
    id: 'iv-goal', act: 4, goal: true, label: 'Racheter Ferrum Industries (2 milliards)', check: (s) => s.ended,
    help: [
      { target: 'sel:#obj', text: 'Deux milliards. Et l’usine de ton grand-père revient à la famille.' },
      { tab: 'marche', target: 'act:buyout', text: 'Le rachat se signe ici.' },
    ],
  },
];

/** Nombre de quêtes actives à la fois (hors objectif de l'acte). */
export const ACTIVE_QUESTS = 3;

export function questsOf(act: number): Quest[] {
  return QUESTS.filter((q) => q.act === act);
}

/** Quêtes actives : les premières non faites de l'acte, puis l'objectif. */
export function activeQuests(s: GameState): Quest[] {
  const list = questsOf(s.act);
  const open = list.filter((q) => !q.goal && !s.milestones[q.id]).slice(0, ACTIVE_QUESTS);
  const goal = list.find((q) => q.goal && !s.milestones[q.id]);
  return goal ? [...open, goal] : open;
}

/** Récompense d'une quête : quelques secondes de marché, ou un niveau d'outillage offert. */
export function questReward(q: Quest): { money: number; tool: boolean } {
  const r = QUEST_REWARD[q.id];
  if (r === undefined || q.goal) return { money: 0, tool: false };
  if (r === 'tool') return { money: 0, tool: true };
  return { money: Math.round(r * ACTS[Math.min(q.act, 4)].market), tool: false };
}

/** Poste et palier les moins outillés parmi les machines en service (cible de l'outillage offert). */
export function freeToolTarget(s: GameState): { tier: number; station: number } | null {
  let best: { tier: number; station: number; lvl: number } | null = null;
  for (const f of s.factories) for (const l of f.lines) l.slots.forEach((m, st) => {
    if (!m || m.tier > s.research.tier) return;
    const lvl = s.tooling[m.tier][st];
    if (lvl >= TOOL_MAX) return;
    if (!best || lvl < best.lvl) best = { tier: m.tier, station: st, lvl };
  });
  return best ? { tier: (best as { tier: number }).tier, station: (best as { station: number }).station } : null;
}
