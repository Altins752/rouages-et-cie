/**
 * Directeur d'histoire : déclenche les messages télex aux paliers et accorde les jalons.
 * Pur (aucun DOM) : utilisable par le jeu et par le simulateur.
 */
import type { GameState, SimEvent } from '../sim/types';
import { activeQuests, freeToolTarget, questReward } from './quests';
import { BEATS, REPORT_PERIOD, controllerReport, eventMsgs } from './script';
import type { Msg } from './script';

export interface StoryOut {
  msgs: Msg[];
  /** Quêtes accomplies ce tour-ci, avec leur récompense (argent ou outillage offert). */
  quests: { id: string; label: string; reward: number; tool: string }[];
}

/** Vérifie les paliers d'histoire et les jalons. Modifie `s.story` et accorde les récompenses. */
export function storyTick(s: GameState, events: SimEvent[] = []): StoryOut {
  const out: StoryOut = { msgs: [], quests: [] };
  for (const e of events) out.msgs.push(...eventMsgs(s, e));
  for (const b of BEATS) {
    if (s.story.seen[b.id] !== undefined) continue;
    if (!b.when(s)) continue;
    s.story.seen[b.id] = s.t;
    out.msgs.push(...b.msgs(s));
  }
  if (s.roles.controller) {
    const last = s.story.flags.report ?? -1;
    if (last < 0) s.story.flags.report = s.t;
    else if (s.t - last >= REPORT_PERIOD) {
      s.story.flags.report = s.t;
      out.msgs.push(controllerReport(s));
    }
  }
  // Quêtes actives : accomplies dès que leur condition est remplie (s.milestones garde les faites).
  for (const q of activeQuests(s)) {
    if (!q.check(s)) continue;
    s.milestones[q.id] = true;
    const r = questReward(q);
    let tool = '';
    if (r.tool) {
      const t = freeToolTarget(s);
      if (t) {
        s.tooling[t.tier][t.station]++;
        tool = `${t.tier}:${t.station}`;
      }
    }
    s.money += r.money;
    out.quests.push({ id: q.id, label: q.label, reward: r.money, tool });
  }
  return out;
}

/** Marque tous les paliers déjà franchis comme vus (partie chargée, bac à sable de test). */
export function silenceStory(s: GameState): void {
  for (const b of BEATS) if (b.when(s)) s.story.seen[b.id] = s.t;
}
