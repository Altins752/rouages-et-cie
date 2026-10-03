/**
 * Carnet du grand-père : douze pages à collectionner, qui racontent la forge, Marcel et Ferrum.
 * Chaque page se débloque à une étape de la partie ; elles restent d'une partie à l'autre.
 */
import type { GameState } from '../sim/types';

export interface Page {
  id: string;
  title: string;
  /** Comment la trouver (affiché tant qu'elle est verrouillée). */
  hint: string;
  text: string;
  when: (s: GameState) => boolean;
}

const tier = (s: GameState, t: number) => s.factories.some((f) => f.lines.some((l) => l.slots.some((m) => m && m.tier >= t)));

export const PAGES: Page[] = [
  {
    id: 'forge', title: 'La forge, 1952', hint: 'Vendre un premier écrou.', when: (s) => s.stats.sold >= 1,
    text: 'J’ai ouvert la forge avec trois marteaux, un établi emprunté au voisin et une dette que je n’osais pas dire à ta grand-mère. Le premier écrou, je l’ai gardé dans ma poche pendant une semaine. Il était de travers. Je l’aimais quand même.',
  },
  {
    id: 'marcel', title: 'Le petit Marcel', hint: 'Pourvoir les quatre postes de la chaîne 1.', when: (s) => s.factories[0]?.lines[0]?.slots.every((m) => m && m.post >= 0) ?? false,
    text: 'Marcel est arrivé un lundi, à quatorze ans, avec des chaussures trop grandes. Il ne savait rien faire et voulait tout apprendre. Au bout d’un mois, il tenait la frappe mieux que moi. Ne le lui dis pas, il serait insupportable.',
  },
  {
    id: 'goulot', title: 'Là où ça coince', hint: 'Améliorer un premier outillage.', when: (s) => s.tooling.some((t) => t.some((x) => x > 0)),
    text: 'Mon père disait : « Regarde où ça s’entasse, petit. » Une chaîne avance au pas du plus lent. On peut courir partout, ça ne sert à rien tant qu’on n’a pas aidé celui qui coince. C’est vrai pour les machines. C’est vrai pour les gens.',
  },
  {
    id: 'dette', title: 'Payer ses dettes', hint: 'Rembourser la dette de la forge.', when: (s) => s.act >= 1,
    text: 'Le jour où j’ai remboursé la banque, j’ai fermé la forge à midi et on a mangé dehors, tous les six. Marcel a renversé le vin sur le directeur de l’agence, qui passait par là. On a ri jusqu’au soir.',
  },
  {
    id: 'ferrand', title: 'Ferrand père', hint: 'Bâtir une deuxième usine.', when: (s) => s.act >= 2 || s.factories.length >= 2,
    text: 'Ferrand est venu me voir en 1961, en costume, avec une voiture qui brillait trop. Il voulait m’acheter. J’ai dit non. Il a souri comme quelqu’un qui sait qu’il reviendra. Il est revenu.',
  },
  {
    id: 'machines', title: 'Les premières machines', hint: 'Moderniser une première machine.', when: (s) => tier(s, 1) || s.act >= 2,
    text: 'La première presse, je l’ai payée en quatre ans. Elle faisait le travail de trois hommes. Je n’ai renvoyé personne : on a fait trois fois plus d’écrous. C’est ce jour-là que j’ai compris ce que voulait dire « grandir ».',
  },
  {
    id: '1978', title: '1978', hint: 'Arriver dans la région (acte II).', when: (s) => s.act >= 2,
    text: 'Les commandes sont parties chez Ferrum, une par une. Moins cher, plus vite. En 1978, il a racheté l’usine pour une bouchée de pain. J’ai signé dans son bureau, sans lire. Marcel attendait dehors, il n’a rien dit. Il n’avait pas besoin.',
  },
  {
    id: 'gars', title: 'Les gars', hint: 'Promouvoir dix ouvriers dans une partie.', when: (s) => s.stats.promotions >= 10,
    text: 'Une usine, ce sont des mains. Lucien, qui chantait faux. Paulette, qui voyait un défaut à dix mètres. Le grand Ahmed, qui portait les barres comme des allumettes. On ne fait rien de bien sans apprendre aux autres ce qu’on sait.',
  },
  {
    id: 'nuit', title: 'La nuit à l’atelier', hint: 'Recruter une équipe de nuit.', when: (s) => s.night.rate >= 1,
    text: 'Certains soirs, je restais seul à l’atelier. J’aimais le bruit des machines qui refroidissent, le tic du métal. Ta grand-mère venait me chercher avec une lampe. Elle disait que je parlais aux établis. C’était vrai.',
  },
  {
    id: 'robots', title: 'Des bras de fer', hint: 'Installer un premier robot.', when: (s) => tier(s, 3) || s.act >= 4,
    text: 'On m’a montré un robot, une fois, dans un salon. Il ne se fatiguait jamais et ne rentrait jamais chez lui. J’ai pensé aux gars. Une machine, ça se décide. Ce qu’on fait des gens à côté, ça aussi, ça se décide.',
  },
  {
    id: 'monde', title: 'Le monde', hint: 'Arriver à l’acte IV.', when: (s) => s.act >= 4,
    text: 'Si tu lis ceci, c’est que tu es allé plus loin que moi. Ne te prends pas pour Ferrand. Les chiffres grossissent, les gens restent à la même taille. Garde-leur une place.',
  },
  {
    id: 'toi', title: 'Pour toi', hint: 'Racheter Ferrum Industries.', when: (s) => s.ended,
    text: 'Alors c’est fait. L’usine revient à la maison. Je ne sais pas où je suis quand tu lis ces lignes, mais je sais que Marcel a rallumé la forge. Merci, petit. Va voir les gars. Et garde-moi un écrou de travers.',
  },
];
