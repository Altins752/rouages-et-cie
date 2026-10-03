/** Contenu des onglets du panneau. Chaque vue renvoie du HTML stable et des valeurs à jour. */
import {
  ACTS, CONTRACTS, ENERGY, KNOW_HOW, LINES, MATERIALS, METHODS, NIGHT, POLY, RESEARCH_EXTRA, ROBOT_TIER, ROLES, ROLE_WARN_SHARE,
  TIER_COUNT, TIER_MIN_ACT, TIER_OPERATOR_LEVEL, TIER_RESEARCH, TOOL_MAX, TRAINING, WEAR,
} from '../data/balance';
import type { KnowHowId, RoleId } from '../data/balance';
import { G } from '../game';
import type { Tab } from '../game';
import * as A from '../sim/actions';
import { bestCandidate } from '../sim/advisor';
import { estimateFactory } from '../sim/analysis';
import type { FactoryEstimate } from '../sim/analysis';
import { conveyorActive, salaryOf } from '../sim/engine';
import {
  canPromote, canTrain, conveyorCost, knowHowCost, nightCost, nightDuration, nightRate, materialOk, priceMult, promotionCost, repLevel, skill, toolCost,
  toolSpeed, trainingCost,
} from '../sim/formulas';
import type { GameState, Worker } from '../sim/types';
import * as U from './actions';
import { esc } from './dom';
import { dur, fmt, fmtP, mmss, pct } from './format';
import type { View } from './panel';
import { dataView } from './data';
import { revenueRate } from './rates';
import {
  ACT_NAMES, KIND_NAMES, KNOW_HOW_DESC, KNOW_HOW_NAMES, LEVEL_NAMES, MACHINE_NAMES, MARKET_NAMES, MATERIAL_DESC,
  MATERIAL_NAMES, ROLE_DATA, ROLE_DECISION, ROLE_NAMES, STATION_ICONS, STATION_NAMES, STATION_ROLE, TIER_NAMES, TIER_SHORT,
} from './text';

const lock = '🔒';
const euros = (n: number) => `${fmt(n)} €`;

function factorySel(s: GameState): string {
  if (s.factories.length < 2) return '';
  let h = '<div class="seg" style="margin:4px 2px 10px" role="group" aria-label="Usine affichée">';
  s.factories.forEach((f, i) => {
    const broken = f.lines.some((l) => l.slots.some((m) => m && m.broken));
    h += `<button type="button" data-act="factory-sel" data-i="${i}" data-fk="fs${i}" class="${G.factory === i ? 'on' : ''}">Usine ${i + 1}${broken ? ' ⚠' : ''}</button>`;
  });
  return h + '</div>';
}


export function roleSalaries(s: GameState): number {
  return ROLES.reduce((a, r) => a + (s.roles[r.id] ? r.salary : 0), 0);
}

// ------------------------------------------------------------------ Conseil du superviseur

let recCache = { t: -1e9, key: '', factory: -1 };
function recommendation(s: GameState): { key: string; factory: number } {
  if (!s.roles.supervisor) return { key: '', factory: -1 };
  const now = performance.now();
  if (now - recCache.t < 2500) return recCache;
  recCache.t = now;
  const c = bestCandidate(s, 3600);
  recCache.key = '';
  recCache.factory = -1;
  if (c) {
    const st = c.steps.find((x) => x.kind !== 'hire' && x.kind !== 'material') ?? c.steps[0];
    recCache.factory = st.factory;
    if (st.kind === 'unit') recCache.key = `u${st.station}`;
    else if (st.kind === 'tool') recCache.key = `t${st.tier}${st.station}`;
    else if (st.kind === 'modernize') recCache.key = `m${st.station}`;
    else if (st.kind === 'conveyor') recCache.key = `cv${st.line}`;
    else if (st.kind === 'factory') recCache.key = 'factory';
    else if (st.kind === 'material') recCache.key = `mat${st.material}`;
    else if (st.kind === 'train') recCache.key = `tr${st.worker}`;
    else if (st.kind === 'poly') recCache.key = 'poly';
    else recCache.key = 'hire';
  }
  return recCache;
}

// ------------------------------------------------------------------ Estimation partagée (une par image)

let estCache: { t: number; s: GameState | null; f: number; e: FactoryEstimate | null } = { t: -1, s: null, f: -1, e: null };
function estimate(s: GameState, fi: number): FactoryEstimate {
  if (estCache.s !== s || estCache.t !== s.t || estCache.f !== fi || !estCache.e) estCache = { t: s.t, s, f: fi, e: estimateFactory(s, fi) };
  return estCache.e!;
}

// ------------------------------------------------------------------ Atelier

function vAtelier(s: GameState): View {
  const k: Record<string, string> = {};
  const d: Record<string, boolean> = {};
  const w: Record<string, number> = {};
  const eta: Record<string, number> = {};
  if (G.factory >= s.factories.length) G.factory = 0;
  const fi = G.factory;
  const f = s.factories[fi];
  const rec = recommendation(s);
  const recOn = (key: string) => rec.factory === fi && rec.key === key;
  const est = s.roles.foreman ? estimate(s, fi) : null;
  let sig = `A${fi}|${s.factories.length}|${f.material}|${s.act}|${s.roles.foreman ? 1 : 0}${s.roles.supervisor ? 1 : 0}|${s.research.tier}|${s.research.materials.join('')}|${rec.factory}${rec.key}|${s.energy.solar}${s.energy.wind}${s.energy.battery}`;
  let h = factorySel(s);
  h += `<div class="sec">Matériau<span>${MATERIAL_NAMES[f.material]} · ${fmtP(MATERIALS[f.material].price)} € la pièce</span></div><div class="seg" style="margin:0 2px 10px">`;
  MATERIALS.forEach((m, i) => {
    if (i > 0 && !s.research.materials[i] && s.act < m.act) return;
    const ok = materialOk(s, f, i);
    sig += ok ? 1 : 0;
    const why = !s.research.materials[i] ? 'à rechercher (R&D)' : `exige frappes et taraudages ${TIER_NAMES[m.minTier].toLowerCase()}s`;
    h += `<button type="button" data-act="mat" data-i="${i}" data-fk="mat${i}" class="${f.material === i ? 'on' : ''}${recOn(`mat${i}`) ? ' rec' : ''}" ${ok ? '' : `disabled title="${why}"`}>${MATERIAL_NAMES[i]}</button>`;
  });
  h += '</div>';
  if (s.act === 0 && s.stats.sold < 3) {
    h += '<div class="note">Marcel fait tout, seul : il marche d’un établi à l’autre. Embauchez (onglet Équipe) : chaque nouvel ouvrier prend un poste et n’en bouge plus. Regardez ensuite où les pièces s’accumulent.</div>';
  }
  // Chaînes
  h += `<div class="sec">Chaînes<span>${f.lines.filter((l) => l.slots.some(Boolean)).length}/${LINES} en service</span></div>`;
  f.lines.forEach((line, l) => {
    const n = line.slots.filter(Boolean).length;
    if (n === 0 && l > 0 && !f.lines[l - 1].slots.some(Boolean)) return;
    const active = conveyorActive(s, line);
    sig += `|L${l}${line.conveyor ? (line.crank >= 0 ? 'C' : 'c') : ''}${line.slots.map((m) => (m ? `${m.tier}${m.post >= 0 ? 'p' : 'v'}${m.broken ? (m.service > 0 ? 'r' : 'b') : m.service > 0 ? 's' : m.wear > 0.4 ? 'w' : 'o'}` : '-')).join('')}`;
    h += `<div class="card col"><div class="row"><div class="ic" aria-hidden="true">⛓️</div><div class="info"><div class="nm">Chaîne ${l + 1} <span class="tag" data-k="lt${l}"></span></div><div class="ef" data-k="lc${l}"></div></div></div><div class="units">`;
    line.slots.forEach((m, st) => {
      if (!m) {
        h += `<div class="unit empty">${STATION_NAMES[st]}</div>`;
        return;
      }
      const cls = m.broken ? 'broken' : m.service > 0 ? 'svc' : m.tier < ROBOT_TIER && m.post < 0 ? 'vac' : '';
      h += `<div class="unit ${cls}" title="${MACHINE_NAMES[m.tier][st]}"><span data-k="ul${l}${st}"></span>`;
      if (m.tier > 0) h += `<div class="w"><i data-w="w${l}${st}" style="background:${m.wear > 0.7 ? '#ff5a4a' : m.wear > 0.5 ? '#ffb02e' : '#57d987'}"></i></div>`;
      h += '</div>';
      const rate = est ? est.rate[l][st] : -1;
      const state = m.broken ? (m.service > 0 ? `répar. ${Math.ceil(m.service)} s` : 'en panne') : m.service > 0 ? `révision ${Math.ceil(m.service)} s` : m.tier < ROBOT_TIER && m.post < 0 ? 'vacant' : est ? (rate > 0 ? `${fmtP(rate)}/s` : 'arrêt') : TIER_SHORT[m.tier];
      k[`ul${l}${st}`] = `${STATION_NAMES[st].slice(0, 4)}. ${state}`;
      w[`w${l}${st}`] = s.roles.supervisor ? m.wear : 0;
    });
    h += '</div><div class="btns">';
    if (!line.conveyor && n >= 2 && line.slots.some((m) => m && m.tier < ROBOT_TIER)) {
      const cost = conveyorCost(f, l);
      h += `<button class="buy${recOn(`cv${l}`) ? ' rec' : ''}" type="button" data-hl="c:${fi}:${l}" data-act="conveyor" data-i="${l}" data-b="cv${l}" data-fk="cv${l}"><span class="c">${euros(cost)}</span><small>Convoyeur à manivelle</small></button>`;
      d[`cv${l}`] = s.money < cost;
      eta[`cv${l}`] = cost;
    }
    line.slots.forEach((m, st) => {
      if (!m) return;
      if (m.broken && m.service <= 0) {
        h += `<button class="buy alt" type="button" data-hl="m:${fi}:${l}:${st}" data-act="repair" data-l="${l}" data-i="${st}" data-fk="r${l}${st}"><span class="c">${euros(A.repairCost(s, fi, l, st))}</span><small>Réparer ${STATION_NAMES[st].toLowerCase()}</small></button>`;
      } else if (!m.broken && m.service <= 0 && m.tier > 0 && m.wear >= 0.4 && !s.research.preventive) {
        h += `<button class="buy plain" type="button" data-hl="m:${fi}:${l}:${st}" data-act="service" data-l="${l}" data-i="${st}" data-fk="s${l}${st}"><span class="c">${euros(A.serviceCost(s, fi, l, st))}</span><small>Réviser ${STATION_NAMES[st].toLowerCase()}</small></button>`;
      }
    });
    h += '</div></div>';
    const b = est ? est.lineBottleneck[l] : -1;
    const robotsOnly = line.slots.every((m) => !m || m.tier >= ROBOT_TIER);
    const conv = robotsOnly ? 'robots : transfert automatique' : line.conveyor ? (active ? 'convoyeur en marche' : line.crank < 0 ? 'convoyeur sans ouvrier à la manivelle' : 'convoyeur à l’arrêt') : 'pièces portées à la main';
    k[`lt${l}`] = `${n}/4 postes`;
    k[`lc${l}`] = `${est && b >= 0 ? `${fmtP(est.flow[l][3] || est.rate[l][b])} pièce/s · goulot : ${STATION_NAMES[b].toLowerCase()} · ` : ''}${line.produced ? `${fmt(line.produced)} écrous · ` : ''}${conv}`;
  });
  if (!s.roles.foreman && s.act >= 1) h += '<div class="note">Le contremaître (onglet Équipe) affiche la cadence de chaque poste et le goulot de chaque chaîne.</div>';
  // Postes : acheter, moderniser
  h += `<div class="sec">Postes<span>achat un par un, à la première chaîne qui ne l’a pas</span></div>`;
  for (let st = 0; st < 4; st++) {
    const count = A.stationCount(f, st);
    const tgt = A.modernizeTarget(s, fi, st);
    sig += `|P${st}${count}${tgt ? `${tgt.line}${tgt.tier}` : ''}`;
    h += `<div class="card col"><div class="row"><div class="ic" aria-hidden="true">${STATION_ICONS[st]}</div><div class="info"><div class="nm">${STATION_NAMES[st]} <span class="tag">${count}/${LINES}</span></div><div class="ef" data-k="pc${st}"></div></div></div><div class="btns">`;
    if (count < LINES) {
      const cost = A.addUnitCost(s, fi, st);
      const tier = A.newUnitTier(f, st);
      const l = f.lines.findIndex((x) => !x.slots[st]);
      h += `<button class="buy${recOn(`u${st}`) ? ' rec' : ''}" type="button" data-hl="u:${fi}:${l}:${st}" data-act="unit" data-i="${st}" data-b="u${st}" data-fk="u${st}"><span class="c">${euros(cost)}</span><small>+1 ${tier ? 'machine' : 'établi'} → chaîne ${l + 1}</small></button>`;
      d[`u${st}`] = s.money < cost;
      eta[`u${st}`] = cost;
    }
    if (tgt) {
      h += `<button class="buy${recOn(`m${st}`) ? ' rec' : ''}" type="button" data-hl="m:${fi}:${tgt.line}:${st}" data-act="modern" data-i="${st}" data-b="m${st}" data-fk="m${st}" title="${MACHINE_NAMES[tgt.tier + 1][st]}"><span class="c">${euros(tgt.cost)}</span><small>Moderniser chaîne ${tgt.line + 1} : ${TIER_NAMES[tgt.tier + 1].toLowerCase()}</small></button>`;
      d[`m${st}`] = s.money < tgt.cost;
      eta[`m${st}`] = tgt.cost;
    }
    h += '</div></div>';
    const tiers = f.lines.map((x) => x.slots[st]).filter((m) => m).map((m) => TIER_SHORT[m!.tier]);
    const req = tgt && tgt.tier + 1 < ROBOT_TIER ? ` · ${LEVEL_NAMES[TIER_OPERATOR_LEVEL[tgt.tier + 1]].toLowerCase()} requis après modernisation` : '';
    k[`pc${st}`] = `${STATION_ROLE[st]}${tiers.length ? ` · ${tiers.join(', ')}` : ''}${req}`;
  }
  // Outillage : global
  h += `<div class="sec">Outillage<span>vaut pour toutes les machines identiques</span></div>`;
  for (let st = 0; st < 4; st++) {
    const tiers = A.tiersInUse(s, st);
    if (!tiers.length) continue;
    h += `<div class="card col"><div class="row"><div class="ic" aria-hidden="true">🔧</div><div class="info"><div class="nm">${STATION_NAMES[st]}</div><div class="ef" data-k="to${st}"></div></div></div><div class="btns">`;
    const parts: string[] = [];
    for (const t of tiers) {
      const lvl = A.toolLevel(s, t, st);
      sig += `|T${st}${t}${lvl >= TOOL_MAX ? 'x' : ''}`;
      parts.push(`${TIER_SHORT[t]} ${lvl}/${TOOL_MAX} (×${fmtP(toolSpeed(lvl))})`);
      if (lvl >= TOOL_MAX || t > s.research.tier) continue;
      const cost = toolCost(t, st, lvl);
      const gain = toolSpeed(lvl + 1) / toolSpeed(lvl) - 1;
      h += `<button class="buy${recOn(`t${t}${st}`) ? ' rec' : ''}" type="button" data-hl="t:${t}:${st}" data-act="tool" data-t="${t}" data-i="${st}" data-b="t${t}${st}" data-fk="t${t}${st}"><span class="c" data-k="tc${t}${st}"></span><small data-k="tg${t}${st}"></small></button>`;
      k[`tc${t}${st}`] = euros(cost);
      k[`tg${t}${st}`] = `${tiers.length > 1 ? `${TIER_SHORT[t]} · ` : ''}niv. ${lvl + 1} · +${(gain * 100).toFixed(1).replace('.', ',')} %`;
      d[`t${t}${st}`] = s.money < cost;
      eta[`t${t}${st}`] = cost;
    }
    h += '</div></div>';
    k[`to${st}`] = parts.join(' · ');
  }
  // Usines
  if (s.act >= 1) {
    const max = A.maxFactories(s);
    h += `<div class="sec">Usines<span>${s.factories.length}/${max} sur ce site</span></div>`;
    if (s.factories.length < max) {
      const cost = A.factoryCost(s);
      h += `<div class="card${recOn('factory') ? ' rec' : ''}"><div class="ic" aria-hidden="true">🏭</div><div class="info"><div class="nm">Nouvelle usine</div><div class="vis">Un hall de plus, équipé comme votre meilleure usine (machines et convoyeurs). Les ouvriers sont à embaucher.</div></div>`;
      h += `<button class="buy${recOn('factory') ? ' rec' : ''}" type="button" data-act="buy-factory" data-b="factory" data-fk="factory"><span class="c">${euros(cost)}</span><small>Bâtir</small></button></div>`;
      d.factory = s.money < cost;
      eta['factory'] = cost;
    } else h += `<div class="note">${lock} Site plein : ${max} usine${max > 1 ? 's' : ''} au plus${s.act < 4 ? '. Un site plus grand viendra avec le prochain marché.' : '.'}</div>`;
  }
  // Énergie
  if (s.act >= ENERGY.act) {
    const e = s.energy;
    h += `<div class="sec">Énergie<span data-k="en"></span></div>`;
    const items: [A.EnergyKind, string, string, string][] = [
      ['solar', '☀️', 'Panneau solaire', '50 kW crête, le jour seulement.'],
      ['wind', '🌬️', 'Éolienne', '200 kW, de 55 à 100 % selon le vent.'],
      ['battery', '🔋', 'Batterie', 'Stocke 10 000 kW·s pour la nuit et les creux.'],
    ];
    for (const [kind, ic, nm, desc] of items) {
      const cost = A.energyCost(s, kind);
      const full = e[kind] >= ENERGY.max[kind];
      h += `<div class="card"><div class="ic" aria-hidden="true">${ic}</div><div class="info"><div class="nm">${nm} <span class="tag">×${e[kind]}</span></div><div class="vis">${desc}</div></div>`;
      if (!full) h += `<button class="buy" type="button" data-act="energy" data-i="${kind}" data-b="e${kind}" data-fk="e${kind}"><span class="c">${euros(cost)}</span><small>Installer</small></button>`;
      h += '</div>';
      d[`e${kind}`] = s.money < cost;
      eta[`e${kind}`] = cost;
    }
    const ren = e.solarKw + e.windKw;
    k.en = `${fmt(e.demand)} kW · ${pct(e.demand > 0 ? Math.min(1, ren / e.demand) : 0)} renouvelable · ${fmtP(Math.max(0, e.cost))} €/s${e.cut ? ' · COUPURE' : ''}`;
  }
  return { sig, html: h, k, d, w, eta };
}

// ------------------------------------------------------------------ Équipe

function postLabel(w: Worker): string {
  if (w.kind === 'crank') return `manivelle, chaîne ${w.line + 1}`;
  if (w.kind === 'poly') return w.name === 'Marcel' ? 'polyvalent, le doyen' : 'polyvalent';
  return `${STATION_NAMES[w.station].toLowerCase()}, chaîne ${w.line + 1}`;
}

/** Rapport du contremaître : postes qui freinent leur chaîne, avec la cause. */
function foremanReport(s: GameState, fi: number, est: FactoryEstimate): string[] {
  const f = s.factories[fi];
  const out: string[] = [];
  f.lines.forEach((line, l) => {
    const b = est.lineBottleneck[l];
    if (b < 0) return;
    const m = line.slots[b];
    if (!m) return;
    const where = `chaîne ${l + 1}, ${STATION_NAMES[b].toLowerCase()}`;
    if (m.tier < ROBOT_TIER) {
      const w = m.post >= 0 ? s.workers.find((x) => x.id === m.post) : undefined;
      if (!w) out.push(`${where} : poste vacant, tenu au mieux par les polyvalents.`);
      else if (w.level < TIER_OPERATOR_LEVEL[m.tier]) out.push(`${where} : ${esc(w.name)} n’a pas le niveau, la machine attend sa promotion.`);
      else if (w.state === 'train') out.push(`${where} : ${esc(w.name)} est en stage.`);
      else if (canPromote(w)) out.push(`${where} : goulot à ${fmtP(est.rate[l][b])}/s — ${esc(w.name)} peut être promu·e ; sinon outiller ou moderniser.`);
      else if (canTrain(w)) out.push(`${where} : goulot à ${fmtP(est.rate[l][b])}/s — former ${esc(w.name)} (${w.trainings}/${TRAINING.perLevel}), outiller ou moderniser.`);
      else out.push(`${where} : goulot à ${fmtP(est.rate[l][b])}/s — outiller ou moderniser.`);
    } else out.push(`${where} : goulot robotisé à ${fmtP(est.rate[l][b])}/s.`);
    const human = line.slots.some((x) => x && x.tier < ROBOT_TIER);
    if (human && !line.conveyor && line.slots.filter(Boolean).length >= 3) out.push(`chaîne ${l + 1} : sans convoyeur, chaque pièce est portée à la main.`);
    else if (human && line.conveyor && line.crank < 0) out.push(`chaîne ${l + 1} : le convoyeur attend un ouvrier à la manivelle.`);
  });
  return out;
}

/** Équipe de nuit : rendement et durée, achetés niveau par niveau. */
function nightSection(s: GameState, d: Record<string, boolean>, k: Record<string, string>, eta: Record<string, number>): string {
  if (!A.nightAvailable(s)) {
    if (s.act < 1) return '';
    return `<div class="card dim"><div class="ic" aria-hidden="true">${lock}</div><div class="info"><div class="nm">Équipe de nuit</div><div class="vis">${ACT_NAMES[NIGHT.act].split(' — ')[0]} · fait tourner l’usine pendant votre absence.</div></div></div>`;
  }
  const n = s.night;
  let h = `<div class="sec">Équipe de nuit<span data-k="nt"></span></div><div class="card col"><div class="row"><div class="ic" aria-hidden="true">🌙</div><div class="info"><div class="nm">Équipe de nuit</div><div class="vis">Quand vous n’êtes pas là, l’usine tourne au rendement de l’équipe, pendant sa durée de travail. La part de marché, elle, attend votre retour.</div></div></div><div class="btns">`;
  if (n.rate < NIGHT.rate.max) {
    const cost = nightCost('rate', n.rate);
    h += `<button class="buy" type="button" data-act="night" data-i="rate" data-b="nr" data-fk="nr"><span class="c">${euros(cost)}</span><small>Rendement ${fmtP((n.rate + 1) * NIGHT.rate.per * 100, 1)} %</small></button>`;
    d.nr = s.money < cost;
    eta.nr = cost;
  }
  if (n.rate > 0 && n.duration < NIGHT.duration.max) {
    const cost = nightCost('duration', n.duration);
    h += `<button class="buy" type="button" data-act="night" data-i="duration" data-b="nd" data-fk="nd"><span class="c">${euros(cost)}</span><small>Durée ${dur(NIGHT.duration.base + (n.duration + 1) * NIGHT.duration.per)}</small></button>`;
    d.nd = s.money < cost;
    eta.nd = cost;
  }
  h += '</div></div>';
  k.nt = n.rate > 0 ? `${fmtP(nightRate(s) * 100, 1)} % · ${dur(nightDuration(s))}` : 'pas encore d’équipe';
  return h;
}

/** Filtre de la liste des ouvriers : -1 tous, 0 à 3 une chaîne, 4 les polyvalents. */
let workerFilter = -1;

function vEquipe(s: GameState): View {
  const k: Record<string, string> = {};
  const d: Record<string, boolean> = {};
  const w: Record<string, number> = {};
  const eta: Record<string, number> = {};
  if (G.factory >= s.factories.length) G.factory = 0;
  const fi = G.factory;
  const ws = s.workers.filter((x) => x.factory === fi);
  const rec = recommendation(s);
  const recOn = (key: string) => rec.factory === fi && rec.key === key;
  const free = A.freePosts(s, fi);
  const polys = A.polyCount(s, fi);
  let sig = `E${fi}|${s.factories.length}|${s.act}|${Object.values(s.roles).map(Number).join('')}|${s.canteen}|${ws.map((x) => `${x.id}${x.level}${x.trainings}${x.state === 'train' ? 't' : ''}`).join(',')}|${free.length ? `${free[0].kind}${free[0].line}${free[0].station}` : '-'}|${rec.factory}${rec.key}|${s.methods.active}${s.methods.budget}${s.methods.targets.join('')}`;
  let h = factorySel(s);
  // Synthèse
  const sal = ws.reduce((a, x) => a + salaryOf(x), 0);
  const roleSal = roleSalaries(s);
  const rev = revenueRate();
  h += `<div class="card col"><div class="row"><div class="ic" aria-hidden="true">👷</div><div class="info"><div class="nm">Personnel <span class="tag" data-k="n"></span></div><div class="ef" data-k="sal"></div>`;
  h += '<div class="vis">Un ouvrier embauché prend le poste libre le plus utile et n’en change plus. Les polyvalents, moins chers et moins productifs, tiennent les postes vacants et relèvent les fatigués.</div></div></div>';
  h += '<div class="btns">';
  const nf = free[0];
  h += `<button class="buy${recOn('hire') ? ' rec' : ''}" type="button"${nf ? ` data-hl="${nf.kind === 'crank' ? `c:${fi}:${nf.line}` : `m:${fi}:${nf.line}:${nf.station}`}"` : ''} data-act="hire" data-b="hire" data-fk="hire"><span class="c">Embaucher</span><small data-k="hp"></small></button>`;
  d.hire = !nf;
  k.hp = nf ? (nf.kind === 'crank' ? `manivelle, chaîne ${nf.line + 1}` : `${STATION_NAMES[nf.station].toLowerCase()}, chaîne ${nf.line + 1}`) : 'aucun poste libre';
  h += `<button class="buy plain${recOn('poly') ? ' rec' : ''}" type="button" data-act="hire-poly" data-b="poly" data-fk="poly"><span class="c">Polyvalent</span><small>${polys}/${POLY.maxPerFactory} · ${pct(POLY.productivity)} de cadence</small></button></div></div>`;
  d.poly = polys >= POLY.maxPerFactory;
  k.n = `×${ws.length}`;
  k.sal = `salaires ${fmtP(sal)} €/s${roleSal ? ` · encadrement ${fmtP(roleSal)} €/s` : ''} · recettes ${fmtP(rev)} €/s`;
  // Alerte salaires / recettes
  const totalSal = s.workers.reduce((a, x) => a + salaryOf(x), 0) + roleSal;
  if (s.act >= 1 && rev > 0 && roleSal > rev * ROLE_WARN_SHARE) {
    h += `<div class="note">⚠ L’encadrement coûte ${fmtP(roleSal)} €/s, soit ${pct(roleSal / rev)} de vos recettes. Congédiez un rôle si la caisse fond (plus bas).</div>`;
  } else if (s.act >= 1 && totalSal > rev && s.money < 0) {
    h += `<div class="note">⚠ Les salaires (${fmtP(totalSal)} €/s) dépassent les recettes (${fmtP(rev)} €/s) : la caisse se vide.</div>`;
  }
  sig += rev > 0 && roleSal > rev * ROLE_WARN_SHARE ? 'W' : totalSal > rev && s.money < 0 ? 'w' : '';
  // Machines qui attendent une promotion
  const unq = A.unqualified(s, fi);
  if (unq.length) h += `<div class="note">Machines à l’arrêt faute de qualification : ${unq.map((x) => `${esc(x.name)} (${STATION_NAMES[x.station].toLowerCase()}, chaîne ${x.line + 1}) doit devenir ${LEVEL_NAMES[TIER_OPERATOR_LEVEL[s.factories[fi].lines[x.line].slots[x.station]!.tier]].toLowerCase()}`).join(' ; ')}. Formez-les puis promouvez-les, même à découvert.</div>`;
  // Rapport du contremaître
  if (s.roles.foreman) {
    const est = estimate(s, fi);
    const rep = foremanReport(s, fi, est);
    sig += `|R${rep.length}`;
    h += `<div class="sec">Rapport du contremaître<span data-k="fx"></span></div><div class="card col">`;
    if (!rep.length) h += '<div class="kv"><span>Rien à signaler.</span></div>';
    rep.forEach((_, i) => (h += `<div class="kv"><span data-k="fr${i}"></span></div>`));
    h += '</div>';
    rep.forEach((x, i) => (k[`fr${i}`] = x));
    k.fx = `${fmtP(est.x)} pièce/s`;
  }
  // Ouvriers
  h += `<div class="sec">Ouvriers<span>former ×${TRAINING.perLevel}, puis promouvoir</span></div>`;
  const used = s.factories[fi].lines.map((l) => l.slots.some(Boolean));
  if (workerFilter >= 0 && workerFilter < 4 && !used[workerFilter]) workerFilter = -1;
  sig += `|F${workerFilter}`;
  if (ws.length > 6) {
    h += '<div class="seg" style="margin:0 2px 10px" role="group" aria-label="Filtrer les ouvriers">';
    const opts: [number, string][] = [[-1, 'Tous'], ...used.map((u, l): [number, string] => [u ? l : -9, `Chaîne ${l + 1}`]), [4, 'Polyvalents']];
    for (const [i, label] of opts) {
      if (i === -9) continue;
      const n = i < 0 ? ws.length : i === 4 ? ws.filter((x) => x.kind === 'poly').length : ws.filter((x) => x.kind !== 'poly' && x.line === i).length;
      h += `<button type="button" data-act="w-filter" data-i="${i}" data-fk="wf${i}" class="${workerFilter === i ? 'on' : ''}">${label} · ${n}</button>`;
    }
    h += '</div>';
  } else workerFilter = -1;
  const shown = ws.filter((x) => workerFilter < 0 || (workerFilter === 4 ? x.kind === 'poly' : x.kind !== 'poly' && x.line === workerFilter));
  const order = [...shown].sort((a, b) => (a.kind === b.kind ? a.line * 10 + a.station - (b.line * 10 + b.station) : ['post', 'crank', 'poly'].indexOf(a.kind) - ['post', 'crank', 'poly'].indexOf(b.kind)));
  for (const x of order) {
    const id = x.id;
    h += `<div class="card col wk${recOn(`tr${id}`) ? ' rec' : ''}" data-hl="w:${id}"><div class="row"><div class="info"><div class="nm">${esc(x.name)} <span class="tag">${LEVEL_NAMES[x.level]}</span> <span class="dots" aria-label="${x.trainings} formations sur ${TRAINING.perLevel}">${'●'.repeat(x.trainings)}${'○'.repeat(TRAINING.perLevel - x.trainings)}</span></div><div class="ef" data-k="wk${id}"></div>`;
    if (s.roles.hr) h += `<div class="bar" style="height:4px;margin-top:3px"><i data-w="wm${id}" style="background:${x.morale < 0.5 ? '#ff5a4a' : '#57d987'}"></i></div>`;
    h += '</div><div class="btns mini">';
    if (x.kind !== 'crank') {
      if (canPromote(x)) {
        const cost = promotionCost(s, x);
        h += `<button class="buy" type="button" data-act="promote" data-i="${id}" data-b="pr${id}" data-fk="pr${id}"><span class="c">${euros(cost)}</span><small>Promouvoir</small></button>`;
        d[`pr${id}`] = (s.money < cost && !A.urgent(s, x)) || x.state === 'train';
        if (!A.urgent(s, x)) eta[`pr${id}`] = cost;
      } else if (x.trainings < TRAINING.perLevel) {
        const cost = trainingCost(s, x);
        h += `<button class="buy${recOn(`tr${id}`) ? ' rec' : ''}" type="button" data-act="train" data-i="${id}" data-b="tr${id}" data-fk="tr${id}"><span class="c">${euros(cost)}</span><small>Former</small></button>`;
        d[`tr${id}`] = (s.money < cost && !A.urgent(s, x)) || !canTrain(x);
        if (!A.urgent(s, x)) eta[`tr${id}`] = cost;
      }
    }
    if (x.name !== 'Marcel') h += `<button class="buy plain" type="button" data-act="fire" data-i="${id}" data-fk="fi${id}"><span class="c">Licencier</span><small>poste vacant</small></button>`;
    h += '</div></div></div>';
    const status = x.state === 'train' ? `${x.course === 'promote' ? 'promotion' : 'formation'} ${Math.ceil(x.timer)} s` : x.rest > 0 ? 'en pause' : x.state === 'work' ? 'au travail' : x.state === 'carry' ? 'porte une pièce' : x.state === 'walk' ? 'en chemin' : 'attend';
    const prod = `cadence ×${fmtP(skill(x))}`;
    k[`wk${id}`] = `${x.kind === 'post' ? '' : `${KIND_NAMES[x.kind]} · `}${postLabel(x)} · ${status} · ${prod} · ${fmtP(salaryOf(x))} €/s${s.roles.hr ? ` · moral ${pct(x.morale)}` : ''}`;
    w[`wm${id}`] = x.morale;
  }
  // Ingénieur méthodes : consigne
  if (s.roles.methods) {
    h += `<div class="sec">Consigne de modernisation<span>ingénieur méthodes</span></div><div class="card col">`;
    for (let st = 0; st < 4; st++) {
      h += `<div class="kv"><span>${STATION_NAMES[st]}</span></div><div class="seg" role="group" aria-label="Palier visé : ${STATION_NAMES[st].toLowerCase()}">`;
      for (let t = 0; t < TIER_COUNT; t++) {
        if (t > 0 && !A.tierAllowed(s, t)) continue;
        h += `<button type="button" data-act="m-target" data-i="${st}" data-t="${t}" data-fk="mt${st}${t}" class="${s.methods.targets[st] === t ? 'on' : ''}">${TIER_NAMES[t]}</button>`;
      }
      h += '</div>';
    }
    h += '<div class="kv"><span>Part de la trésorerie engagée</span></div><div class="seg" role="group" aria-label="Budget">';
    METHODS.budgets.forEach((b, i) => {
      h += `<button type="button" data-act="m-budget" data-i="${i}" data-fk="mb${i}" class="${s.methods.budget === i ? 'on' : ''}">${pct(b)}</button>`;
    });
    h += `</div><div class="btns"><button class="buy${s.methods.active ? ' plain' : ''}" type="button" data-act="m-active" data-i="${s.methods.active ? 0 : 1}" data-fk="ma"><span class="c">${s.methods.active ? 'Suspendre' : 'Appliquer'}</span><small>${s.methods.active ? 'la consigne est appliquée' : 'la consigne'}</small></button></div></div>`;
  }
  // Cantine
  if (s.act >= 2) {
    sig += `|ca${s.canteen}`;
    if (s.canteen) h += '<div class="card"><div class="ic" aria-hidden="true">🍲</div><div class="info"><div class="nm">Cantine ouverte</div><div class="vis">Moral plafonné à 100 % au lieu de 85 %, remontée ×1,5.</div></div></div>';
    else {
      const cost = A.canteenCost(s);
      h += `<div class="card"><div class="ic" aria-hidden="true">🍲</div><div class="info"><div class="nm">Cantine</div><div class="vis">+15 points de plafond de moral, il remonte 1,5 fois plus vite.</div></div><button class="buy" type="button" data-act="canteen" data-b="canteen" data-fk="canteen"><span class="c">${euros(cost)}</span><small>Ouvrir</small></button></div>`;
      d.canteen = s.money < cost;
      eta['canteen'] = cost;
    }
  }
  // Équipe de nuit
  h += nightSection(s, d, k, eta);
  sig += `|N${s.night.rate},${s.night.duration}`;
  // Encadrement
  h += '<div class="sec">Encadrement<span>informations et décisions</span></div>';
  for (const r of ROLES) {
    const id = r.id as RoleId;
    const av = A.roleAvailable(s, id);
    if (s.roles[id]) {
      h += `<div class="card"><div class="ic" aria-hidden="true">📋</div><div class="info"><div class="nm">${ROLE_NAMES[id]} <span class="tag green">en poste</span></div><div class="vis">${ROLE_DECISION[id]} ${fmtP(r.salary)} €/s.</div></div><button class="buy plain" type="button" data-act="dismiss" data-i="${id}" data-fk="dm${id}"><span class="c">Congédier</span><small>−${fmtP(r.salary)} €/s</small></button></div>`;
    } else if (!av) {
      h += `<div class="card dim"><div class="ic" aria-hidden="true">${lock}</div><div class="info"><div class="nm">${ROLE_NAMES[id]}</div><div class="vis">${['', 'Acte I', 'Acte II', 'Acte III'][r.act]} · ${ROLE_DATA[id]}</div></div></div>`;
    } else {
      h += `<div class="card"><div class="ic" aria-hidden="true">📋</div><div class="info"><div class="nm">${ROLE_NAMES[id]}</div><div class="vis">${ROLE_DATA[id]} ${ROLE_DECISION[id]}</div></div><button class="buy" type="button" data-act="role" data-i="${id}" data-fk="role${id}"><span class="c">Recruter</span><small>${fmtP(r.salary)} €/s</small></button></div>`;
    }
  }
  return { sig, html: h, k, d, w, eta };
}

// ------------------------------------------------------------------ R&D

function vRD(s: GameState): View {
  const k: Record<string, string> = {};
  const d: Record<string, boolean> = {};
  const w: Record<string, number> = {};
  const eta: Record<string, number> = {};
  const sig = `R${s.act}|${s.research.tier}|${s.research.materials.join('')}|${s.research.workshop}${s.research.preventive}${s.research.predictive}|${s.knowHow.points}|${Object.values(s.knowHow.levels).join('')}`;
  let h = '';
  if (s.act < 1) h += `<div class="note">${lock} Le bureau d’études ouvre à l’acte I, une fois la dette remboursée.</div>`;
  const node = (key: string, icon: string, name: string, desc: string, cost: number, state: 'done' | 'open' | string) => {
    if (state === 'done') return `<div class="card"><div class="ic" aria-hidden="true">${icon}</div><div class="info"><div class="nm">${name} <span class="tag green">acquis</span></div><div class="vis">${desc}</div></div></div>`;
    if (state !== 'open') return `<div class="card dim"><div class="ic" aria-hidden="true">${lock}</div><div class="info"><div class="nm">${name}</div><div class="vis">${state}</div></div></div>`;
    d[`r${key}`] = s.money < cost;
    eta[`r${key}`] = cost;
    return `<div class="card"><div class="ic" aria-hidden="true">${icon}</div><div class="info"><div class="nm">${name}</div><div class="vis">${desc}</div></div><button class="buy" type="button" data-act="rd" data-i="${key}" data-b="r${key}" data-fk="r${key}"><span class="c">${euros(cost)}</span><small>Rechercher</small></button></div>`;
  };
  h += '<div class="sec">Machines<span>paliers technologiques</span></div>';
  const tierDesc = [
    '',
    'Scie à ruban, presse hydraulique, taraudeuse, banc de mesure : bien plus rapides. Opérateurs formés obligatoires.',
    'Scie automatique, presse à transfert, taraudeuse multibroche, contrôle optique. Régleurs obligatoires.',
    'Découpe laser, frappe à froid, taraudage CN, vision IA. Plus d’opérateurs : un technicien par chaîne.',
    'Ligne intégrée sans humains. L’usine tourne dans le noir.',
  ];
  for (let t = 1; t < TIER_COUNT; t++) {
    const st = s.research.tier >= t ? 'done' : s.research.tier === t - 1 && s.act >= TIER_MIN_ACT[t] ? 'open' : s.act < TIER_MIN_ACT[t] ? `${ACT_NAMES[TIER_MIN_ACT[t]].split(' — ')[0]} · ${tierDesc[t]}` : `Nécessite : ${TIER_NAMES[t - 1].toLowerCase()}`;
    if (t > 1 && s.act + 1 < TIER_MIN_ACT[t] && st !== 'done') continue;
    h += node('tier', ['', '⚙️', '🤖', '🦾', '🌑'][t], `Machines : ${TIER_NAMES[t].toLowerCase()}`, tierDesc[t], TIER_RESEARCH[t], st);
  }
  h += '<div class="sec">Matériaux<span>valeur de chaque écrou</span></div>';
  for (let m = 1; m < MATERIALS.length; m++) {
    const def = MATERIALS[m];
    if (s.act + 1 < def.act && !s.research.materials[m]) continue;
    const st = s.research.materials[m] ? 'done' : A.researchAvailable(s, `mat:${m}`) ? 'open' : s.act < def.act ? `${ACT_NAMES[def.act].split(' — ')[0]} · ${MATERIAL_DESC[m]}` : `Nécessite : machines ${TIER_NAMES[def.minTier].toLowerCase()}s`;
    h += node(`mat:${m}`, '🔩', MATERIAL_NAMES[m], MATERIAL_DESC[m], def.research, st);
  }
  if (s.act >= 2) {
    h += '<div class="sec">Maintenance<span>confort</span></div>';
    const ex = RESEARCH_EXTRA;
    h += node('workshop', '🛠️', 'Atelier de maintenance', `Les pannes sont réparées seules : ${pct(WEAR.internalRepairShare)} du prix, ${WEAR.internalRepairTime} s.`, ex.workshop.cost, s.research.workshop ? 'done' : 'open');
    h += node('preventive', '🗓️', 'Maintenance préventive', `Révision automatique dès ${pct(WEAR.preventiveAt)} d’usure, ${pct(WEAR.preventiveShare)} du prix.`, ex.preventive.cost, s.research.preventive ? 'done' : 'open');
    if (s.act >= 3 || s.research.predictive) {
      h += node('predictive', '📡', 'Maintenance prédictive', 'Révisions sans arrêt de la machine, à moitié prix.', ex.predictive.cost, s.research.predictive ? 'done' : s.research.preventive ? 'open' : 'Nécessite : maintenance préventive');
    }
  }
  // Savoir-faire
  const anyKh = s.knowHow.points > 0 || Object.values(s.knowHow.levels).some((x) => x > 0) || s.stats.moves > 0;
  if (anyKh) {
    h += `<div class="sec">Savoir-faire<span>${s.knowHow.points} point${s.knowHow.points > 1 ? 's' : ''} à dépenser</span></div>`;
    for (const def of KNOW_HOW) {
      const id = def.id as KnowHowId;
      const lvl = s.knowHow.levels[id];
      const full = lvl >= def.max;
      const cost = full ? 0 : knowHowCost(id, lvl);
      h += `<div class="card"><div class="ic" aria-hidden="true">🎖</div><div class="info"><div class="nm">${KNOW_HOW_NAMES[id]} <span class="tag">${lvl}/${def.max}</span></div><div class="vis">${KNOW_HOW_DESC[id]}</div></div>`;
      if (!full) h += `<button class="buy" type="button" data-act="kh" data-i="${id}" data-b="kh${id}" data-fk="kh${id}"><span class="c">${cost} pt${cost > 1 ? 's' : ''}</span><small>Apprendre</small></button>`;
      h += '</div>';
      d[`kh${id}`] = s.knowHow.points < cost;
    }
  }
  return { sig, html: h, k, d, w, eta };
}

// ------------------------------------------------------------------ Marché

function vMarche(s: GameState): View {
  const k: Record<string, string> = {};
  const d: Record<string, boolean> = {};
  const w: Record<string, number> = {};
  const eta: Record<string, number> = {};
  const a = ACTS[s.act];
  const goal = a.goal;
  let sig = `M${s.act}|${s.market.goalReached}|${s.ended}|${s.spot.map((x) => x.id + (x.accepted ? 'a' : 'o')).join(',')}|${s.long.map((x) => x.id + (x.accepted ? 'a' : 'o')).join(',')}|${s.roles.logistics}${s.roles.sales}`;
  let h = `<div class="card col"><div class="row"><div class="ic" aria-hidden="true">🏙️</div><div class="info"><div class="nm">${ACT_NAMES[s.act]}</div><div class="ef">Marché de ${MARKET_NAMES[s.act]} : ${s.act === 5 ? 'sans plafond' : `${fmt(a.market)} € de ventes par seconde`}</div></div></div>`;
  if (s.act >= 1 && s.act <= 4) {
    h += '<div class="bar" aria-hidden="true"><i data-w="sh" style="background:linear-gradient(#ffd84a,#f2b705)"></i><i data-w="fe" style="background:#6d737b"></i></div>';
    h += '<div class="kv"><span>Votre part</span><b data-k="sh"></b></div><div class="kv"><span>Ferrum Industries</span><b data-k="fe"></b></div>';
  }
  if (goal.kind === 'share') h += '<div class="kv"><span>Objectif</span><b data-k="go"></b></div>';
  if (goal.kind === 'cash') h += '<div class="kv"><span>Objectif : racheter Ferrum</span><b data-k="go"></b></div>';
  if (s.market.priceWar > 0) h += '<div class="kv danger"><span>Guerre des prix</span><b data-k="war"></b></div>';
  h += '</div>';
  const sh = Math.max(0, Math.min(1, s.market.shareEma));
  w.sh = sh;
  w.fe = 1 - sh;
  k.sh = pct(sh);
  k.fe = pct(1 - sh);
  if (goal.kind === 'share') k.go = s.market.goalReached ? 'atteint' : `${pct(goal.share)} pendant ${goal.hold} s (${Math.floor(s.market.goalT)}/${goal.hold})`;
  if (goal.kind === 'cash') k.go = `${fmt(Math.max(0, s.money))} / ${fmt(goal.amount)} €`;
  k.war = `−15 % encore ${mmss(s.market.priceWar)}`;
  // Prologue : la dette
  if (s.act === 0) {
    h += `<div class="card col"><div class="row"><div class="ic" aria-hidden="true">🏦</div><div class="info"><div class="nm">Dette de la forge</div><div class="ef" data-k="db"></div></div></div>`;
    h += '<div class="btns"><button class="buy" type="button" data-act="pay" data-b="pay" data-fk="pay"><span class="c" data-k="pc"></span><small>Rembourser</small></button></div></div>';
    k.db = `${fmt(s.debt)} € restants · échéance dans ${mmss(s.due - s.t)}`;
    k.pc = euros(Math.min(Math.max(0, s.money), s.debt));
    d.pay = s.money <= 0;
  }
  // Fin d'acte
  if (A.canMove(s)) {
    const next = s.act + 1;
    h += `<div class="card col rec"><div class="row"><div class="ic" aria-hidden="true">🚚</div><div class="info"><div class="nm">Déménager : ${ACT_NAMES[next].split(' — ')[1].toLowerCase()}</div><div class="vis">On revend tout (${euros(A.moveCapital(s))} de capital), on garde les recherches, Marcel et le savoir-faire. Gain : +${A.pendingKnowHow(s)} point${A.pendingKnowHow(s) > 1 ? 's' : ''} de savoir-faire.</div></div></div>`;
    h += '<div class="btns"><button class="buy" type="button" data-act="move" data-fk="move"><span class="c">Déménager</span><small>vers un marché plus grand</small></button></div></div>';
  }
  if (s.act === 4) {
    const can = A.canBuyout(s);
    h += `<div class="card col ${can ? 'rec' : ''}"><div class="row"><div class="ic" aria-hidden="true">🤝</div><div class="info"><div class="nm">Racheter Ferrum Industries</div><div class="vis">Et, avec elle, l’usine historique de votre grand-père.</div></div></div>`;
    h += `<div class="btns"><button class="buy" type="button" data-act="buyout" data-b="buyout" data-fk="buyout"><span class="c">${euros(goal.kind === 'cash' ? goal.amount : 0)}</span><small>Racheter</small></button></div></div>`;
    d.buyout = !can;
    if (goal.kind === 'cash') eta.buyout = goal.amount;
  }
  if (s.act === 5) {
    const gain = A.pendingKnowHow(s);
    h += `<div class="card col"><div class="row"><div class="ic" aria-hidden="true">🏗</div><div class="info"><div class="nm">Nouveau site (prestige)</div><div class="vis">Repartir de zéro ailleurs, avec ${euros(A.moveCapital(s))} de capital et +${gain} point${gain > 1 ? 's' : ''} de savoir-faire. Les recherches sont conservées.</div></div></div>`;
    h += `<div class="btns"><button class="buy" type="button" data-act="new-site" data-b="site" data-fk="site"><span class="c">${gain} pt${gain > 1 ? 's' : ''}</span><small>Bâtir un nouveau site</small></button></div></div>`;
    d.site = gain < 1;
  }
  // Contrats
  if (s.act >= CONTRACTS.act) {
    h += `<div class="sec">Contrats<span>réputation niveau ${repLevel(s)} · prix ×${fmtP(priceMult(s))}</span></div>`;
    const spots = s.spot;
    if (!spots.length && !s.long.length) h += '<div class="note">Aucune offre pour l’instant. Les clients se manifestent au fil du temps.</div>';
    spots.forEach((c) => {
      const val = c.qty * c.price;
      const base = MATERIALS[c.material].price;
      h += `<div class="card col"><div class="row"><div class="ic" aria-hidden="true">📄</div><div class="info"><div class="nm">${fmt(c.qty)} écrous en ${MATERIAL_NAMES[c.material].toLowerCase()} <span class="tag">${fmtP(c.price)} €/pièce</span></div><div class="ef" data-k="sp${c.id}"></div></div></div>`;
      if (c.accepted) {
        h += `<div class="bar"><i data-w="sp${c.id}" style="background:#57d987"></i></div>`;
        if (!s.roles.logistics) h += `<div class="btns"><button class="buy" type="button" data-act="deliver" data-i="${c.id}" data-b="dl${c.id}" data-fk="dl${c.id}"><span class="c">Livrer</span><small>le stock disponible</small></button></div>`;
        k[`sp${c.id}`] = `${fmt(c.delivered)}/${fmt(c.qty)} livrés · échéance ${mmss(c.deadline - s.t)} · ${euros(val)} à la livraison`;
        w[`sp${c.id}`] = c.delivered / c.qty;
        d[`dl${c.id}`] = s.stock[c.material] <= 0;
      } else {
        h += `<div class="btns"><button class="buy" type="button" data-act="accept" data-i="${c.id}" data-fk="ac${c.id}"><span class="c">Accepter</span><small>${euros(val)}</small></button><button class="buy plain" type="button" data-act="decline" data-i="${c.id}" data-fk="de${c.id}"><span class="c">Refuser</span><small>${c.price >= base ? 'bon prix' : 'sous le prix'}</small></button></div>`;
        k[`sp${c.id}`] = `délai ${mmss(c.duration)} une fois accepté · ${c.price >= base ? '+' : ''}${Math.round((c.price / base - 1) * 100)} % sur le prix de base`;
      }
      h += '</div>';
    });
    s.long.forEach((c) => {
      h += `<div class="card col"><div class="row"><div class="ic" aria-hidden="true">📑</div><div class="info"><div class="nm">Long terme : ${fmtP(c.rate)} écrou/s en ${MATERIAL_NAMES[c.material].toLowerCase()} <span class="tag">${fmtP(c.price)} €</span></div><div class="ef" data-k="lt${c.id}"></div></div></div>`;
      if (c.accepted) {
        k[`lt${c.id}`] = `${euros(c.rate * c.price)}/s · ${c.short > 0 ? `stock insuffisant : rupture dans ${Math.ceil(CONTRACTS.longGrace - c.short)} s` : 'approvisionné'}`;
        h += `<div class="btns"><button class="buy plain" type="button" data-act="end-long" data-i="${c.id}" data-fk="el${c.id}"><span class="c">Résilier</span><small>sans pénalité</small></button></div>`;
      } else {
        k[`lt${c.id}`] = `rapporterait ${euros(c.rate * c.price)}/s · production actuelle ${fmtP(s.market.prodRate[c.material])}/s`;
        h += `<div class="btns"><button class="buy" type="button" data-act="sign" data-i="${c.id}" data-b="sg${c.id}" data-fk="sg${c.id}"><span class="c">Signer</span><small>prélèvement continu</small></button></div>`;
        d[`sg${c.id}`] = s.long.filter((x) => x.accepted).length >= CONTRACTS.maxLong;
      }
      h += '</div>';
    });
  }
  // Ventes
  const mats = [...new Set(s.factories.map((f) => f.material))];
  sig += mats.join('');
  h += '<div class="sec">Ventes</div><div class="card col">';
  for (const m of mats) h += `<div class="kv"><span>${MATERIAL_NAMES[m]}</span><b>${fmtP(MATERIALS[m].price * priceMult(s))} € · matière ${fmtP(MATERIALS[m].raw)} €</b></div>`;
  h += `<div class="kv"><span>Recettes</span><b data-k="rv"></b></div><div class="kv"><span>Stock</span><b data-k="st"></b></div><div class="kv"><span>Demande maximale</span><b>${s.act === 5 ? 'illimitée' : `${fmt(a.market)} €/s`}</b></div></div>`;
  k.st = `${fmt(s.stock.reduce((x, y) => x + y, 0))} écrous`;
  k.rv = `${fmtP(revenueRate())} €/s`;
  return { sig, html: h, k, d, w, eta };
}

// ------------------------------------------------------------------ Aiguillage

export const VIEWS: Record<Tab, (s: GameState) => View> = {
  atelier: vAtelier,
  equipe: vEquipe,
  rd: vRD,
  marche: vMarche,
  donnees: dataView,
};

export function tabLocked(s: GameState, t: Tab): boolean {
  if (t === 'rd') return s.act < 1;
  if (t === 'donnees') return !Object.values(s.roles).some(Boolean);
  return false;
}

export function tabAlerts(s: GameState): Partial<Record<Tab, boolean>> {
  const broken = s.factories.some((f) => f.lines.some((l) => l.slots.some((m) => m && m.broken && m.service <= 0)));
  const research =
    s.act >= 1 &&
    ((A.researchAvailable(s, 'tier') && s.money >= A.researchCost(s, 'tier')) ||
      MATERIALS.some((_, m) => m > 0 && A.researchAvailable(s, `mat:${m}`) && s.money >= MATERIALS[m].research));
  return {
    atelier: broken,
    rd: research || (s.knowHow.points > 0 && KNOW_HOW.some((d) => s.knowHow.levels[d.id] < d.max && knowHowCost(d.id, s.knowHow.levels[d.id]) <= s.knowHow.points)),
    marche: (s.act === 0 && s.money >= s.debt) || A.canMove(s) || A.canBuyout(s) || s.spot.some((c) => !c.accepted),
    equipe: s.factories.some((_, fi) => A.unqualified(s, fi).some((w) => w.state !== 'train')),
  };
}

export type PanelHooks = { buyout: () => void; move: () => void; newSite: () => void };
let hooks: PanelHooks = { buyout: () => {}, move: () => {}, newSite: () => {} };
export function setPanelHooks(h: PanelHooks): void {
  hooks = h;
}

export function onPanelAction(act: string, ds: DOMStringMap): void {
  const i = ds.i ?? '';
  const n = +i;
  switch (act) {
    case 'factory-sel':
      G.factory = n;
      break;
    case 'w-filter':
      workerFilter = n;
      break;
    case 'mat':
      U.setMaterial(n);
      break;
    case 'unit':
      U.addUnit(n);
      break;
    case 'tool':
      U.upgradeTool(+(ds.t ?? 0), n);
      break;
    case 'conveyor':
      U.buyConveyor(n);
      break;
    case 'modern':
      U.modernize(n);
      break;
    case 'repair':
      U.repair(+(ds.l ?? 0), n);
      break;
    case 'service':
      U.service(+(ds.l ?? 0), n);
      break;
    case 'buy-factory':
      U.buyFactory();
      break;
    case 'energy':
      U.buyEnergy(i as A.EnergyKind);
      break;
    case 'hire':
      U.hire();
      break;
    case 'hire-poly':
      U.hirePoly();
      break;
    case 'fire':
      U.fire(n);
      break;
    case 'train':
      U.train(n);
      break;
    case 'promote':
      U.promote(n);
      break;
    case 'role':
      U.hireRole(i as RoleId);
      break;
    case 'night':
      U.upgradeNight(i as A.NightKind);
      break;
    case 'dismiss':
      U.dismissRole(i as RoleId);
      break;
    case 'm-target':
      U.setMethodsTarget(n, +(ds.t ?? 0));
      break;
    case 'm-budget':
      U.setMethodsBudget(n);
      break;
    case 'm-active':
      U.setMethodsActive(n === 1);
      break;
    case 'canteen':
      U.buyCanteen();
      break;
    case 'rd':
      U.research(i as A.ResearchId);
      break;
    case 'kh':
      U.buyKnowHow(i as KnowHowId);
      break;
    case 'pay':
      U.payDebt();
      break;
    case 'accept':
      U.acceptSpot(n);
      break;
    case 'decline':
      U.declineSpot(n);
      break;
    case 'deliver':
      U.deliverSpot(n);
      break;
    case 'sign':
      U.signLong(n);
      break;
    case 'end-long':
      U.endLong(n);
      break;
    case 'move':
      hooks.move();
      break;
    case 'buyout':
      hooks.buyout();
      break;
    case 'new-site':
      hooks.newSite();
      break;
  }
}

