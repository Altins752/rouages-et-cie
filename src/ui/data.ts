/**
 * Onglet Données : le tableau de bord commence vide et se remplit avec les rôles recrutés.
 * Graphiques de télémétrie repris de la v5 (survol pour lire une valeur).
 */
import { MATERIALS, ROLES } from '../data/balance';
import { G } from '../game';
import { estimateFactory } from '../sim/analysis';
import { HIST, salaryOf } from '../sim/engine';
import { priceMult } from '../sim/formulas';
import type { GameState } from '../sim/types';
import { fmt, fmtP, mmss, pct } from './format';
import type { View } from './panel';
import { LEVEL_PLURAL, MATERIAL_NAMES, ROLE_DATA, ROLE_NAMES, STATION_NAMES } from './text';

type Range = '15' | '240';
let range: Range = '15';
const cursor: Record<string, number | undefined> = {};

interface Series {
  k: number | ((p: number[]) => number);
  col: string;
  name: string;
  area?: boolean;
  dash?: boolean;
}
interface ChartCfg {
  title: string;
  unit: string;
  stack?: boolean;
  /** Moyenne glissante sur n points (séries bruitées). */
  smooth?: number;
  series: Series[];
}

const CH: Record<string, ChartCfg> = {
  prod: { title: 'Production', unit: 'pièces/s', smooth: 3, series: [{ k: HIST.prod, col: '#ffb02e', name: 'Production', area: true }] },
  idle: { title: 'Gaspillage : machines en veille', unit: '%', series: [{ k: (p) => p[HIST.idle] * 100, col: '#ff6b5a', name: 'Veille', area: true }] },
  morale: { title: 'Moral moyen', unit: '%', series: [{ k: (p) => p[HIST.morale] * 100, col: '#7fc4ff', name: 'Moral', area: true }] },
  stock: { title: 'Stock', unit: 'pièces', series: [{ k: HIST.stock, col: '#ffb02e', name: 'Stock', area: true }] },
  share: { title: 'Part de marché', unit: '%', series: [{ k: (p) => p[HIST.share] * 100, col: '#ffd84a', name: 'Part', area: true }, { k: () => 50, col: '#ff6b5a', name: 'Objectif', dash: true }] },
  fin: {
    title: 'Flux financiers', unit: '€/s', series: [
      { k: HIST.rev, col: '#5dff8f', name: 'Ventes', area: true },
      { k: (p) => p[HIST.raw] + p[HIST.sal] + p[HIST.energy] + p[HIST.maint], col: '#ff6b5a', name: 'Charges' },
      { k: (p) => p[HIST.rev] - p[HIST.raw] - p[HIST.sal] - p[HIST.energy] - p[HIST.maint], col: '#ffb02e', name: 'Bénéfice' },
    ],
  },
  cash: { title: 'Trésorerie', unit: '€', series: [{ k: HIST.money, col: '#5dff8f', name: 'Caisse', area: true }] },
  nrg: {
    title: 'Mix énergétique', unit: 'kW', stack: true, series: [
      { k: HIST.solar, col: '#f2b705', name: 'Solaire', area: true },
      { k: HIST.wind, col: '#7cc7ff', name: 'Éolien', area: true },
      { k: (p) => Math.max(0, p[HIST.batt]), col: '#57d987', name: 'Batterie', area: true },
      { k: HIST.grid, col: '#a0a7b0', name: 'Réseau', area: true },
      { k: HIST.short, col: '#ff4a3a', name: 'Manque', area: true },
    ],
  },
};

function hist(s: GameState): { data: number[][]; t0: number; t1: number } {
  const h = range === '15' ? s.history.h5 : s.history.h60;
  const span = range === '15' ? 900 : 14400;
  const t1 = s.t;
  const t0 = t1 - span;
  return { data: h.filter((p) => p[0] >= t0), t0, t1 };
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

function drawChart(c: HTMLCanvasElement, s: GameState): void {
  const cfg = CH[c.dataset.chart!];
  if (!cfg) return;
  const { data, t0, t1 } = hist(s);
  const r = c.getBoundingClientRect();
  if (!r.width) return;
  const dp = Math.min(window.devicePixelRatio || 1, 2);
  const W2 = Math.round(r.width * dp);
  const H2 = Math.round(r.height * dp);
  if (c.width !== W2 || c.height !== H2) {
    c.width = W2;
    c.height = H2;
  }
  const x = c.getContext('2d')!;
  x.setTransform(dp, 0, 0, dp, 0, 0);
  const w = r.width;
  const h = r.height;
  x.clearRect(0, 0, w, h);
  const pl = 4;
  const pr = 4;
  const pt = 16;
  const pb = 14;
  const pw = w - pl - pr;
  const ph = h - pt - pb;
  x.font = '10px "Share Tech Mono", ui-monospace, monospace';
  x.textBaseline = 'middle';
  x.strokeStyle = 'rgba(255,176,46,.12)';
  x.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const yy = Math.round(pt + (ph * g) / 4) + 0.5;
    x.beginPath();
    x.moveTo(pl, yy);
    x.lineTo(pl + pw, yy);
    x.stroke();
  }
  x.fillStyle = 'rgba(255,176,46,.7)';
  x.textAlign = 'left';
  x.fillText(range === '15' ? '−15 min' : '−4 h', pl + 2, pt + ph + 8);
  x.textAlign = 'right';
  x.fillText('maintenant', pl + pw, pt + ph + 8);
  if (data.length < 2) {
    x.textAlign = 'center';
    x.fillStyle = 'rgba(255,176,46,.8)';
    x.fillText(`Collecte des données… (1 point / ${range === '15' ? '5 s' : 'min'} de jeu)`, w / 2, pt + ph / 2);
    return;
  }
  let raw = cfg.series.map((sr) => data.map((p) => (typeof sr.k === 'function' ? sr.k(p) : p[sr.k])));
  if (cfg.smooth) {
    const n = cfg.smooth;
    raw = raw.map((a) => a.map((_, i) => {
      let s = 0;
      let k = 0;
      for (let j = Math.max(0, i - n + 1); j <= i; j++) {
        s += a[j];
        k++;
      }
      return s / k;
    }));
  }
  const V = raw.map((a) => a.slice());
  if (cfg.stack) for (let j = 1; j < V.length; j++) for (let i = 0; i < V[j].length; i++) V[j][i] += V[j - 1][i];
  let mx = 0;
  let mn = 0;
  for (const a of V) for (const v of a) {
    if (v > mx) mx = v;
    if (v < mn) mn = v;
  }
  mx = niceMax(mx * 1.05);
  if (mn < 0) mn = -niceMax(-mn * 1.05);
  const X = (t: number) => pl + ((t - t0) / (t1 - t0)) * pw;
  const Y = (v: number) => pt + ph - ((v - mn) / (mx - mn)) * ph;
  const base = Y(Math.max(0, mn));
  if (mn < 0) {
    x.strokeStyle = 'rgba(255,176,46,.45)';
    const y0 = Math.round(Y(0)) + 0.5;
    x.beginPath();
    x.moveTo(pl, y0);
    x.lineTo(pl + pw, y0);
    x.stroke();
  }
  x.fillStyle = 'rgba(255,176,46,.8)';
  x.textAlign = 'left';
  x.fillText(`max ${fmt(mx)} ${cfg.unit}`, pl + 2, 7);
  const path = (a: number[]) => {
    x.beginPath();
    for (let i = 0; i < a.length; i++) {
      const xx = X(data[i][0]);
      const yy = Y(a[i]);
      if (i) x.lineTo(xx, yy);
      else x.moveTo(xx, yy);
    }
  };
  const order = cfg.stack ? [...V.keys()].reverse() : [...V.keys()];
  for (const j of order) {
    const sr = cfg.series[j];
    const a = V[j];
    if (sr.area) {
      path(a);
      x.lineTo(X(data[a.length - 1][0]), base);
      x.lineTo(X(data[0][0]), base);
      x.closePath();
      x.globalAlpha = cfg.stack ? 0.8 : 0.16;
      x.fillStyle = sr.col;
      x.fill();
      x.globalAlpha = 1;
    }
    if (!cfg.stack || j === V.length - 1) {
      path(a);
      x.strokeStyle = cfg.stack ? 'rgba(255,230,180,.85)' : sr.col;
      x.lineWidth = 1.6;
      x.setLineDash(sr.dash ? [4, 3] : []);
      x.stroke();
      x.setLineDash([]);
    }
  }
  const f = cursor[c.dataset.chart!];
  if (f !== undefined) {
    const tt = t0 + f * (t1 - t0);
    let bi = 0;
    for (let i = 1; i < data.length; i++) if (Math.abs(data[i][0] - tt) < Math.abs(data[bi][0] - tt)) bi = i;
    const cx = Math.round(X(data[bi][0])) + 0.5;
    x.strokeStyle = 'rgba(255,230,180,.7)';
    x.beginPath();
    x.moveTo(cx, pt);
    x.lineTo(cx, pt + ph);
    x.stroke();
    V.forEach((a, j) => {
      x.fillStyle = cfg.series[j].col;
      x.beginPath();
      x.arc(cx, Y(a[bi]), 3, 0, Math.PI * 2);
      x.fill();
    });
    const lines = [`il y a ${mmss(t1 - data[bi][0])}`, ...cfg.series.map((sr, j) => `${sr.name} ${fmtP(raw[j][bi])}`)];
    const bw = Math.max(...lines.map((l) => x.measureText(l).width)) + 12;
    const bh = lines.length * 13 + 6;
    const bx = cx + bw + 8 > pl + pw ? cx - bw - 6 : cx + 6;
    x.fillStyle = 'rgba(8,9,7,.9)';
    x.strokeStyle = 'rgba(255,176,46,.6)';
    x.fillRect(bx, pt + 2, bw, bh);
    x.strokeRect(bx + 0.5, pt + 2.5, bw - 1, bh - 1);
    x.textAlign = 'left';
    lines.forEach((l, i) => {
      x.fillStyle = i ? cfg.series[i - 1].col : '#ffd27a';
      x.fillText(l, bx + 6, pt + 11 + i * 13);
    });
  }
}

const chart = (key: string) => `<div class="card col"><div class="nm">${CH[key].title}</div><canvas class="chart" data-chart="${key}" aria-label="${CH[key].title}"></canvas></div>`;
const kv = (label: string, key: string) => `<div class="kv"><span>${label}</span><b data-k="${key}"></b></div>`;

let bound = false;
function bind(list: HTMLElement): void {
  if (bound) return;
  bound = true;
  const move = (e: PointerEvent) => {
    const c = (e.target as HTMLElement).closest?.('canvas.chart') as HTMLCanvasElement | null;
    if (!c) return;
    const r = c.getBoundingClientRect();
    cursor[c.dataset.chart!] = Math.max(0, Math.min(1, (e.clientX - r.left - 4) / (r.width - 8)));
    drawChart(c, G.s);
  };
  list.addEventListener('pointermove', move);
  list.addEventListener('pointerdown', move);
  list.addEventListener('pointerleave', () => {
    for (const k in cursor) delete cursor[k];
  });
  list.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-range]');
    if (b) {
      range = b.dataset.range as Range;
      (list as HTMLElement & { _sig?: string | null })._sig = null;
    }
  });
}

export function dataView(s: GameState): View {
  const k: Record<string, string> = {};
  const roles = s.roles;
  const any = Object.values(roles).some(Boolean);
  const sig = `D${Object.values(roles).map(Number).join('')}|${range}|${s.factories.length}|${s.act}|${s.energy.solar + s.energy.wind + s.energy.battery > 0}`;
  let h = '';
  if (!any) h += '<div class="note">Sans encadrement, vous ne voyez que la caisse et le stock : l’usine se lit aux tas de pièces. Chaque rôle recruté (onglet Équipe) ajoute ses données ici.</div>';
  else h += `<div class="seg" style="margin:4px 2px 10px"><button type="button" data-range="15" class="${range === '15' ? 'on' : ''}">15 min</button><button type="button" data-range="240" class="${range === '240' ? 'on' : ''}">4 h</button></div>`;
  // Contremaître
  if (roles.foreman) {
    h += `<div class="sec">${ROLE_NAMES.foreman}<span>cadences</span></div><div class="card col">`;
    s.factories.forEach((f, fi) => {
      const e = estimateFactory(s, fi);
      h += kv(`Usine ${fi + 1} · goulot : ${STATION_NAMES[e.bottleneck].toLowerCase()}`, `fc${fi}`);
      k[`fc${fi}`] = `${fmtP(e.x)} pièce/s · postes ${e.cap.map((x) => fmtP(x)).join(' / ')}`;
      void f;
    });
    h += '</div>' + chart('prod');
  }
  // Superviseur
  if (roles.supervisor) {
    h += `<div class="sec">${ROLE_NAMES.supervisor}<span>occupation, attente, usure</span></div><div class="card col">`;
    s.factories.forEach((f, fi) => {
      let busy = 0;
      let units = 0;
      let wearMax = 0;
      const wait = [0, 0, 0, 0];
      for (const l of f.lines) {
        for (let st = 1; st < 4; st++) wait[st] += l.buf[st];
        for (const u of l.slots) {
          if (!u) continue;
          units++;
          if (u.busy) busy++;
          if (u.tier > 0) wearMax = Math.max(wearMax, u.wear);
        }
      }
      h += kv(`Usine ${fi + 1}`, `sv${fi}`);
      k[`sv${fi}`] = `occupé ${pct(units ? busy / units : 0)} · attente ${wait.slice(1).join('/')} · usure max ${pct(wearMax)}`;
    });
    h += '</div>' + chart('idle');
    if (s.energy.solar + s.energy.wind + s.energy.battery > 0 || s.act >= 2) h += chart('nrg');
  }
  // RH
  if (roles.hr) {
    const lv = [0, 0, 0, 0, 0];
    let train = 0;
    let mor = 0;
    for (const w of s.workers) {
      lv[w.level]++;
      if (w.state === 'train') train++;
      mor += w.morale;
    }
    h += `<div class="sec">${ROLE_NAMES.hr}<span>compétences, moral</span></div><div class="card col">`;
    h += kv('Effectif', 'hr1') + kv('Moral moyen', 'hr2') + kv('Masse salariale', 'hr3');
    k.hr1 = [1, 2, 3, 4].filter((l) => lv[l]).map((l) => `${lv[l]} ${LEVEL_PLURAL[l]}`).join(' · ') + (train ? ` · ${train} en formation` : '');
    k.hr2 = pct(s.workers.length ? mor / s.workers.length : 0);
    k.hr3 = `${fmtP(s.workers.reduce((a, w) => a + salaryOf(w), 0))} €/s`;
    h += '</div>' + chart('morale');
  }
  // Logistique
  if (roles.logistics) {
    h += `<div class="sec">${ROLE_NAMES.logistics}<span>stock, autonomie, échéances</span></div><div class="card col">`;
    MATERIALS.forEach((_, m) => {
      if (!s.stock[m] && !s.market.prodRate[m]) return;
      h += kv(MATERIAL_NAMES[m], `lg${m}`);
      const out = s.long.filter((c) => c.accepted && c.material === m).reduce((a, c) => a + c.rate, 0);
      k[`lg${m}`] = `${fmt(s.stock[m])} en stock · ${fmtP(s.market.prodRate[m])}/s produits${out > 0 ? ` · ${fmtP(out)}/s sous contrat` : ''}`;
    });
    const next = s.spot.filter((c) => c.accepted).sort((a, b) => a.deadline - b.deadline)[0];
    h += kv('Prochaine échéance', 'lgd');
    k.lgd = next ? `${mmss(next.deadline - s.t)} · ${fmt(next.qty - next.delivered)} à livrer` : 'aucune';
    h += '</div>' + chart('stock');
  }
  // Commercial
  if (roles.sales) {
    h += `<div class="sec">${ROLE_NAMES.sales}<span>prévisions, prix</span></div><div class="card col">`;
    h += kv('Multiplicateur de prix', 'sl1') + kv('Part de marché', 'sl2') + kv('Tendance', 'sl3');
    k.sl1 = `×${fmtP(priceMult(s))}${s.market.priceWar > 0 ? ' (guerre des prix)' : ''}`;
    k.sl2 = pct(s.market.shareEma);
    const h5 = s.history.h5;
    const a = h5.length > 12 ? h5[h5.length - 12][HIST.share] : s.market.shareEma;
    const trend = s.market.shareEma - a;
    k.sl3 = `${trend >= 0 ? '+' : '−'}${pct(Math.abs(trend))} par minute`;
    h += '</div>' + chart('share');
  }
  // Contrôleur de gestion
  if (roles.controller) {
    const f = s.flow;
    const pieces = Math.max(1e-6, s.history.h5.length ? s.history.h5[s.history.h5.length - 1][HIST.prod] : 0);
    const costs = f.raw + f.salaries + Math.max(0, f.energy) + f.maintenance;
    h += `<div class="sec">${ROLE_NAMES.controller}<span>compte de résultat</span></div><div class="card col">`;
    h += kv('Recettes', 'cg1') + kv('Matière', 'cg2') + kv('Salaires', 'cg3') + kv('Énergie', 'cg4') + kv('Maintenance', 'cg5') + kv('Bénéfice', 'cg6') + kv('Coût de revient', 'cg7');
    k.cg1 = `${fmtP(f.revenue + f.contracts)} €/s`;
    k.cg2 = `${fmtP(f.raw)} €/s`;
    k.cg3 = `${fmtP(f.salaries)} €/s`;
    k.cg4 = `${fmtP(f.energy)} €/s`;
    k.cg5 = `${fmtP(f.maintenance)} €/s`;
    k.cg6 = `${fmtP(f.revenue + f.contracts - costs)} €/s`;
    k.cg7 = `${fmtP(costs / pieces)} € la pièce`;
    h += '</div>' + chart('fin') + chart('cash');
  }
  // Rôles manquants
  const missing = ROLES.filter((r) => !roles[r.id]);
  if (missing.length && any) {
    h += '<div class="sec">À débloquer<span>onglet Équipe</span></div>';
    for (const r of missing) h += `<div class="card dim"><div class="ic" aria-hidden="true">🔒</div><div class="info"><div class="nm">${ROLE_NAMES[r.id]}</div><div class="vis">${ROLE_DATA[r.id]}</div></div></div>`;
  } else if (!any) {
    for (const r of ROLES) h += `<div class="card dim"><div class="ic" aria-hidden="true">🔒</div><div class="info"><div class="nm">${ROLE_NAMES[r.id]}</div><div class="vis">${ROLE_DATA[r.id]}</div></div></div>`;
  }
  return {
    sig, html: h, k, d: {}, w: {},
    after: (list) => {
      bind(list);
      list.querySelectorAll<HTMLCanvasElement>('canvas.chart').forEach((c) => drawChart(c, s));
    },
  };
}
