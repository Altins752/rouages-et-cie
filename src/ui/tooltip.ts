/** Info-bulles au survol des postes, des ouvriers et des halls. Le détail dépend des rôles recrutés. */
import { CARRY_TIME, TIER_OPERATOR_LEVEL, TRAINING } from '../data/balance';
import { G } from '../game';
import type { Hover } from '../render/scene';
import { estimateFactory } from '../sim/analysis';
import { conveyorActive, salaryOf } from '../sim/engine';
import { skill } from '../sim/formulas';
import { $, esc } from './dom';
import { fmtP, pct } from './format';
import { KIND_NAMES, TRAIT_DESC, TRAIT_NAMES, LEVEL_NAMES, MACHINE_NAMES, MATERIAL_NAMES, STATION_NAMES, TIER_NAMES, TIER_SHORT } from './text';

const row = (a: string, b: string) => `<div class="row"><span>${a}</span><span>${b}</span></div>`;

export function tooltipHtml(h: Hover): string {
  const s = G.s;
  const f = s.factories[h.hall];
  if (!f) return '';
  if (h.worker >= 0) {
    const w = s.workers.find((x) => x.id === h.worker);
    if (!w) return '';
    const what =
      w.state === 'work' ? (w.kind === 'crank' ? 'tourne la manivelle' : `travaille : ${STATION_NAMES[w.kind === 'post' ? w.station : w.ts]?.toLowerCase() ?? ''}`) :
      w.state === 'walk' ? 'se déplace' :
      w.state === 'carry' ? `porte une pièce (${CARRY_TIME} s)` :
      w.rest > 0 ? 'souffle un peu' : 'attend une pièce';
    let html = `<b>${esc(w.name)}</b>${row(LEVEL_NAMES[w.level], what)}`;
    html += row(KIND_NAMES[w.kind], w.kind === 'crank' ? `chaîne ${w.line + 1}` : w.kind === 'post' ? `${STATION_NAMES[w.station].toLowerCase()}, chaîne ${w.line + 1}` : 'tous postes');
    if (w.kind !== 'crank') html += row('Formations', `${w.trainings}/${TRAINING.perLevel} · cadence ×${fmtP(skill(w))}`);
    if (w.trait) html += row('Caractère', `${TRAIT_NAMES[w.trait]} : ${TRAIT_DESC[w.trait]}`);
    html += row('Salaire', `${fmtP(salaryOf(w))} €/s`);
    if (s.roles.hr) html += row('Moral', pct(w.morale)) + row('Occupation', pct(w.load));
    return html;
  }
  if (h.line < 0) {
    const n = f.lines.reduce((a, l) => a + l.slots.filter(Boolean).length, 0);
    const broken = f.lines.reduce((a, l) => a + l.slots.filter((m) => m && m.broken).length, 0);
    const ws = s.workers.filter((x) => x.factory === h.hall).length;
    return `<b>Usine ${h.hall + 1}</b>${row('Matériau', MATERIAL_NAMES[f.material].toLowerCase())}${row('Postes', `${n}/16`)}${row('Ouvriers', String(ws))}${broken ? row('Pannes', `<span style="color:#ff6b5a">${broken}</span>`) : ''}${s.factories.length > 1 ? '<div style="margin-top:4px;color:#a99f86">Double-clic pour l’afficher</div>' : ''}`;
  }
  const line = f.lines[h.line];
  if (h.station === -2 || h.station < 0) {
    let html = `<b>Chaîne ${h.line + 1}</b>${row('Postes', `${line.slots.filter(Boolean).length}/4`)}${row('Écrous produits', String(line.produced))}`;
    html += row('Convoyeur', line.conveyor ? (conveyorActive(s, line) ? 'en marche' : line.crank < 0 ? 'personne à la manivelle' : 'à l’arrêt') : 'aucun : pièces portées à la main');
    return html;
  }
  const m = line.slots[h.station];
  if (!m) return `<b>${STATION_NAMES[h.station]} · chaîne ${h.line + 1}</b>${row('Emplacement libre', 'à acheter (Atelier)')}`;
  let html = `<b>${STATION_NAMES[h.station]} · chaîne ${h.line + 1}</b>${row(MACHINE_NAMES[m.tier][h.station], TIER_NAMES[m.tier].toLowerCase())}`;
  html += row('Outillage', `${s.tooling[m.tier][h.station]}/50 (${TIER_SHORT[m.tier]})`);
  if (h.station > 0) html += row('Pièces en attente', String(line.buf[h.station]));
  if (m.tier < 3) {
    const w = m.post >= 0 ? s.workers.find((x) => x.id === m.post) : undefined;
    html += row('Titulaire', w ? `${esc(w.name)}${w.level < TIER_OPERATOR_LEVEL[m.tier] ? ` <span style="color:#ffb02e">(doit être ${LEVEL_NAMES[TIER_OPERATOR_LEVEL[m.tier]].toLowerCase()})</span>` : ''}` : '<span style="color:#ffd84a">vacant</span>');
  }
  if (s.roles.foreman) {
    const e = estimateFactory(s, h.hall);
    html += row('Cadence du poste', `${fmtP(e.rate[h.line][h.station])}/s${e.lineBottleneck[h.line] === h.station ? ' · goulot' : ''}`);
  }
  const state = m.broken ? (m.service > 0 ? `réparation ${Math.ceil(m.service)} s` : 'en panne') : m.service > 0 ? `révision ${Math.ceil(m.service)} s` : m.busy ? 'en marche' : 'en veille';
  html += row('État', state);
  if (m.tier > 0 && s.roles.supervisor) {
    const col = m.wear > 0.7 ? '#ff5a4a' : m.wear > 0.5 ? '#ffb02e' : '#57d987';
    html += row('Usure', pct(m.wear)) + `<div class="bar"><i style="width:${(m.wear * 100).toFixed(0)}%;background:${col}"></i></div>`;
  }
  return html;
}

let lastKey = '';
export function showTooltip(h: Hover | null, px: number, py: number): void {
  const el = $('tip');
  if (!h) {
    el.classList.remove('show');
    lastKey = '';
    return;
  }
  const html = tooltipHtml(h);
  if (!html) {
    el.classList.remove('show');
    return;
  }
  if (html !== lastKey) {
    el.innerHTML = html;
    lastKey = html;
  }
  el.classList.add('show');
  const stage = $('stage').getBoundingClientRect();
  const w = el.offsetWidth;
  const hh = el.offsetHeight;
  let x = px + 16;
  let y = py + 16;
  if (x + w > stage.width - 8) x = px - w - 12;
  if (y + hh > stage.height - 8) y = py - hh - 12;
  el.style.left = `${Math.max(6, x)}px`;
  el.style.top = `${Math.max(6, y)}px`;
}
