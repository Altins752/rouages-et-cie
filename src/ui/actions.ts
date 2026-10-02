/**
 * Actions déclenchées par l'interface : appellent la simulation et donnent un retour
 * (son, message, particules). Le verbe du bouton est repris dans le message.
 */
import { sfx } from '../audio/audio';
import type { KnowHowId, RoleId } from '../data/balance';
import { G } from '../game';
import { dust, sparks } from '../render/particles';
import { worldOfStation } from '../render/scene';
import * as A from '../sim/actions';
import type { EnergyKind, ResearchId, Result } from '../sim/actions';
import { fmt } from './format';
import { TIER_OPERATOR_LEVEL } from '../data/balance';
import { promotionTime, trainingTime } from '../sim/formulas';
import { KNOW_HOW_NAMES, LEVEL_NAMES, MACHINE_NAMES, MATERIAL_NAMES, ROLE_NAMES, STATION_NAMES, TIER_NAMES } from './text';
import { toast } from './toast';

function done(r: Result, okText: string | ((r: Result) => string), sound: Parameters<typeof sfx>[0] = 'buy'): boolean {
  if (r.ok) {
    sfx(sound);
    toast(typeof okText === 'function' ? okText(r) : okText);
    return true;
  }
  sfx('denied');
  if (r.reason === 'argent') toast('Pas assez d’argent', true);
  return false;
}

export function hire(fi = G.factory): void {
  const r = A.hire(G.s, fi);
  if (r.ok) {
    const w = G.s.workers[G.s.workers.length - 1];
    const where = w.kind === 'crank' ? `manivelle du convoyeur, chaîne ${w.line + 1}` : `${STATION_NAMES[w.station].toLowerCase()}, chaîne ${w.line + 1}`;
    done(r, `👷 ${w.name} embauché·e : ${where}`, 'hire');
    return;
  }
  done(r, '');
  if (r.reason === 'aucun poste') toast('Aucun poste libre : achetez un poste ou un convoyeur', true);
}

export function hirePoly(fi = G.factory): void {
  const r = A.hirePoly(G.s, fi);
  done(r, (x) => `👷 ${x.ok ? x.info : ''} embauché·e comme polyvalent·e`, 'hire');
  if (!r.ok && r.reason === 'complet') toast('Six polyvalents au plus par usine', true);
}

export function fire(id: number): void {
  done(A.fire(G.s, id), (r) => `${r.ok ? r.info : ''} licencié·e : son poste est vacant`, 'click');
}

export function train(id: number): void {
  const w = G.s.workers.find((x) => x.id === id);
  const r = A.train(G.s, id);
  done(r, () => `🎓 ${w?.name} part en formation (${(w?.trainings ?? 0) + 1}/5, ${Math.round(w ? trainingTime(G.s, w) : 0)} s)`, 'click');
}

export function promote(id: number): void {
  const w = G.s.workers.find((x) => x.id === id);
  const r = A.promote(G.s, id);
  done(r, () => `🎖 ${w?.name} part en promotion : ${LEVEL_NAMES[Math.min(4, (w?.level ?? 0) + 1)].toLowerCase()} (${Math.round(w ? promotionTime(G.s, w) : 0)} s)`, 'click');
}

export function addUnit(si: number, fi = G.factory): void {
  const r = A.addUnit(G.s, fi, si);
  const f = G.s.factories[fi];
  const l = r.ok ? +(r.info ?? 0) : 0;
  const tier = f.lines[l]?.slots[si]?.tier ?? 0;
  if (done(r, `${STATION_NAMES[si]} ajoutée à la chaîne ${l + 1} : ${MACHINE_NAMES[tier][si].toLowerCase()}`)) {
    const p = worldOfStation(G.s, fi, l, si);
    dust(p.x, p.y + 16);
  }
}

export function upgradeTool(tier: number, si: number): void {
  const r = A.upgradeTool(G.s, tier, si);
  const lvl = A.toolLevel(G.s, tier, si);
  if (done(r, `Outillage ${STATION_NAMES[si].toLowerCase()} (${TIER_NAMES[tier].toLowerCase()}) : niveau ${lvl}, toutes les machines identiques`)) {
    G.s.factories.forEach((f, fi) => f.lines.forEach((l, li) => {
      const m = l.slots[si];
      if (m && m.tier === tier) {
        const p = worldOfStation(G.s, fi, li, si);
        sparks(p.x, p.y + 4, 4, '#ffe9b0');
      }
    }));
  }
}

export function modernize(si: number, fi = G.factory): void {
  const tgt = A.modernizeTarget(G.s, fi, si);
  if (!tgt) return;
  const next = tgt.tier + 1;
  const r = A.modernize(G.s, fi, si);
  if (done(r, `${STATION_NAMES[si]} de la chaîne ${tgt.line + 1} modernisée : ${MACHINE_NAMES[next][si].toLowerCase()}`, 'build')) {
    const p = worldOfStation(G.s, fi, tgt.line, si);
    dust(p.x, p.y + 16);
    const m = G.s.factories[fi].lines[tgt.line].slots[si]!;
    const w = G.s.workers.find((x) => x.id === m.post);
    if (w && next < 3 && w.level < TIER_OPERATOR_LEVEL[next]) toast(`${w.name} doit être promu·e ${LEVEL_NAMES[TIER_OPERATOR_LEVEL[next]].toLowerCase()} pour la conduire`, true);
  }
}

export function buyConveyor(l: number, fi = G.factory): void {
  if (done(A.buyConveyor(G.s, fi, l), `Convoyeur installé sur la chaîne ${l + 1} : il faut un ouvrier à la manivelle`, 'build')) {
    const p = worldOfStation(G.s, fi, l, 0);
    dust(p.x - 40, p.y + 28);
  }
}

export function repair(l: number, si: number, fi = G.factory): void {
  done(A.repair(G.s, fi, l, si), (r) => `🔧 Réparation en cours : ${STATION_NAMES[si].toLowerCase()}, chaîne ${l + 1} (${fmt(r.ok ? r.cost ?? 0 : 0)} €)`, 'repair');
}

export function service(l: number, si: number, fi = G.factory): void {
  done(A.service(G.s, fi, l, si), `🔧 Révision en cours : ${STATION_NAMES[si].toLowerCase()}, chaîne ${l + 1}`, 'repair');
}

export function setMaterial(m: number, fi = G.factory): void {
  done(A.setMaterial(G.s, fi, m), `Production en ${MATERIAL_NAMES[m].toLowerCase()}${G.s.factories.length > 1 ? ` (usine ${fi + 1})` : ''}`, 'click');
}

export function buyFactory(): void {
  if (done(A.buyFactory(G.s), `🏭 Nouvelle usine bâtie : usine ${G.s.factories.length}`, 'build')) G.factory = G.s.factories.length - 1;
}

export function dismissRole(id: RoleId): void {
  done(A.dismissRole(G.s, id), `📋 ${ROLE_NAMES[id]} congédié·e`, 'click');
}

export function setMethodsTarget(st: number, tier: number): void {
  A.setMethodsTarget(G.s, st, tier);
  sfx('click');
}

export function setMethodsBudget(k: number): void {
  A.setMethodsBudget(G.s, k);
  sfx('click');
}

export function setMethodsActive(on: boolean): void {
  done(A.setMethodsActive(G.s, on), on ? '📐 Consigne appliquée : l’ingénieur méthodes modernise' : '📐 Consigne suspendue', 'click');
}

export function buyEnergy(kind: EnergyKind): void {
  const label = { solar: 'Panneau solaire installé', wind: 'Éolienne installée', battery: 'Batterie installée' }[kind];
  done(A.buyEnergy(G.s, kind), `⚡ ${label}`, 'build');
}

export function research(id: ResearchId): void {
  const name =
    id === 'tier' ? `machines ${TIER_NAMES[G.s.research.tier + 1].toLowerCase()}s` :
    id.startsWith('mat:') ? MATERIAL_NAMES[+id.slice(4)].toLowerCase() :
    { workshop: 'atelier de maintenance', preventive: 'maintenance préventive', predictive: 'maintenance prédictive' }[id as 'workshop'];
  done(A.research(G.s, id), `🔬 Recherché : ${name}`, 'research');
}

export function hireRole(id: RoleId): void {
  done(A.hireRole(G.s, id), `📋 ${ROLE_NAMES[id]} recruté·e`, 'hire');
}

export function buyCanteen(): void {
  done(A.buyCanteen(G.s), '🍲 Cantine ouverte : le moral remonte plus vite', 'build');
}

export function payDebt(): void {
  const before = G.s.debt;
  const r = A.payDebt(G.s);
  if (r.ok) {
    sfx('cash');
    if (G.s.act === 1 && before > 0) {
      sfx('milestone');
      toast('🏦 Dette remboursée : la forge est à vous');
    } else toast(`🏦 Remboursé : ${fmt(r.cost ?? 0)} €, reste ${fmt(G.s.debt)} €`);
  } else sfx('denied');
}

export function acceptSpot(id: number): void {
  done(A.acceptSpot(G.s, id), '📄 Contrat accepté : les pièces sont mises de côté', 'contract');
}
export function declineSpot(id: number): void {
  done(A.declineSpot(G.s, id), 'Contrat refusé', 'click');
}
export function deliverSpot(id: number): void {
  done(A.deliverSpot(G.s, id), (r) => `🚚 Livré : ${r.ok ? r.info : 0} écrous`, 'deliver');
}
export function signLong(id: number): void {
  done(A.signLong(G.s, id), '📄 Contrat long terme signé', 'contract');
}
export function endLong(id: number): void {
  done(A.endLong(G.s, id), 'Contrat long terme résilié', 'click');
}

export function buyKnowHow(id: KnowHowId): void {
  done(A.buyKnowHow(G.s, id), `🎖 ${KNOW_HOW_NAMES[id]} : niveau ${G.s.knowHow.levels[id] + 1}`, 'research');
}

export function move(): boolean {
  const r = A.move(G.s);
  if (r.ok) {
    sfx('move');
    toast(`🚚 Déménagé : +${r.info} savoir-faire`);
    G.factory = 0;
    return true;
  }
  sfx('denied');
  return false;
}

export function newSite(): boolean {
  const r = A.newSite(G.s);
  if (r.ok) {
    sfx('move');
    toast(`🏗 Nouveau site : +${r.info} savoir-faire`);
    G.factory = 0;
    return true;
  }
  sfx('denied');
  return false;
}
