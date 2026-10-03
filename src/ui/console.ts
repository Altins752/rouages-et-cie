/** Pupitre : afficheur LCD (caisse, objectif, stock), compte-tours, voyants. */
import { ACTS, CHALLENGES, TACHO } from '../data/balance';
import { G, inRed, vmax } from '../game';
import { estimateSite } from '../sim/analysis';
import { $, setText } from './dom';
import { fmt, fmtMoney, fmtP, mmss, pct } from './format';
import { netRate, revenueRate, trackRates } from './rates';
import { CHALLENGE_NAMES, SITE_NAMES } from './text';

let lastVm = -1;
let rateCache = { t: -1e9, info: '' };

export function updateConsole(): void {
  const s = G.s;
  setText($('money'), fmtMoney(s.money));
  $('money').parentElement!.classList.toggle('neg', s.money < 0);
  setText($('siteName'), s.ended && s.act === 5 ? 'Groupe Rouages & Cie' : SITE_NAMES[s.act]);
  // Recettes toujours affichées ; le bénéfice net avec le contrôleur de gestion
  trackRates(s);
  setText($('rate'), `+${fmtP(revenueRate())} €/s`);
  const obj = $('obj');
  const g = ACTS[s.act].goal;
  obj.classList.remove('warn', 'good');
  if (s.act === 0) {
    setText($('objL'), 'Dette');
    setText($('objR'), `${fmt(s.debt)} € · échéance ${mmss(s.due - s.t)}`);
    obj.classList.toggle('warn', s.due - s.t < 120);
  } else if (g.kind === 'share') {
    setText($('objL'), `Objectif : ${pct(g.share)} du marché`);
    setText($('objR'), s.market.goalReached ? 'atteint !' : `${pct(s.market.shareEma)}${s.market.goalT > 0 ? ` · tenu ${Math.floor(s.market.goalT)}/${g.hold} s` : ''}`);
    obj.classList.toggle('good', s.market.goalReached || s.market.goalT > 0);
  } else if (g.kind === 'cash') {
    setText($('objL'), 'Rachat de Ferrum');
    setText($('objR'), `${fmt(Math.max(0, s.money))} / ${fmt(g.amount)} €`);
    obj.classList.toggle('good', s.market.goalReached);
  } else {
    const ch = s.challenge?.state === 'on' ? s.challenge : null;
    if (ch) {
      const def = CHALLENGES.find((c) => c.id === ch.id)!;
      setText($('objL'), `Défi : ${CHALLENGE_NAMES[ch.id]}`);
      setText($('objR'), def.produced !== undefined
        ? `${fmt(s.stats.produced - ch.p0)} / ${fmt(def.produced)} écrous${def.time !== undefined ? ` · ${mmss(def.time - (s.t - ch.t0))}` : ''}`
        : `${fmt(Math.max(0, s.money))} / ${fmt(def.cash ?? 0)} €`);
    } else {
      setText($('objL'), 'Bac à sable');
      setText($('objR'), `${fmt(s.stats.produced)} écrous produits`);
    }
  }
  setText($('stock'), fmt(s.stock.reduce((a, b) => a + b, 0)));
  const now = performance.now();
  if (now - rateCache.t > 1000) {
    rateCache.t = now;
    const n = netRate();
    if (s.roles.controller) rateCache.info = `Net ${n >= 0 ? '+' : '−'}${fmtP(Math.abs(n))} €/s`;
    else if (s.roles.foreman) rateCache.info = `Cadence ${fmtP(estimateSite(s).factories.reduce((a, e) => a + e.x, 0))}/s`;
    else rateCache.info = `Vendus ${fmt(s.stats.sold)}`;
  }
  setText($('infoR'), rateCache.info);
  // Voyants
  const broken = s.factories.some((f) => f.lines.some((l) => l.slots.some((m) => m && m.broken)));
  lamp('panne', broken);
  lamp('reseau', s.energy.cut);
  lamp('ferrum', !!s.crisis.active || s.market.priceWar > 0);
  lamp('contrat', s.spot.some((c) => c.accepted && c.deadline - s.t < 60) || s.long.some((c) => c.accepted && c.short > 0));
}

function lamp(id: string, on: boolean): void {
  const el = document.querySelector<HTMLElement>(`.lamp[data-lamp="${id}"]`);
  if (el && el.classList.contains('on') !== on) el.classList.toggle('on', on);
}

const CX = 75;
const CY = 78;
const R = 61;

function arc(a0: number, a1: number): string {
  return `M${(CX + R * Math.cos(a0)).toFixed(1)} ${(CY + R * Math.sin(a0)).toFixed(1)} A${R} ${R} 0 0 1 ${(CX + R * Math.cos(a1)).toFixed(1)} ${(CY + R * Math.sin(a1)).toFixed(1)}`;
}

export function updateGauge(): void {
  const vm = vmax();
  const f = Math.max(0, Math.min(1, G.rev));
  const ang = -Math.PI + Math.PI * f;
  const tk = $('ticks');
  if (vm !== lastVm) {
    lastVm = vm;
    let h = '';
    for (let v = 1; v <= vm + 1e-6; v += 0.25) {
      const k = (v - 1) / (vm - 1);
      const a = -Math.PI + Math.PI * k;
      const maj = Math.abs(v - Math.round(v)) < 1e-6;
      const r1 = maj ? 46 : 51;
      const r2 = 56;
      h += `<line x1="${(CX + r1 * Math.cos(a)).toFixed(1)}" y1="${(CY + r1 * Math.sin(a)).toFixed(1)}" x2="${(CX + r2 * Math.cos(a)).toFixed(1)}" y2="${(CY + r2 * Math.sin(a)).toFixed(1)}" stroke="${k > TACHO.redZone ? '#ff6b5a' : '#c9cfd6'}" stroke-width="${maj ? 2 : 1}"/>`;
      if (maj) h += `<text x="${(CX + 38 * Math.cos(a)).toFixed(1)}" y="${(CY + 38 * Math.sin(a) + 3).toFixed(1)}" text-anchor="middle" font-family="Share Tech Mono, monospace" font-size="9" fill="#c9cfd6">${v}</text>`;
    }
    tk.innerHTML = h;
    const rz = -Math.PI + Math.PI * TACHO.redZone;
    $('gRed').setAttribute('d', arc(rz, 0));
  }
  $('needle').setAttribute('x2', (CX + 52 * Math.cos(ang)).toFixed(1));
  $('needle').setAttribute('y2', (CY + 52 * Math.sin(ang)).toFixed(1));
  $('gArc').setAttribute('d', f > 0.005 ? arc(-Math.PI, ang) : '');
  const red = inRed();
  $('gArc').setAttribute('stroke', red ? '#ff3b2b' : '#f2b705');
  setText($('gTxt'), `×${G.speed.toFixed(2).replace('.', ',')}`);
  $('gTxt').setAttribute('fill', red ? '#ff5a4a' : '#ffb02e');
}
