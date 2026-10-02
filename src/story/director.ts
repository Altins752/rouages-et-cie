/**
 * Directeur d'histoire : déclenche les messages télex aux paliers et accorde les jalons.
 * Pur (aucun DOM) : utilisable par le jeu et par le simulateur.
 */
import type { GameState, SimEvent } from '../sim/types';
import { BEATS, MILESTONES, eventMsgs } from './script';
import type { Msg } from './script';

export interface StoryOut {
  msgs: Msg[];
  milestones: { id: string; label: string; reward: number }[];
}

/** Vérifie les paliers d'histoire et les jalons. Modifie `s.story` et accorde les récompenses. */
export function storyTick(s: GameState, events: SimEvent[] = []): StoryOut {
  const out: StoryOut = { msgs: [], milestones: [] };
  for (const e of events) out.msgs.push(...eventMsgs(s, e));
  for (const b of BEATS) {
    if (s.story.seen[b.id] !== undefined) continue;
    if (!b.when(s)) continue;
    s.story.seen[b.id] = s.t;
    out.msgs.push(...b.msgs(s));
  }
  for (const ms of MILESTONES) {
    if (s.milestones[ms.id] || ms.act !== s.act) continue;
    if (!ms.check(s)) continue;
    s.milestones[ms.id] = true;
    const reward = Math.max(0, ms.reward(s));
    s.money += reward;
    out.milestones.push({ id: ms.id, label: ms.label, reward });
  }
  return out;
}

/** Marque tous les paliers déjà franchis comme vus (partie chargée, bac à sable de test). */
export function silenceStory(s: GameState): void {
  for (const b of BEATS) if (b.when(s)) s.story.seen[b.id] = s.t;
}
