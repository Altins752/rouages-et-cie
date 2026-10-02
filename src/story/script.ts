/**
 * Histoire : messages télex déclenchés par des paliers (jamais par chronomètre,
 * sauf l'échéance du prologue). Ton chaleureux et familial, une pointe de mélancolie.
 */
import { ACTS, MATERIALS } from '../data/balance';
import { bottleneckOf } from '../sim/analysis';
import type { GameState, SimEvent } from '../sim/types';
import { fmt } from '../ui/format';
import { MATERIAL_NAMES, STATION_NAMES } from '../ui/text';

export interface Msg {
  from: string;
  text: string;
}

export interface Beat {
  id: string;
  when: (s: GameState) => boolean;
  msgs: (s: GameState) => Msg[];
}

const BANK = 'Banque Populaire du Quartier';
const MARCEL = 'Marcel';
const NOTE = 'Carnet du grand-père';
const FERRUM = 'Ferrum Industries';
const CCI = 'Chambre de commerce';
const GRID = 'Réseau électrique';
const BOURSE = 'Bourse de Paris';

const m = (from: string, text: string): Msg => ({ from, text });
const market = (a: number) => fmt(ACTS[a].market);
const half = (a: number) => fmt(ACTS[a].market / 2);
const working = (s: GameState) => s.workers.filter((w) => w.state !== 'train').length;

export const BEATS: Beat[] = [
  // ------------------------------------------------------------- Prologue
  {
    id: 'intro',
    when: (s) => s.act === 0,
    msgs: () => [
      m(BANK, 'Madame, Monsieur,\nvous héritez de la forge de votre grand-père, de 20 € d’économies… et de sa dette : 800 €, à rembourser sous 20 minutes.\nLe remboursement se fait depuis l’onglet Marché.'),
      m(MARCEL, 'Je travaillais déjà pour votre grand-père.\nJe peux faire les écrous tout seul, mais ça prend du temps : découpe, frappe, taraudage, contrôle, et je marche d’un établi à l’autre.\nAvec d’autres ouvriers, on irait bien plus vite (onglet Équipe).'),
      m(NOTE, '« Une forge, ça ne se lit pas dans un livre de comptes. Ça se lit aux tas de pièces : là où ça s’entasse, c’est là que ça coince. »'),
    ],
  },
  {
    id: 'firstHire',
    when: (s) => s.act === 0 && s.workers.length >= 2,
    msgs: (s) => [m(MARCEL, `Bienvenue à ${s.workers[1].name}.\nChacun prend la tâche la plus avancée qu’il trouve et préfère rester à son établi. Vous n’avez rien à leur dire : ils se débrouillent.`)],
  },
  {
    id: 'bottleneck',
    when: (s) => s.act <= 1 && !s.roles.foreman && s.workers.length >= 3 && s.chains[0].buf.some((b) => b >= 6),
    msgs: (s) => {
      const b = bottleneckOf(s, s.chains[0]);
      return [m(MARCEL, `Regardez le tas devant la ${STATION_NAMES[b].toLowerCase()} : les pièces attendent.\nC’est là que ça coince. Un établi de plus ou un meilleur outillage à ce poste, et toute la ligne avance plus vite.`)];
    },
  },
  {
    id: 'tooling',
    when: (s) => s.act === 0 && s.money >= 40 && s.chains[0].stations.every((st) => st.tool === 0),
    msgs: () => [m(NOTE, '« Un bon outil vaut un ouvrier de plus. Affûter la scie, changer la matrice : un quart de temps gagné à chaque pièce. »\n(Outillage, onglet Atelier.)')],
  },
  {
    id: 'halfway',
    when: (s) => s.act === 0 && s.debt > 0 && s.due - s.t < 600 && s.due - s.t > 0 && s.stats.actEnd.length === 0,
    msgs: (s) => [m(BANK, `Rappel : il vous reste 10 minutes pour rembourser ${fmt(s.debt)} €.\nVous pouvez rembourser par morceaux depuis l’onglet Marché.`)],
  },
  // ------------------------------------------------------------- Acte I
  {
    id: 'act1',
    when: (s) => s.act === 1,
    msgs: () => [
      m(BANK, 'Dette soldée. La forge vous appartient.\nAu passage : Ferrum Industries détient 100 % du marché de la ville. C’est elle qui a racheté l’usine de votre grand-père, il y a trente ans.'),
      m(CCI, `Marché de la ville : ${market(1)} € de ventes par seconde, presque tout pour Ferrum.\nObjectif : en prendre la moitié (${half(1)} €/s) et la tenir 30 secondes.`),
      m(MARCEL, 'On a de quoi viser la ville, patron.\nLe bureau d’études ouvre (onglet R&D) : des machines, de nouveaux métaux. Et un contremaître nous dirait enfin où ça coince (onglet Équipe).'),
    ],
  },
  {
    id: 'mechResearch',
    when: (s) => s.act >= 1 && s.research.tier >= 1 && s.chains.every((c) => c.stations.every((st) => st.tier === 0)),
    msgs: () => [m(MARCEL, 'Les machines mécaniques sont trois fois plus rapides, mais il faut des opérateurs formés pour les conduire.\nModernisez d’abord le poste qui coince.')],
  },
  {
    id: 'needOperator',
    when: (s) => s.chains.some((c, ci) => c.stations.some((st) => st.tier === 1) && !s.workers.some((w) => w.chain === ci && w.level >= 2)),
    msgs: () => [m(MARCEL, 'Patron, personne ne sait conduire la nouvelle machine.\nIl faut former un opérateur (onglet Équipe) : 30 secondes d’école, et il revient.')],
  },
  {
    id: 'foremanHint',
    when: (s) => s.act === 1 && !s.roles.foreman && s.actT > 90,
    msgs: () => [m(MARCEL, 'Un contremaître, ce serait bien. Il afficherait la cadence de chaque poste et désignerait le goulot.\nEt il donnerait un poste à chacun : moins de marche, plus de pièces.')],
  },
  {
    id: 'secondChain',
    when: (s) => s.act >= 1 && s.chains.length >= 2,
    msgs: () => [m(NOTE, '« Deux lignes, c’est deux fois plus de soucis. Mais c’est aussi deux fois plus d’écrous. »')],
  },
  {
    id: 'laiton',
    when: (s) => s.research.materials[2] && s.act <= 2,
    msgs: () => [m(MARCEL, 'Le laiton se vend 18 €, six fois la fonte.\nMais il faut des machines à la frappe et au taraudage : à la main, on l’abîme.')],
  },
  // ------------------------------------------------------------- Acte II
  {
    id: 'act2',
    when: (s) => s.act === 2,
    msgs: (s) => [
      m(CCI, `Bienvenue dans la région. Marché : ${market(2)} € par seconde.\nObjectif : la moitié, soit ${half(2)} €/s, tenue 30 secondes.`),
      m(MARCEL, `Nouvelle usine, tout est à refaire. Mais on sait faire, maintenant.\nVos recherches nous ont suivis, et ${s.knowHow.points > 0 ? 'notre savoir-faire aussi (onglet R&D).' : 'le métier aussi.'}\nIci, il faudra penser aux gens : le moral compte. Et les machines s’usent.`),
    ],
  },
  {
    id: 'firstBreak',
    when: (s) => s.stats.breakdowns >= 1,
    msgs: () => [m(MARCEL, 'Une machine est tombée en panne. Elle fume, là-bas.\nOn appelle la maintenance (onglet Atelier) : c’est jamais refusé, quitte à s’endetter. Une révision avant la panne coûte moins cher.')],
  },
  {
    id: 'morale',
    when: (s) => s.act >= 2 && s.workers.some((w) => w.morale < 0.55),
    msgs: () => [m(MARCEL, 'Les gars du goulot sont rincés. Toujours en train de courir, jamais une pause.\nUn ouvrier épuisé travaille moins vite. Une cantine, ou quelqu’un de plus au poste qui coince, et ça repart.')],
  },
  {
    id: 'energy',
    when: (s) => s.act >= 2 && s.flow.energy > 3,
    msgs: () => [m(GRID, 'Votre consommation augmente. Le réseau facture 0,04 € le kW·s.\nUne machine en veille consomme encore 30 %. Panneaux solaires, éoliennes et batteries sont disponibles (onglet Atelier, section Énergie).')],
  },
  {
    id: 'contracts',
    when: (s) => s.act >= 2 && s.spot.length > 0,
    msgs: () => [m(CCI, 'Des clients de Ferrum frappent à votre porte : des contrats arrivent (onglet Marché).\nUn contrat accepté met des pièces de côté. Livrez avant l’échéance, sinon votre réputation en pâtit.')],
  },
  {
    id: 'semiauto',
    when: (s) => s.research.tier >= 2,
    msgs: () => [m(MARCEL, 'Le semi-automatique va vite, très vite. Mais il faut des régleurs : deux minutes de formation et 800 € chacun.\nEt ça consomme, ces bêtes-là.')],
  },
  // ------------------------------------------------------------- Acte III
  {
    id: 'act3',
    when: (s) => s.act === 3,
    msgs: () => [
      m(CCI, `Le pays tout entier : ${market(3)} € par seconde.\nTenez la moitié du marché (${half(3)} €/s) 30 secondes et la Bourse vous ouvre ses portes.`),
      m(MARCEL, 'Ça devient grand, patron. Trop grand pour tout voir d’ici.\nIl va nous falloir des bureaux : logistique, commerciaux, contrôleur de gestion. Ils verront ce qu’on ne voit plus.'),
    ],
  },
  {
    id: 'robots',
    when: (s) => s.research.tier >= 3,
    msgs: () => [m(MARCEL, 'Les robots, maintenant.\nIls n’ont besoin de personne… sauf d’un technicien par chaîne. Les autres, il faudra les reconvertir ou s’en séparer.\nVotre grand-père n’a jamais licencié personne. Je dis ça comme ça.')],
  },
  {
    id: 'titane',
    when: (s) => s.research.materials[4],
    msgs: () => [m(NOTE, '« Le jour où on fera des écrous en titane, on sera devenus quelqu’un. » Il l’avait écrit en 1974.')],
  },
  // ------------------------------------------------------------- Acte IV
  {
    id: 'act4',
    when: (s) => s.act === 4,
    msgs: () => [
      m(BOURSE, 'Introduction en Bourse réussie. Rouages & Cie est désormais un groupe industriel mondial.'),
      m(FERRUM, 'Ferrum Industries vous adresse ses félicitations.\nNous vous proposons de racheter Rouages & Cie. Notre offre est généreuse.'),
      m(MARCEL, 'Ils veulent nous racheter. Comme ils ont racheté l’usine de votre grand-père.\nOn pourrait faire l’inverse, non ? Il faudrait réunir 1,5 milliard.'),
    ],
  },
  {
    id: 'blackResearch',
    when: (s) => s.research.tier >= 4,
    msgs: () => [m(MARCEL, 'L’usine noire. Pas de lumière, pas de chauffage, personne. Elle tourne dans le noir.\nC’est beau, et ça me serre le cœur.')],
  },
  {
    id: 'diamond',
    when: (s) => s.research.materials[6],
    msgs: () => [m(NOTE, '« Un écrou en diamant ? Et pourquoi pas en or, tant qu’on y est ! » Il riait en l’écrivant. Il aurait aimé voir ça.')],
  },
  {
    id: 'buyoutReady',
    when: (s) => s.act === 4 && s.market.goalReached,
    msgs: () => [m(MARCEL, 'On a la somme, patron. 1,5 milliard.\nQuand vous voulez, on rachète Ferrum (onglet Marché). Et l’usine de votre grand-père avec.')],
  },
  // ------------------------------------------------------------- Bac à sable
  {
    id: 'sandbox',
    when: (s) => s.act === 5,
    msgs: () => [m(MARCEL, 'Le monde entier, sans plafond. Faites-en ce que vous voulez.\nEt quand l’envie vous prend, un nouveau site repart de zéro avec tout notre savoir-faire (onglet Marché).')],
  },
];

/** Messages liés aux événements de la simulation. */
export function eventMsgs(s: GameState, e: SimEvent): Msg[] {
  switch (e.type) {
    case 'deadline':
      return [m(BANK, `Échéance dépassée. Votre dette est majorée de 10 % : ${fmt(e.debt)} €.\nNous vous accordons 10 minutes supplémentaires.`)];
    case 'goal':
      if (s.act === 4) return [];
      return [m(CCI, goalText(s.act))];
    case 'ferrum':
      if (e.event === 'poach')
        return [m(FERRUM, e.name ? `${e.name} a accepté notre offre d’embauche. Nous payons mieux.\nSans rancune.` : 'Nous recrutons dans votre région. Nos salaires sont meilleurs.'), m(MARCEL, 'Ferrum débauche nos gens. Ça veut dire qu’on leur fait peur.')];
      if (e.event === 'war') return [m(FERRUM, 'Ferrum Industries baisse ses prix de 15 % pendant 5 minutes.\nVos clients suivront le prix le plus bas.'), m(MARCEL, 'Guerre des prix. Nos écrous se vendront moins cher un moment. On tient bon.')];
      return [m(FERRUM, 'Votre client principal a signé un contrat exclusif avec nous. Votre contrat long terme est résilié.')];
    case 'gridCut':
      return [m(GRID, 'Trésorerie négative : le réseau coupe votre alimentation.\nVos machines tournent au ralenti sur le renouvelable. Les établis ne sont pas touchés.')];
    default:
      return [];
  }
}

function goalText(act: number): string {
  if (act === 1) return 'La moitié de la ville achète vos écrous. Ferrum recule.\nLa ville est trop petite pour vous : un terrain vous attend dans la région (onglet Marché, « Déménager »).';
  if (act === 2) return 'La région est conquise.\nLe pays vous tend les bras : un grand site industriel est à vendre (onglet Marché, « Déménager »).';
  if (act === 3) return 'Vous tenez la moitié du marché national. La Bourse vous attend.\nDéménagez vers un site mondial (onglet Marché) pour l’introduction en Bourse.';
  return '';
}

// ------------------------------------------------------------- Contrôle de gestion

export const REPORT_PERIOD = 180;

/** Rapport périodique du contrôleur de gestion, avec ses alertes. */
export function controllerReport(s: GameState): Msg {
  const f = s.flow;
  const costs = f.raw + f.salaries + Math.max(0, f.energy) + f.maintenance;
  const net = f.revenue + f.contracts - costs;
  const lines = [`Recettes ${fmt(f.revenue + f.contracts)} €/s · charges ${fmt(costs)} €/s · bénéfice ${net >= 0 ? '' : '−'}${fmt(Math.abs(net))} €/s.`];
  const alerts: string[] = [];
  const broken = s.chains.reduce((a, c) => a + c.stations.reduce((b, st) => b + st.units.filter((u) => u.broken).length, 0), 0);
  if (broken) alerts.push(`${broken} machine${broken > 1 ? 's' : ''} en panne.`);
  if (net < 0) alerts.push('Nous perdons de l’argent : chaque seconde coûte.');
  if (costs > 0 && f.energy / costs > 0.25) alerts.push('L’énergie pèse plus d’un quart des charges : pensez au renouvelable.');
  const h5 = s.history.h5;
  if (h5.length && h5[h5.length - 1][16] < 0.5 && s.act >= 2) alerts.push('Le moral moyen est sous 50 % : la cadence baisse.');
  if (h5.length && h5[h5.length - 1][17] > 0.45) alerts.push('Près de la moitié des machines attendent : du gaspillage d’électricité et d’usure.');
  if (s.spot.some((c) => c.accepted && c.deadline - s.t < 90 && c.delivered < c.qty)) alerts.push('Un contrat arrive à échéance dans moins de 90 secondes.');
  if (s.money < 0) alerts.push('Trésorerie négative : le réseau électrique est coupé.');
  lines.push(alerts.length ? `Alertes :\n– ${alerts.join('\n– ')}` : 'Aucune alerte.');
  return m('Contrôle de gestion', lines.join('\n'));
}

// ------------------------------------------------------------- Fin

export function endingMsgs(s: GameState): Msg[] {
  const warm = s.ending !== 'bitter';
  return [
    m('Notaire', 'Le rachat de Ferrum Industries est signé.\nL’usine historique de votre grand-père vous revient.'),
    warm
      ? m(MARCEL, 'J’ai rallumé les lumières de la vieille forge.\nLes anciens sont venus, ceux qu’on a reconvertis aussi. Tout le monde est là.\nVotre grand-père aurait été fier. Pas de l’argent. De ça.')
      : m(MARCEL, 'J’ai rallumé les lumières de la vieille forge.\nJe suis venu seul. Les autres sont partis, au fil des robots.\nVotre grand-père aurait été fier de l’usine. Moins de la route.'),
    m(NOTE, '« Faire, puis faire faire, puis savoir s’arrêter de compter. » Dernière page du carnet.'),
  ];
}

// ------------------------------------------------------------- Jalons

export interface Milestone {
  id: string;
  act: number;
  label: string;
  check: (s: GameState) => boolean;
  /** Récompense en € (fonction de l'état au moment où le jalon est atteint). */
  reward: (s: GameState) => number;
}

const pctMarket = (k: number) => (s: GameState) => Math.round(ACTS[Math.min(s.act, 4)].market * k);

export const MILESTONES: Milestone[] = [
  { id: 'p-first', act: 0, label: 'Premier écrou vendu', check: (s) => s.stats.sold >= 1, reward: () => 5 },
  { id: 'p-team', act: 0, label: 'Quatre ouvriers à l’atelier', check: (s) => working(s) >= 4, reward: () => 15 },
  { id: 'p-tool', act: 0, label: 'Premier outillage', check: (s) => s.chains[0].stations.some((st) => st.tool > 0), reward: () => 10 },
  { id: 'p-full', act: 0, label: 'Un poste à quatre établis', check: (s) => s.chains[0].stations.some((st) => st.units.length >= 4), reward: () => 25 },
  { id: 'i-machine', act: 1, label: 'Première machine', check: (s) => s.chains.some((c) => c.stations.some((st) => st.tier >= 1)), reward: pctMarket(3) },
  { id: 'i-steel', act: 1, label: 'Premier écrou en acier', check: (s) => s.chains.some((c) => c.material >= 1), reward: pctMarket(2) },
  { id: 'i-share', act: 1, label: '25 % de la ville', check: (s) => s.act === 1 && s.market.shareEma >= 0.25, reward: pctMarket(5) },
  { id: 'i-1000', act: 1, label: 'Mille écrous produits', check: (s) => s.stats.produced >= 1000, reward: pctMarket(4) },
  { id: 'ii-semi', act: 2, label: 'Première machine semi-automatique', check: (s) => s.chains.some((c) => c.stations.some((st) => st.tier >= 2)), reward: pctMarket(4) },
  { id: 'ii-four', act: 2, label: 'Quatre chaînes', check: (s) => s.act === 2 && s.chains.length >= 4, reward: pctMarket(6) },
  { id: 'ii-contract', act: 2, label: 'Premier contrat livré', check: (s) => s.stats.contractsDone >= 1, reward: pctMarket(3) },
  { id: 'ii-green', act: 2, label: 'Première éolienne', check: (s) => s.energy.wind >= 1, reward: pctMarket(2) },
  { id: 'iii-robot', act: 3, label: 'Premier robot', check: (s) => s.chains.some((c) => c.stations.some((st) => st.tier >= 3)), reward: pctMarket(4) },
  { id: 'iii-titane', act: 3, label: 'Écrous en titane', check: (s) => s.chains.some((c) => c.material >= 4), reward: pctMarket(4) },
  { id: 'iii-staff', act: 3, label: 'Encadrement complet', check: (s) => Object.values(s.roles).every(Boolean), reward: pctMarket(5) },
  { id: 'iii-million', act: 3, label: 'Un million d’écrous', check: (s) => s.stats.produced >= 1e6, reward: pctMarket(5) },
  { id: 'iv-carbide', act: 4, label: 'Écrous en carbure', check: (s) => s.chains.some((c) => c.material >= 5), reward: (s) => Math.round(s.flow.revenue * 60) },
  { id: 'iv-twelve', act: 4, label: 'Douze chaînes', check: (s) => s.act === 4 && s.chains.length >= 12, reward: (s) => Math.round(s.flow.revenue * 60) },
  { id: 'iv-black', act: 4, label: 'Première chaîne dans le noir', check: (s) => s.chains.some((c) => c.stations.every((st) => st.tier === 4)), reward: (s) => Math.round(s.flow.revenue * 90) },
  { id: 'iv-green', act: 4, label: 'Dix éoliennes', check: (s) => s.energy.wind >= 10, reward: (s) => Math.round(s.flow.revenue * 30) },
  { id: 'iv-ten-million', act: 4, label: 'Dix millions d’écrous', check: (s) => s.stats.produced >= 1e7, reward: (s) => Math.round(s.flow.revenue * 60) },
  { id: 'iv-diamond', act: 4, label: 'Écrous en diamant', check: (s) => s.chains.some((c) => c.material >= 6), reward: (s) => Math.round(s.flow.revenue * 30) },
];

export const MATERIAL_COUNT = MATERIALS.length;
export const materialName = (i: number) => MATERIAL_NAMES[i];
