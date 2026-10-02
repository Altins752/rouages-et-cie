/** Contenu des onglets du panneau. Chaque vue renvoie du HTML stable et des valeurs à jour. */
import {
  ACTS, CONTRACTS, ENERGY, KNOW_HOW, MATERIALS, MAX_UNITS, MAX_WORKERS_PER_CHAIN, RESEARCH_EXTRA, ROBOT_TIER, ROLES,
  TIER_COUNT, TIER_MIN_ACT, TIER_OPERATOR_LEVEL, TIER_RESEARCH, TOOL_MAX, WEAR, WORKER_SALARY,
} from '../data/balance';
import type { KnowHowId, RoleId } from '../data/balance';
import { G } from '../game';
import type { Tab } from '../game';
import * as A from '../sim/actions';
import { bestCandidate, firstStepCost } from '../sim/advisor';
import { bottleneckOf, stationCapacities } from '../sim/analysis';
import { knowHowCost, materialOk, modernizeCost, priceMult, repLevel, specBonus, toolCost } from '../sim/formulas';
import type { GameState } from '../sim/types';
import * as U from './actions';
import { esc } from './dom';
import { fmt, fmtP, mmss, pct } from './format';
import type { View } from './panel';
import { dataView } from './data';
import {
  ACT_NAMES, KNOW_HOW_DESC, KNOW_HOW_NAMES, LEVEL_NAMES, LEVEL_PLURAL, MACHINE_NAMES, MARKET_NAMES, MATERIAL_DESC,
  MATERIAL_NAMES, ROLE_DATA, ROLE_DECISION, ROLE_NAMES, STATION_ICONS, STATION_NAMES, STATION_ROLE, TIER_NAMES, UNIT_WORD,
} from './text';

const lock = '🔒';
const euros = (n: number) => `${fmt(n)} €`;

function chainSel(s: GameState): string {
  if (s.chains.length < 2) return '';
  let h = '<div class="seg" style="margin:4px 2px 10px" role="group" aria-label="Chaîne affichée">';
  s.chains.forEach((c, i) => {
    const broken = c.stations.some((st) => st.units.some((u) => u.broken));
    h += `<button type="button" data-act="chain-sel" data-i="${i}" data-fk="cs${i}" class="${G.chain === i ? 'on' : ''}">Chaîne ${i + 1}${broken ? ' ⚠' : ''}</button>`;
  });
  return h + '</div>';
}

// ------------------------------------------------------------------ Conseil du superviseur

let recCache = { t: -1e9, key: '', chain: -1 };
function recommendation(s: GameState): { key: string; chain: number } {
  if (!s.roles.supervisor) return { key: '', chain: -1 };
  const now = performance.now();
  if (now - recCache.t < 2500) return recCache;
  recCache.t = now;
  const c = bestCandidate(s, 3600);
  recCache.key = '';
  recCache.chain = -1;
  if (c) {
    const st = c.steps.find((x) => x.kind !== 'hire' && x.kind !== 'material') ?? c.steps[0];
    recCache.chain = st.chain;
    if (st.kind === 'unit') recCache.key = `u${st.station}`;
    else if (st.kind === 'tool') recCache.key = `t${st.station}`;
    else if (st.kind === 'modernize') recCache.key = `m${st.station}`;
    else if (st.kind === 'chain') recCache.key = 'chain';
    else if (st.kind === 'material') recCache.key = `mat${st.material}`;
    else recCache.key = 'hire';
    void firstStepCost;
  }
  return recCache;
}

// ------------------------------------------------------------------ Atelier

function vAtelier(s: GameState): View {
  const k: Record<string, string> = {};
  const d: Record<string, boolean> = {};
  const w: Record<string, number> = {};
  if (G.chain >= s.chains.length) G.chain = 0;
  const ci = G.chain;
  const c = s.chains[ci];
  const rec = recommendation(s);
  const recOn = (key: string) => rec.chain === ci && rec.key === key;
  let sig = `A${ci}|${s.chains.length}|${c.material}|${s.act}|${s.roles.foreman ? 1 : 0}${s.roles.supervisor ? 1 : 0}|${s.research.tier}|${s.research.materials.join('')}|${rec.chain}${rec.key}|${s.energy.solar}${s.energy.wind}${s.energy.battery}`;
  let h = chainSel(s);
  h += `<div class="sec">Matériau<span>${MATERIAL_NAMES[c.material]} · ${fmtP(MATERIALS[c.material].price)} € la pièce</span></div><div class="seg" style="margin:0 2px 10px">`;
  MATERIALS.forEach((m, i) => {
    if (i > 0 && !s.research.materials[i] && s.act < m.act) return;
    const ok = materialOk(s, c, i);
    sig += ok ? 1 : 0;
    const why = !s.research.materials[i] ? 'à rechercher (R&D)' : `exige frappe et taraudage ${TIER_NAMES[m.minTier].toLowerCase()}s`;
    h += `<button type="button" data-act="mat" data-i="${i}" data-fk="mat${i}" class="${c.material === i ? 'on' : ''}${recOn(`mat${i}`) ? ' rec' : ''}" ${ok ? '' : `disabled title="${why}"`}>${MATERIAL_NAMES[i]}</button>`;
  });
  h += '</div>';
  if (s.act === 0 && s.stats.sold < 3) {
    h += '<div class="note">Marcel fait tout, seul : il marche d’un établi à l’autre. Embauchez pour diviser le travail (onglet Équipe), puis regardez où les pièces s’accumulent.</div>';
  }
  const caps = stationCapacities(s, c);
  const b = bottleneckOf(s, c);
  c.stations.forEach((st, si) => {
    sig += `|${si}${st.tier}${st.tool}${st.units.length}${st.units.map((u) => (u.broken ? (u.service > 0 ? 'r' : 'b') : u.service > 0 ? 's' : u.wear > 0.4 ? 'w' : 'o')).join('')}`;
    const human = st.tier < ROBOT_TIER;
    h += `<div class="card col"><div class="row"><div class="ic" aria-hidden="true">${STATION_ICONS[si]}</div><div class="info"><div class="nm">${STATION_NAMES[si]} <span class="tag ${s.roles.foreman && si === b ? 'red' : ''}" data-k="g${si}"></span></div>`;
    h += `<div class="ef" data-k="c${si}"></div></div></div><div class="units">`;
    for (let i = 0; i < MAX_UNITS; i++) {
      const u = st.units[i];
      if (!u) {
        h += '<div class="unit empty">libre</div>';
        continue;
      }
      const cls = u.broken ? 'broken' : u.service > 0 ? 'svc' : '';
      h += `<div class="unit ${cls}" title="${MACHINE_NAMES[st.tier][si]}"><span data-k="ul${si}${i}"></span>`;
      if (st.tier > 0) h += `<div class="w"><i data-w="w${si}${i}" style="background:${u.wear > 0.7 ? '#ff5a4a' : u.wear > 0.5 ? '#ffb02e' : '#57d987'}"></i></div>`;
      h += '</div>';
      const state = u.broken ? (u.service > 0 ? `répar. ${Math.ceil(u.service)} s` : 'en panne') : u.service > 0 ? `révision ${Math.ceil(u.service)} s` : s.roles.supervisor && st.tier > 0 ? `usure ${pct(u.wear)}` : TIER_NAMES[st.tier];
      k[`ul${si}${i}`] = state;
      w[`w${si}${i}`] = s.roles.supervisor ? u.wear : 0;
    }
    h += '</div><div class="btns">';
    if (st.units.length < MAX_UNITS) {
      const cost = A.addUnitCost(s, ci, si);
      h += `<button class="buy${recOn(`u${si}`) ? ' rec' : ''}" type="button" data-act="unit" data-i="${si}" data-b="u${si}" data-fk="u${si}"><span class="c" data-k="uc${si}"></span><small>+1 ${UNIT_WORD(st.tier)}</small></button>`;
      k[`uc${si}`] = euros(cost);
      d[`u${si}`] = s.money < cost;
    }
    if (st.tool < TOOL_MAX) {
      const cost = toolCost(st.tier, si, st.tool);
      h += `<button class="buy${recOn(`t${si}`) ? ' rec' : ''}" type="button" data-act="tool" data-i="${si}" data-b="t${si}" data-fk="t${si}"><span class="c">${euros(cost)}</span><small>Outillage ${st.tool + 1}/${TOOL_MAX} (+25 %)</small></button>`;
      d[`t${si}`] = s.money < cost;
    }
    if (A.tierAllowed(s, st.tier + 1)) {
      const cost = modernizeCost(st, si);
      h += `<button class="buy${recOn(`m${si}`) ? ' rec' : ''}" type="button" data-act="modern" data-i="${si}" data-b="m${si}" data-fk="m${si}" title="${MACHINE_NAMES[st.tier + 1][si]}"><span class="c">${euros(cost)}</span><small>Moderniser : ${TIER_NAMES[st.tier + 1].toLowerCase()}</small></button>`;
      d[`m${si}`] = s.money < cost;
    }
    st.units.forEach((u, i) => {
      if (u.broken && u.service <= 0) {
        h += `<button class="buy alt" type="button" data-act="repair" data-i="${si}" data-u="${i}" data-fk="r${si}${i}"><span class="c">${euros(A.repairCost(s, ci, si, i))}</span><small>Réparer n°${i + 1}</small></button>`;
      } else if (!u.broken && u.service <= 0 && st.tier > 0 && u.wear >= 0.4 && !s.research.preventive) {
        h += `<button class="buy plain" type="button" data-act="service" data-i="${si}" data-u="${i}" data-fk="s${si}${i}"><span class="c">${euros(A.serviceCost(s, ci, si, i))}</span><small>Réviser n°${i + 1}</small></button>`;
      }
    });
    h += '</div></div>';
    const cap = s.roles.foreman ? `${fmtP(caps[si])} pièce/s` : STATION_ROLE[si];
    const ops = human ? ` · ${LEVEL_NAMES[TIER_OPERATOR_LEVEL[st.tier]].toLowerCase()} requis` : ' · sans opérateur';
    k[`g${si}`] = s.roles.foreman ? (si === b ? 'goulot' : 'ok') : TIER_NAMES[st.tier];
    k[`c${si}`] = `${cap} · ${st.units.length}/${MAX_UNITS} ${UNIT_WORD(st.tier, true)}${st.tool ? ` · outillage ${st.tool}` : ''}${st.tier > 0 ? ops : ''}`;
  });
  // Chaînes
  if (s.act >= 1) {
    const max = A.maxChains(s);
    h += `<div class="sec">Chaînes<span>${s.chains.length}/${max} sur ce site</span></div>`;
    if (s.chains.length < max) {
      const cost = A.chainCost(s);
      h += `<div class="card${recOn('chain') ? ' rec' : ''}"><div class="ic" aria-hidden="true">🏭</div><div class="info"><div class="nm">Nouvelle chaîne</div><div class="vis">Un hall de plus, équipé comme votre meilleure chaîne. Les ouvriers sont à embaucher.</div></div>`;
      h += `<button class="buy${rec.key === 'chain' ? ' rec' : ''}" type="button" data-act="buy-chain" data-b="chain" data-fk="chain"><span class="c">${euros(cost)}</span><small>Bâtir</small></button></div>`;
      d.chain = s.money < cost;
    } else h += `<div class="note">${lock} Site plein : ${max} chaîne${max > 1 ? 's' : ''} au plus${s.act < 4 ? '. Un site plus grand viendra avec le prochain marché.' : '.'}</div>`;
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
    }
    const ren = e.solarKw + e.windKw;
    k.en = `${fmt(e.demand)} kW · ${pct(e.demand > 0 ? Math.min(1, ren / e.demand) : 0)} renouvelable · ${fmtP(Math.max(0, e.cost))} €/s${e.cut ? ' · COUPURE' : ''}`;
  }
  return { sig, html: h, k, d, w };
}

// ------------------------------------------------------------------ Équipe

function vEquipe(s: GameState): View {
  const k: Record<string, string> = {};
  const d: Record<string, boolean> = {};
  const w: Record<string, number> = {};
  if (G.chain >= s.chains.length) G.chain = 0;
  const ci = G.chain;
  const ws = s.workers.filter((x) => x.chain === ci);
  const c = s.chains[ci];
  const rec = recommendation(s);
  let sig = `E${ci}|${s.chains.length}|${s.act}|${Object.values(s.roles).map(Number).join('')}|${s.canteen}|${ws.length}|${ws.map((x) => x.level + (x.state === 'train' ? 't' : '')).join('')}|${rec.chain === ci && rec.key === 'hire'}`;
  let h = chainSel(s);
  const counts = [0, 0, 0, 0, 0];
  let training = 0;
  for (const x of ws) {
    counts[x.level]++;
    if (x.state === 'train') training++;
  }
  const sal = ws.reduce((a, x) => a + WORKER_SALARY[x.level], 0);
  h += `<div class="card col"><div class="row"><div class="ic" aria-hidden="true">👷</div><div class="info"><div class="nm">Ouvriers <span class="tag" data-k="n"></span></div><div class="ef" data-k="lv"></div>`;
  h += '<div class="vis">Les ouvriers se répartissent seuls entre les postes. Rester sur le même poste fait gagner jusqu’à 20 % de vitesse.</div></div></div>';
  k.n = `×${ws.length}`;
  k.lv = `${[1, 2, 3, 4].filter((l) => counts[l]).map((l) => `${counts[l]} ${counts[l] > 1 ? LEVEL_PLURAL[l] : LEVEL_NAMES[l].toLowerCase()}`).join(' · ') || 'personne'}${training ? ` · ${training} en formation` : ''} · ${fmtP(sal)} €/s`;
  h += '<div class="btns">';
  h += `<button class="buy${rec.chain === ci && rec.key === 'hire' ? ' rec' : ''}" type="button" data-act="hire" data-b="hire" data-fk="hire"><span class="c">Embaucher</span><small>manœuvre · ${fmtP(WORKER_SALARY[1])} €/s</small></button>`;
  d.hire = ws.length >= MAX_WORKERS_PER_CHAIN;
  for (const lvl of [2, 3, 4]) {
    if ((lvl === 3 && s.act < 2) || (lvl === 4 && s.act < 3)) continue;
    const cost = A.trainCost(s, lvl);
    h += `<button class="buy" type="button" data-act="train" data-i="${lvl}" data-b="tr${lvl}" data-fk="tr${lvl}"><span class="c">${euros(cost)}</span><small>Former : ${LEVEL_NAMES[lvl].toLowerCase()}</small></button>`;
    d[`tr${lvl}`] = s.money < cost || !ws.some((x) => x.level === lvl - 1 && x.state !== 'train');
  }
  h += `<button class="buy alt" type="button" data-act="fire" data-b="fire" data-fk="fire"><span class="c">Licencier</span><small>le dernier arrivé</small></button></div></div>`;
  d.fire = !ws.some((x) => x.name !== 'Marcel');
  // Besoins de qualification
  const needs: string[] = [];
  for (const lvl of [2, 3]) {
    const need = c.stations.reduce((a, st) => a + (st.tier < ROBOT_TIER && TIER_OPERATOR_LEVEL[st.tier] >= lvl ? st.units.length : 0), 0);
    const have = ws.filter((x) => (x.state === 'train' ? x.trainTo : x.level) >= lvl).length;
    if (need > have) needs.push(`${need - have} ${need - have > 1 ? LEVEL_PLURAL[lvl] : LEVEL_NAMES[lvl].toLowerCase()} de plus`);
  }
  if (c.stations.some((st) => st.tier === ROBOT_TIER) && !ws.some((x) => (x.state === 'train' ? x.trainTo : x.level) >= 4)) needs.push('un technicien (robots à 50 % sans lui)');
  const humanUnits = c.stations.reduce((a, st) => a + (st.tier < ROBOT_TIER ? st.units.length : 0), 0);
  if (needs.length) h += `<div class="note">Les machines de cette chaîne réclament : ${needs.join(', ')}.</div>`;
  if (s.act >= 3 && humanUnits + 1 < ws.length && c.stations.some((st) => st.tier >= ROBOT_TIER)) {
    h += `<div class="note">${ws.length - humanUnits - 1} ouvrier(s) sans poste depuis la robotisation. Reconvertissez-les en techniciens (« Former ») ou séparez-vous d’eux (« Licencier »).</div>`;
  }
  // Détail par ouvrier (RH)
  if (s.roles.hr) {
    h += `<div class="sec">Dossiers du personnel<span>RH</span></div><div class="card col">`;
    ws.forEach((x, i) => {
      h += `<div class="kv"><span>${esc(x.name)} · ${LEVEL_NAMES[x.level].toLowerCase()}</span><b data-k="wk${i}"></b></div><div class="bar" style="height:5px;margin-bottom:4px"><i data-w="wm${i}" style="background:${x.morale < 0.5 ? '#ff5a4a' : '#57d987'}"></i></div>`;
      const sp = Math.max(...[0, 1, 2, 3].map((si) => specBonus(x, si)));
      k[`wk${i}`] = x.state === 'train' ? `formation ${Math.ceil(x.timer)} s` : `moral ${pct(x.morale)} · occupé ${pct(x.load)}${sp > 0 ? ` · +${Math.round(sp * 100)} %` : ''}${x.home >= 0 ? ` · ${STATION_NAMES[x.home].toLowerCase()}` : ''}`;
      w[`wm${i}`] = x.morale;
    });
    h += '</div>';
  } else if (s.act >= 2) h += `<div class="note">Recrutez les ressources humaines pour voir le moral et les compétences de chacun.</div>`;
  // Cantine
  if (s.act >= 2) {
    sig += `|ca${s.canteen}`;
    if (s.canteen) h += '<div class="card"><div class="ic" aria-hidden="true">🍲</div><div class="info"><div class="nm">Cantine ouverte</div><div class="vis">Moral plafonné à 100 % au lieu de 85 %, remontée ×1,5.</div></div></div>';
    else {
      const cost = A.canteenCost(s);
      h += `<div class="card"><div class="ic" aria-hidden="true">🍲</div><div class="info"><div class="nm">Cantine</div><div class="vis">+15 points de plafond de moral, il remonte 1,5 fois plus vite.</div></div><button class="buy" type="button" data-act="canteen" data-b="canteen" data-fk="canteen"><span class="c">${euros(cost)}</span><small>Ouvrir</small></button></div>`;
      d.canteen = s.money < cost;
    }
  }
  // Encadrement
  h += '<div class="sec">Encadrement<span>informations et décisions</span></div>';
  for (const r of ROLES) {
    const id = r.id as RoleId;
    const av = A.roleAvailable(s, id);
    if (s.roles[id]) {
      h += `<div class="card"><div class="ic" aria-hidden="true">📋</div><div class="info"><div class="nm">${ROLE_NAMES[id]} <span class="tag green">en poste</span></div><div class="vis">${ROLE_DECISION[id]}</div></div></div>`;
    } else if (!av) {
      h += `<div class="card dim"><div class="ic" aria-hidden="true">${lock}</div><div class="info"><div class="nm">${ROLE_NAMES[id]}</div><div class="vis">${['', 'Acte I', 'Acte II', 'Acte III'][r.act]} · ${ROLE_DATA[id]}</div></div></div>`;
    } else {
      h += `<div class="card"><div class="ic" aria-hidden="true">📋</div><div class="info"><div class="nm">${ROLE_NAMES[id]}</div><div class="vis">${ROLE_DATA[id]} ${ROLE_DECISION[id]}</div></div><button class="buy" type="button" data-act="role" data-i="${id}" data-fk="role${id}"><span class="c">Recruter</span><small>${fmtP(r.salary)} €/s</small></button></div>`;
    }
  }
  return { sig, html: h, k, d, w };
}

// ------------------------------------------------------------------ R&D

function vRD(s: GameState): View {
  const k: Record<string, string> = {};
  const d: Record<string, boolean> = {};
  const w: Record<string, number> = {};
  const sig = `R${s.act}|${s.research.tier}|${s.research.materials.join('')}|${s.research.workshop}${s.research.preventive}${s.research.predictive}|${s.knowHow.points}|${Object.values(s.knowHow.levels).join('')}`;
  let h = '';
  if (s.act < 1) h += `<div class="note">${lock} Le bureau d’études ouvre à l’acte I, une fois la dette remboursée.</div>`;
  const node = (key: string, icon: string, name: string, desc: string, cost: number, state: 'done' | 'open' | string) => {
    if (state === 'done') return `<div class="card"><div class="ic" aria-hidden="true">${icon}</div><div class="info"><div class="nm">${name} <span class="tag green">acquis</span></div><div class="vis">${desc}</div></div></div>`;
    if (state !== 'open') return `<div class="card dim"><div class="ic" aria-hidden="true">${lock}</div><div class="info"><div class="nm">${name}</div><div class="vis">${state}</div></div></div>`;
    d[`r${key}`] = s.money < cost;
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
  return { sig, html: h, k, d, w };
}

// ------------------------------------------------------------------ Marché

function vMarche(s: GameState): View {
  const k: Record<string, string> = {};
  const d: Record<string, boolean> = {};
  const w: Record<string, number> = {};
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
  const mats = [...new Set(s.chains.map((c) => c.material))];
  sig += mats.join('');
  h += '<div class="sec">Ventes</div><div class="card col">';
  for (const m of mats) h += `<div class="kv"><span>${MATERIAL_NAMES[m]}</span><b>${fmtP(MATERIALS[m].price * priceMult(s))} € · matière ${fmtP(MATERIALS[m].raw)} €</b></div>`;
  h += `<div class="kv"><span>Stock</span><b data-k="st"></b></div><div class="kv"><span>Demande maximale</span><b>${s.act === 5 ? 'illimitée' : `${fmt(a.market)} €/s`}</b></div></div>`;
  k.st = `${fmt(s.stock.reduce((x, y) => x + y, 0))} écrous`;
  return { sig, html: h, k, d, w };
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
  const broken = s.chains.some((c) => c.stations.some((st) => st.units.some((u) => u.broken && u.service <= 0)));
  const research =
    s.act >= 1 &&
    ((A.researchAvailable(s, 'tier') && s.money >= A.researchCost(s, 'tier')) ||
      MATERIALS.some((_, m) => m > 0 && A.researchAvailable(s, `mat:${m}`) && s.money >= MATERIALS[m].research));
  return {
    atelier: broken,
    rd: research || (s.knowHow.points > 0 && KNOW_HOW.some((d) => s.knowHow.levels[d.id] < d.max && knowHowCost(d.id, s.knowHow.levels[d.id]) <= s.knowHow.points)),
    marche: (s.act === 0 && s.money >= s.debt) || A.canMove(s) || A.canBuyout(s) || s.spot.some((c) => !c.accepted),
    equipe: s.chains.some((c, ci) => c.stations.some((st) => st.tier >= 1 && st.tier < ROBOT_TIER) && !s.workers.some((x) => x.chain === ci && x.level >= 2)),
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
    case 'chain-sel':
      G.chain = n;
      break;
    case 'mat':
      U.setMaterial(n);
      break;
    case 'unit':
      U.addUnit(n);
      break;
    case 'tool':
      U.upgradeTool(n);
      break;
    case 'modern':
      U.modernize(n);
      break;
    case 'repair':
      U.repair(n, +(ds.u ?? 0));
      break;
    case 'service':
      U.service(n, +(ds.u ?? 0));
      break;
    case 'buy-chain':
      U.buyChain();
      break;
    case 'energy':
      U.buyEnergy(i as A.EnergyKind);
      break;
    case 'hire':
      U.hire();
      break;
    case 'fire':
      U.fire();
      break;
    case 'train':
      U.train(n);
      break;
    case 'role':
      U.hireRole(i as RoleId);
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

