/**
 * Succès : de petits trophées dans le ton du jeu. La plupart se lisent dans l'état de la partie ;
 * quelques-uns sont déclenchés par l'interface (zone rouge, carte postale, absence).
 */
import { BUFFER_CAP, NIGHT, TOOL_MAX } from '../data/balance';
import { conveyorActive } from '../sim/engine';
import type { GameState } from '../sim/types';
import { questsOf } from './quests';

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  /** Absent : déclenché par l'interface. */
  check?: (s: GameState) => boolean;
}

const machines = (s: GameState) => s.factories.flatMap((f) => f.lines.flatMap((l) => l.slots));

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first', name: 'Premier écrou', desc: 'Vendre son premier écrou.', check: (s) => s.stats.sold >= 1 },
  { id: 'quick', name: 'Pressé', desc: 'Rembourser la dette en moins de 6 minutes de jeu.', check: (s) => (s.stats.actEnd[0] ?? Infinity) < 360 },
  { id: 'free', name: 'Libre !', desc: 'Rembourser la dette de la forge.', check: (s) => s.act >= 1 && s.debt <= 0 },
  { id: 'jam', name: 'Ça coince ici', desc: 'Laisser une pile de pièces se remplir. Regardez où ça coince.', check: (s) => s.factories.some((f) => f.lines.some((l) => l.buf.some((b) => b >= BUFFER_CAP))) },
  { id: 'red', name: 'Pied au plancher', desc: 'Pousser le compte-tours en zone rouge.' },
  { id: 'belt', name: 'Tapis roulant', desc: 'Quatre convoyeurs qui tournent dans une même usine.', check: (s) => s.factories.some((f) => f.lines.filter((l) => conveyorActive(s, l)).length >= 4) },
  { id: 'full', name: 'Plus de place', desc: 'Seize postes dans une même usine.', check: (s) => s.factories.some((f) => f.lines.every((l) => l.slots.every(Boolean))) },
  { id: 'taylor', name: 'Taylor serait fier', desc: 'Pousser un outillage au niveau 50.', check: (s) => s.tooling.some((t) => t.some((x) => x >= TOOL_MAX)) },
  { id: 'school', name: 'Formation continue', desc: 'Cent formations.', check: (s) => s.stats.trainings >= 100 },
  { id: 'tech', name: 'Du manœuvre au technicien', desc: 'Promouvoir un ouvrier jusqu’au niveau technicien.', check: (s) => s.workers.some((w) => w.level >= 4) },
  { id: 'mates', name: 'Ambiance d’atelier', desc: 'Trois bons camarades dans la même usine.', check: (s) => s.factories.some((_, fi) => s.workers.filter((w) => w.factory === fi && w.trait === 'mate').length >= 3) },
  { id: 'knife', name: 'Couteau suisse', desc: 'Six polyvalents dans une usine.', check: (s) => s.factories.some((_, fi) => s.workers.filter((w) => w.factory === fi && w.kind === 'poly' && w.name !== 'Marcel').length >= 6) },
  { id: 'carnet', name: 'Carnet complet', desc: 'Accomplir toutes les quêtes d’un acte.', check: (s) => [0, 1, 2, 3, 4].some((a) => questsOf(a).filter((q) => !q.goal).every((q) => s.milestones[q.id])) },
  { id: 'rush', name: 'Coup de bourre', desc: 'Livrer à temps une commande « coup de bourre ».' },
  { id: 'supplier', name: 'Fournisseur attitré', desc: 'Livrer cinquante commandes.', check: (s) => s.stats.contractsDone >= 50 },
  { id: 'owl', name: 'Couche-tard', desc: 'Une équipe de nuit au rendement maximal.', check: (s) => s.night.rate >= NIGHT.rate.max },
  { id: 'shifts', name: 'Les trois-huit', desc: 'Une équipe de nuit qui tient trois heures.', check: (s) => s.night.duration >= NIGHT.duration.max },
  { id: 'insomnia', name: 'Insomniaque', desc: 'Revenir avec plus d’un million d’euros de manque à gagner.' },
  { id: 'autopilot', name: 'Pilote automatique', desc: 'Confier une consigne à l’ingénieur méthodes.', check: (s) => s.roles.methods && s.methods.active },
  { id: 'robot', name: 'Bonjour, robot', desc: 'Installer un premier robot.', check: (s) => machines(s).some((m) => m && m.tier >= 3) },
  { id: 'dark', name: 'Lumières éteintes', desc: 'Une usine entière dans le noir.', check: (s) => s.factories.some((f) => f.lines.every((l) => l.slots.every((m) => !!m && m.tier === 4))) },
  { id: 'million', name: 'Un million', desc: 'Produire un million d’écrous.', check: (s) => s.stats.produced >= 1e6 },
  { id: 'diamond', name: 'Écrou de luxe', desc: 'Produire des écrous en diamant.', check: (s) => s.factories.some((f) => f.material >= 6) },
  { id: 'empire', name: 'Empire', desc: 'Seize usines.', check: (s) => s.factories.length >= 16 },
  { id: 'billion', name: 'Milliardaire', desc: 'Un milliard d’euros en caisse.', check: (s) => s.money >= 1e9 },
  { id: 'marcel', name: 'Marcel, jamais', desc: 'Racheter Ferrum sans avoir licencié personne.', check: (s) => s.ended && s.stats.laidOff === 0 },
  { id: 'bitter', name: 'Le prix du progrès', desc: 'Finir… avec plus de licenciements que de reconversions.', check: (s) => s.ended && s.ending === 'bitter' },
  { id: 'sandbox', name: 'Et maintenant ?', desc: 'Continuer en bac à sable après la fin.', check: (s) => s.act === 5 },
  { id: 'postcard', name: 'Souvenir', desc: 'Prendre une carte postale de son usine.' },
  { id: 'challenge-nofire', name: 'Patron au grand cœur', desc: 'Réussir le défi « Sans licencier ».' },
  { id: 'challenge-artisan', name: 'L’amour du travail bien fait', desc: 'Réussir le défi « L’artisan ».' },
  { id: 'challenge-chrono', name: 'Chronomètre en main', desc: 'Réussir le défi « Contre la montre ».' },
];
