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
import {
  KNOW_HOW_NAMES, LEVEL_NAMES, MACHINE_NAMES, MATERIAL_NAMES, ROLE_NAMES, STATION_NAMES, TIER_NAMES, UNIT_WORD,
} from './text';
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

export function hire(ci = G.chain): void {
  const r = A.hire(G.s, ci);
  if (done(r, () => `👷 ${G.s.workers[G.s.workers.length - 1].name} embauché·e`, 'hire')) return;
  if (!r.ok && r.reason === 'complet') toast('Chaîne complète : 20 ouvriers au plus', true);
}

export function fire(ci = G.chain, id?: number): void {
  done(A.fire(G.s, ci, id), (r) => `${r.ok ? r.info : ''} licencié·e`, 'click');
}

export function train(level: number, ci = G.chain, id?: number): void {
  const r = A.train(G.s, ci, level, id);
  done(r, (x) => `🎓 ${x.ok ? x.info : ''} part en formation : ${LEVEL_NAMES[level].toLowerCase()} (${Math.round(A.trainTime(G.s, level))} s)`, 'click');
}

export function addUnit(si: number, ci = G.chain): void {
  const st = G.s.chains[ci].stations[si];
  if (done(A.addUnit(G.s, ci, si), `${UNIT_WORD(st.tier)[0].toUpperCase()}${UNIT_WORD(st.tier).slice(1)} ajouté${st.tier ? 'e' : ''} en ${STATION_NAMES[si].toLowerCase()}`)) {
    const p = worldOfStation(G.s, ci, si, st.units.length - 1);
    dust(p.x, p.y + 16);
  }
}

export function upgradeTool(si: number, ci = G.chain): void {
  const st = G.s.chains[ci].stations[si];
  if (done(A.upgradeTool(G.s, ci, si), `Outillage de ${STATION_NAMES[si].toLowerCase()} amélioré : niveau ${st.tool}, +25 % de vitesse`)) {
    st.units.forEach((_, i) => {
      const p = worldOfStation(G.s, ci, si, i);
      sparks(p.x, p.y + 4, 6, '#ffe9b0');
    });
  }
}

export function modernize(si: number, ci = G.chain): void {
  const st = G.s.chains[ci].stations[si];
  const next = st.tier + 1;
  if (done(A.modernize(G.s, ci, si), `${STATION_NAMES[si]} modernisée : ${MACHINE_NAMES[next][si].toLowerCase()} (${TIER_NAMES[next].toLowerCase()})`, 'build')) {
    G.s.chains[ci].stations[si].units.forEach((_, i) => {
      const p = worldOfStation(G.s, ci, si, i);
      dust(p.x, p.y + 16);
    });
  }
}

export function repair(si: number, ui: number, ci = G.chain): void {
  done(A.repair(G.s, ci, si, ui), (r) => `🔧 Réparation en cours : ${STATION_NAMES[si].toLowerCase()} n°${ui + 1} (${fmt(r.ok ? r.cost ?? 0 : 0)} €)`, 'repair');
}

export function service(si: number, ui: number, ci = G.chain): void {
  done(A.service(G.s, ci, si, ui), `🔧 Révision en cours : ${STATION_NAMES[si].toLowerCase()} n°${ui + 1}`, 'repair');
}

export function setMaterial(m: number, ci = G.chain): void {
  done(A.setMaterial(G.s, ci, m), `Production en ${MATERIAL_NAMES[m].toLowerCase()}${G.s.chains.length > 1 ? ` (chaîne ${ci + 1})` : ''}`, 'click');
}

export function buyChain(): void {
  if (done(A.buyChain(G.s), `🏭 Nouvelle chaîne bâtie : chaîne ${G.s.chains.length}`, 'build')) G.chain = G.s.chains.length - 1;
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
    G.chain = 0;
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
    G.chain = 0;
    return true;
  }
  sfx('denied');
  return false;
}
