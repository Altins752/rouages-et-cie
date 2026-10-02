/** Info-bulles au survol des postes, des ouvriers et des halls. Le détail dépend des rôles recrutés. */
import { G } from '../game';
import type { Hover } from '../render/scene';
import { stationCapacities } from '../sim/analysis';
import { specBonus } from '../sim/formulas';
import { $, esc } from './dom';
import { fmtP, pct } from './format';
import { LEVEL_NAMES, MACHINE_NAMES, MATERIAL_NAMES, STATION_NAMES, TIER_NAMES, UNIT_WORD } from './text';

const row = (a: string, b: string) => `<div class="row"><span>${a}</span><span>${b}</span></div>`;

export function tooltipHtml(h: Hover): string {
  const s = G.s;
  const c = s.chains[h.hall];
  if (!c) return '';
  if (h.worker >= 0) {
    const w = s.workers.find((x) => x.id === h.worker);
    if (!w) return '';
    const what =
      w.state === 'work' ? `travaille : ${STATION_NAMES[w.ts].toLowerCase()}` :
      w.state === 'walk' ? `marche vers : ${STATION_NAMES[w.ts].toLowerCase()}` :
      w.state === 'train' ? 'en formation' : 'attend une pièce';
    let html = `<b>${esc(w.name)}</b>${row(LEVEL_NAMES[w.level], what)}`;
    if (s.roles.hr) {
      html += row('Moral', pct(w.morale)) + row('Occupation', pct(w.load));
      const sp = [0, 1, 2, 3].map((si) => specBonus(w, si));
      const best = sp.indexOf(Math.max(...sp));
      if (sp[best] > 0) html += row('Spécialité', `${STATION_NAMES[best].toLowerCase()} +${Math.round(sp[best] * 100)} %`);
    }
    if (s.roles.foreman && w.home >= 0) html += row('Poste attitré', STATION_NAMES[w.home].toLowerCase());
    return html;
  }
  if (h.station < 0) {
    const tiers = c.stations.map((st) => TIER_NAMES[st.tier][0]).join(' · ');
    const broken = c.stations.reduce((a, st) => a + st.units.filter((u) => u.broken).length, 0);
    const ws = s.workers.filter((x) => x.chain === h.hall).length;
    return `<b>Chaîne ${h.hall + 1}</b>${row('Matériau', MATERIAL_NAMES[c.material].toLowerCase())}${row('Paliers', tiers)}${row('Ouvriers', String(ws))}${broken ? row('Pannes', `<span style="color:#ff6b5a">${broken}</span>`) : ''}<div style="margin-top:4px;color:#a99f86">Double-clic pour l’afficher</div>`;
  }
  const st = c.stations[h.station];
  let html = `<b>${STATION_NAMES[h.station]}</b>${row(MACHINE_NAMES[st.tier][h.station], TIER_NAMES[st.tier].toLowerCase())}`;
  html += row(UNIT_WORD(st.tier, true), `${st.units.length}/4${st.tool ? ` · outillage ${st.tool}` : ''}`);
  if (h.station > 0) html += row('Pièces en attente', String(c.buf[h.station]));
  if (s.roles.foreman) html += row('Cadence du poste', `${fmtP(stationCapacities(s, c)[h.station])}/s`);
  if (h.unit >= 0) {
    const u = st.units[h.unit];
    if (u) {
      const state = u.broken ? (u.service > 0 ? `réparation ${Math.ceil(u.service)} s` : 'en panne') : u.service > 0 ? `révision ${Math.ceil(u.service)} s` : u.busy ? 'en marche' : 'en veille';
      html += row(`N°${h.unit + 1}`, state);
      if (st.tier > 0 && s.roles.supervisor) {
        const col = u.wear > 0.7 ? '#ff5a4a' : u.wear > 0.5 ? '#ffb02e' : '#57d987';
        html += row('Usure', pct(u.wear)) + `<div class="bar"><i style="width:${(u.wear * 100).toFixed(0)}%;background:${col}"></i></div>`;
      }
    }
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
