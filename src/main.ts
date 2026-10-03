import './styles.css';
import { ambience, initAudio, setSound, sfx, suspendAudio, workSound } from './audio/audio';
import { SIM_DT } from './data/balance';
import { G, inRed, loadSettings, newGame, saveSettings, tachoTick, tapBoost } from './game';
import type { Tab } from './game';
import { installDebug } from './debug';
import { setParticleBudget, sparks, updateParticles } from './render/particles';
import { Camera, INTERIOR_PX, drawScene, hitTest, saleFloat, viewBounds, worldOfStation } from './render/scene';
import type { Hover } from './render/scene';
import { PostFx } from './render/postfx';
import { hallOrigin } from './render/layout';
import * as A from './sim/actions';
import { step } from './sim/engine';
import { windFactor } from './sim/env';
import { catchUp } from './sim/offline';
import { createGame } from './sim/state';
import type { GameState, SimEvent } from './sim/types';
import { storyTick } from './story/director';
import { endingMsgs } from './story/script';
import { clearSave, hasSave, loadLocal, saveLocal } from './save/save';
import * as U from './ui/actions';
import { updateConsole, updateGauge } from './ui/console';
import { $, reducedMotion } from './ui/dom';
import { dur, fmt } from './ui/format';
import { closeOverlay, overlayOpen, showEnd, showHelp, showMenu, showReport, showTitle } from './ui/overlay';
import { initPanel, invalidatePanel, renderPanel, setTab } from './ui/panel';
import { initTelex, telex, telexAdvance, telexClose, telexOpen } from './ui/telex';
import { toast } from './ui/toast';
import { showTooltip } from './ui/tooltip';
import { ACT_NAMES, LEVEL_NAMES, STATION_NAMES } from './ui/text';
import { setPanelHooks } from './ui/views';

// ------------------------------------------------------------------ Canvas

const stage = $('stage');
const cv = $('cv') as HTMLCanvasElement;
const ctx = cv.getContext('2d')!;
const glowCv = document.createElement('canvas');
const gctx = glowCv.getContext('2d')!;
const post = new PostFx($('glcv') as HTMLCanvasElement);
let cw = 1;
let ch = 1;
let dpr = 1;
const cam = new Camera();

function resize(): void {
  const r = stage.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  cw = Math.max(1, Math.round(r.width * dpr));
  ch = Math.max(1, Math.round(r.height * dpr));
  for (const c of [cv, glowCv]) {
    c.width = cw;
    c.height = ch;
  }
  post.resize(cw, ch);
}
new ResizeObserver(resize).observe(stage);
resize();

// ------------------------------------------------------------------ Thème et réglages

function applyTheme(): void {
  const t = G.settings.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  $('btnTheme').textContent = `Thème : ${{ auto: 'auto', light: 'clair', dark: 'sombre' }[t]}`;
}

function applySettings(): void {
  applyTheme();
  $('btnSound').setAttribute('aria-pressed', String(G.settings.sound));
  $('btnFx').setAttribute('aria-pressed', String(G.settings.fx && post.ok));
  if (!post.ok) $('btnFx').title = 'WebGL indisponible : effets désactivés';
  setSound(G.settings.sound);
  setParticleBudget(reducedMotion() ? 0.3 : 1);
}

// ------------------------------------------------------------------ Effets des événements

function screenPan(fi: number, l: number, si: number): number {
  const p = worldOfStation(G.s, fi, l, si);
  const x = cw / 2 + (p.x - cam.x) * cam.zoom;
  return Math.max(-1, Math.min(1, (x / cw) * 2 - 1));
}

function interiorVisible(): boolean {
  return 400 * cam.zoom >= INTERIOR_PX;
}

/** Ventes cumulées depuis le dernier « +€ » affiché au-dessus de la caisse. */
let saleAcc = 0;
let saleT = 0;
function saleTick(rdt: number): void {
  saleT += rdt;
  if (saleT < 1.2) return;
  saleT = 0;
  if (saleAcc > 0 && interiorVisible() && !G.paused) saleFloat(G.s, G.factory, `+${fmt(saleAcc)} €`);
  saleAcc = 0;
}

/** Montre une usine : elle devient celle du panneau et la caméra s'y place. */
function focusFactory(fi: number): void {
  const n = G.s.factories.length;
  G.factory = ((fi % n) + n) % n;
  if (n > 1) {
    const o = hallOrigin(G.factory, n);
    cam.tx = o.x + 200;
    cam.ty = o.y + 202;
    cam.tz = Math.max(cam.tz, Math.min(cw / 420, ch / 424));
    cam.user = true;
  }
  invalidatePanel();
  renderPanel();
}

function handleEvents(events: SimEvent[]): void {
  const s = G.s;
  let pieces = 0;
  for (const e of events) {
    switch (e.type) {
      case 'piece': {
        if (pieces++ > 30) break;
        const m = s.factories[e.factory]?.lines[e.line]?.slots[e.station];
        if (!m) break;
        if (interiorVisible()) {
          const p = worldOfStation(s, e.factory, e.line, e.station);
          if (e.station === 1) sparks(p.x, p.y, m.tier ? 6 : 4);
          else if (e.station === 0) sparks(p.x, p.y, 3, '#ffe9b0');
          else if (m.tier === 4) sparks(p.x, p.y + 6, 2, '#4fd8ff');
        }
        workSound(e.station, m.tier, screenPan(e.factory, e.line, e.station));
        break;
      }
      case 'sale':
        sfx('coin');
        saleAcc += e.value;
        break;
      case 'breakdown':
        sfx('fail', screenPan(e.factory, e.line, e.station));
        toast(`⚠ Panne : ${STATION_NAMES[e.station].toLowerCase()}, chaîne ${e.line + 1}${s.factories.length > 1 ? `, usine ${e.factory + 1}` : ''}${s.research.workshop ? ' (réparation lancée)' : ''}`, true);
        break;
      case 'repaired':
        sfx('repair', screenPan(e.factory, e.line, e.station));
        toast(`🔧 Réparé : ${STATION_NAMES[e.station].toLowerCase()}, chaîne ${e.line + 1}`);
        break;
      case 'trained': {
        const w = s.workers.find((x) => x.id === e.worker);
        sfx('hire');
        if (w) toast(e.promoted ? `🎖 ${w.name} promu·e : ${LEVEL_NAMES[e.level].toLowerCase()}` : `🎓 ${w.name} : formation terminée (${w.trainings}/5)`);
        break;
      }
      case 'hrTrain': {
        const w = s.workers.find((x) => x.id === e.worker);
        if (w) toast(e.promote ? `📋 RH : ${w.name} part en promotion (${LEVEL_NAMES[Math.min(4, w.level + 1)].toLowerCase()})` : `📋 RH : ${w.name} part en formation`);
        break;
      }
      case 'goal':
        sfx('milestone');
        break;
      case 'ferrum':
        sfx('warn');
        break;
      case 'spotDone':
        sfx('cash');
        toast(`📄 Contrat livré : +${fmt(e.value)} €`);
        break;
      case 'spotFailed':
        sfx('fail');
        toast('📄 Contrat manqué : réputation en baisse', true);
        break;
      case 'longBroken':
        sfx('fail');
        toast('📑 Rupture d’approvisionnement : contrat long terme perdu', true);
        break;
      case 'gridCut':
        sfx('warn');
        break;
      case 'gridBack':
        toast('⚡ Réseau rétabli');
        break;
      case 'warEnd':
        toast('Fin de la guerre des prix');
        break;
      default:
        break;
    }
  }
}

function runStory(events: SimEvent[]): void {
  const out = storyTick(G.s, events);
  if (out.msgs.length) telex(out.msgs);
  for (const m of out.milestones) {
    sfx('milestone');
    toast(`🏅 Jalon : ${m.label}${m.reward > 0 ? ` (+${fmt(m.reward)} €)` : ''}`);
  }
}

// ------------------------------------------------------------------ Sauvegarde et absence

let lastSave = 0;
function save(): void {
  if (!G.started) return;
  saveLocal(G.s, Date.now());
  lastSave = performance.now();
}

function absence(seconds: number): void {
  if (seconds < 5 || !G.started) return;
  const r = catchUp(G.s, seconds);
  if (r.seconds >= 60) {
    const lines = [
      `L’usine a tourné ${dur(r.seconds)} sans vous, à vitesse normale.`,
      `${fmt(r.produced)} écrous produits, ${fmt(r.sold)} vendus.`,
      `Caisse : ${r.money >= 0 ? '+' : '−'}${fmt(Math.abs(r.money))} €.${r.breakdowns ? ` ${r.breakdowns} panne${r.breakdowns > 1 ? 's' : ''} pendant votre absence.` : ''}`,
    ];
    G.paused = true;
    showReport('Rapport d’absence', lines, () => (G.paused = false));
  }
  invalidatePanel();
}

let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  suspendAudio(document.hidden);
  if (document.hidden) {
    hiddenAt = Date.now();
    save();
  } else if (hiddenAt) {
    const el = (Date.now() - hiddenAt) / 1000;
    hiddenAt = 0;
    if (!G.paused) absence(el);
  }
});
window.addEventListener('pagehide', save);

// ------------------------------------------------------------------ Démarrage

function begin(): void {
  G.started = true;
  G.paused = false;
  cam.fit(viewBounds(G.s).b, cw, ch, true);
  invalidatePanel();
  renderPanel();
  save();
}

function startNew(): void {
  clearSave();
  telexClose();
  newGame();
  begin();
}

function title(): void {
  G.paused = true;
  const f = loadLocal();
  showTitle({
    hasSave: !!f,
    summary: f ? `${ACT_NAMES[f.state.act]} · ${fmt(f.state.money)} €` : '',
    onContinue: () => {
      if (!f) return startNew();
      G.s = f.state;
      G.factory = 0;
      begin();
      if (f.savedAt) absence((Date.now() - f.savedAt) / 1000);
    },
    onNew: startNew,
  });
}

// ------------------------------------------------------------------ Fin de l'histoire

let forgeState: GameState | null = null;
function startFinale(): void {
  if (!A.canBuyout(G.s)) {
    sfx('denied');
    return;
  }
  A.buyout(G.s);
  sfx('milestone');
  telexClose();
  G.finale = { t: performance.now() };
  forgeState = createGame(7);
  forgeState.t = 300;
  if (G.s.ending === 'warm') {
    for (let i = 0; i < 6; i++) A.hire(forgeState, 0);
    for (const si of [0, 1, 2]) A.addUnit(forgeState, 0, si);
    forgeState.money = 1e6;
  }
  forgeState.debt = 1e9;
  forgeState.due = 1e9;
  save();
}

function finaleTick(): { phase: 'off' | 'forge'; k: number } | undefined {
  if (!G.finale) return undefined;
  const t = (performance.now() - G.finale.t) / 1000;
  if (t < 4) return { phase: 'off', k: Math.min(1, t / 3) };
  if (t < 9) return { phase: 'forge', k: Math.min(1, (t - 4.5) / 3) };
  if (!overlayOpen() && !telexOpen()) {
    G.finale = null;
    forgeState = null;
    telex(endingMsgs(G.s));
    const st = G.s.stats;
    showEnd(
      [
        G.s.ending === 'warm' ? 'Marcel a rallumé les lumières de la vieille forge, entouré des anciens.' : 'Marcel a rallumé seul les lumières de la vieille forge.',
        `${fmt(st.produced)} écrous produits, ${fmt(st.revenueTotal)} € de chiffre d’affaires, ${st.moves} déménagements, ${dur(st.playTime)} de temps de jeu.`,
        `${st.retrained} ouvriers reconvertis, ${st.laidOff} licenciés.`,
      ],
      () => {
        G.paused = false;
        invalidatePanel();
      },
    );
    G.paused = true;
  }
  return { phase: 'forge', k: 1 };
}

setPanelHooks({
  buyout: startFinale,
  move: () => {
    if (U.move()) {
      cam.fit(viewBounds(G.s).b, cw, ch, true);
      invalidatePanel();
      save();
    }
  },
  newSite: () => {
    if (U.newSite()) {
      cam.fit(viewBounds(G.s).b, cw, ch, true);
      invalidatePanel();
      save();
    }
  },
});

// ------------------------------------------------------------------ Entrées

let hover: Hover | null = null;
let drag: { x: number; y: number; moved: boolean; button: number } | null = null;
let mouse = { x: -1, y: -1, in: false };

function markInput(): void {
  G.lastInput = performance.now();
}

stage.addEventListener('pointerdown', (e) => {
  if ((e.target as HTMLElement).closest('.telex')) return;
  initAudio();
  markInput();
  stage.setPointerCapture(e.pointerId);
  drag = { x: e.clientX, y: e.clientY, moved: false, button: e.button };
  if (e.button === 0 && !G.paused) {
    G.pointerHeld = true;
    tapBoost();
    sfx('tap', 0, G.rev);
  }
  e.preventDefault();
});
stage.addEventListener('pointermove', (e) => {
  const r = stage.getBoundingClientRect();
  mouse = { x: e.clientX - r.left, y: e.clientY - r.top, in: true };
  if (drag) {
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) > 6) {
      drag.moved = true;
      G.pointerHeld = false;
      stage.classList.add('grab');
    }
    if (drag.moved) {
      cam.pan(dx * dpr, dy * dpr);
      drag.x = e.clientX;
      drag.y = e.clientY;
    }
  }
});
const release = () => {
  G.pointerHeld = false;
  drag = null;
  stage.classList.remove('grab');
};
stage.addEventListener('pointerup', release);
stage.addEventListener('pointercancel', release);
stage.addEventListener('pointerleave', () => {
  mouse.in = false;
  showTooltip(null, 0, 0);
});
stage.addEventListener('contextmenu', (e) => e.preventDefault());
stage.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = stage.getBoundingClientRect();
  cam.zoomAt(Math.pow(1.0015, -e.deltaY), (e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr, cw, ch, viewBounds(G.s).b);
}, { passive: false });
stage.addEventListener('dblclick', (e) => {
  const r = stage.getBoundingClientRect();
  const h = hitTest(G.s, cam, (e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr, cw, ch);
  if (h && G.s.factories.length > 1) {
    setTab('atelier');
    focusFactory(h.hall);
  } else cam.fit(viewBounds(G.s).b, cw, ch);
});

const TABS: Tab[] = ['atelier', 'equipe', 'rd', 'marche', 'donnees'];
document.addEventListener('keydown', (e) => {
  const tgt = e.target as HTMLElement;
  if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA')) return;
  markInput();
  const ov = overlayOpen();
  if (e.key === 'Escape') {
    if (ov && ov !== 'title') closeOverlay();
    else if (telexOpen()) telexClose();
    return;
  }
  if (ov) {
    if (e.key === 'Enter' && ov === 'report') closeOverlay();
    return;
  }
  if (e.code === 'Space') {
    e.preventDefault();
    if (!e.repeat && !G.paused) {
      initAudio();
      G.spaceHeld = true;
      tapBoost();
      sfx('tap', 0, G.rev);
    }
    return;
  }
  if (e.key === 'Enter' && telexOpen() && (tgt === document.body || tgt.id === 'tOk' || tgt.closest('.telex'))) {
    e.preventDefault();
    telexAdvance();
    return;
  }
  if (e.key >= '1' && e.key <= '5' && !e.ctrlKey && !e.altKey && !e.metaKey) {
    setTab(TABS[+e.key - 1]);
    return;
  }
  if (e.key === 'h' || e.key === 'H') {
    G.paused = true;
    showHelp(() => (G.paused = false));
    return;
  }
  if (e.key === '0') cam.fit(viewBounds(G.s).b, cw, ch);
  if (e.key === '[' || e.key === ']') focusFactory(G.factory + (e.key === ']' ? 1 : -1));
  if (e.key === '+' || e.key === '=') cam.zoomAt(1.25, cw / 2, ch / 2, cw, ch, viewBounds(G.s).b);
  if (e.key === '-') cam.zoomAt(0.8, cw / 2, ch / 2, cw, ch, viewBounds(G.s).b);
});
document.addEventListener('keyup', (e) => {
  if (e.code === 'Space') G.spaceHeld = false;
});
window.addEventListener('blur', () => {
  G.spaceHeld = false;
  G.pointerHeld = false;
});

$('btnSound').addEventListener('click', () => {
  G.settings.sound = !G.settings.sound;
  saveSettings();
  applySettings();
  if (G.settings.sound) {
    initAudio();
    sfx('click');
  }
  toast(G.settings.sound ? '🔊 Son activé' : '🔇 Son coupé');
});
$('btnFx').addEventListener('click', () => {
  if (!post.ok) {
    toast('WebGL indisponible : effets désactivés', true);
    return;
  }
  G.settings.fx = !G.settings.fx;
  saveSettings();
  applySettings();
  toast(G.settings.fx ? 'Effets activés' : 'Effets désactivés');
});
$('btnTheme').addEventListener('click', () => {
  G.settings.theme = ({ auto: 'light', light: 'dark', dark: 'auto' } as const)[G.settings.theme];
  saveSettings();
  applyTheme();
});
$('btnHelp').addEventListener('click', () => {
  G.paused = true;
  showHelp(() => (G.paused = false));
});
$('btnMenu').addEventListener('click', () => {
  G.paused = true;
  const st = G.s.stats;
  showMenu({
    onResume: () => (G.paused = false),
    onNew: () => {
      startNew();
    },
    stats: `${ACT_NAMES[G.s.act]} · ${fmt(st.produced)} écrous produits · ${dur(st.playTime)} de jeu.`,
  });
});

// ------------------------------------------------------------------ Ambiance sonore

let ambT = 0;
function ambientTick(view: GameState): void {
  const now = performance.now();
  if (now - ambT < 150) return;
  ambT = now;
  let busy = 0;
  let units = 0;
  let robots = 0;
  let black = 0;
  for (const f of view.factories) for (const l of f.lines) for (const u of l.slots) {
    if (!u) continue;
    units++;
    if (u.busy) busy++;
    if (u.tier === 3) robots++;
    if (u.tier === 4) black++;
  }
  const lit = G.finale ? 0 : 1;
  ambience({
    activity: lit * (units ? Math.min(1, busy / units + 0.15) : 0),
    speed: G.speed,
    workers: view.workers.length,
    turbines: view.energy.wind,
    wind: windFactor(view.t),
    robots: robots * lit,
    black: black * lit,
    windPan: 0,
  });
}

// ------------------------------------------------------------------ Boucle

let last = performance.now();
let acc = 0;
let uiT = 0;
let storyT = 0;
let hoverT = 0;
const pending: SimEvent[] = [];

function frame(now: number): void {
  try {
    tick(now);
  } catch (err) {
    console.error(err);
  }
  requestAnimationFrame(frame);
}

function tick(now: number): void {
  const rdt = Math.min((now - last) / 1000, 0.1);
  last = now;
  const s = G.s;
  if (!G.paused && G.started && !G.finale) {
    tachoTick(rdt);
    acc += rdt * G.speed;
    let n = 0;
    const red = inRed();
    while (acc >= SIM_DT && n < 80) {
      step(s, SIM_DT, { red });
      acc -= SIM_DT;
      n++;
    }
    if (n >= 80) acc = 0;
    if (s.fx.length) {
      handleEvents(s.fx);
      for (const e of s.fx) if (e.type !== 'piece' && e.type !== 'sale' && e.type !== 'scrap') pending.push(e);
      s.fx.length = 0;
    }
    storyT += rdt;
    if (storyT > 0.4) {
      storyT = 0;
      runStory(pending.splice(0));
    }
    if (now - lastSave > 10000) save();
  } else {
    G.rev = Math.max(0, G.rev - rdt * 0.5);
    G.speed = 1;
  }
  updateParticles(rdt);
  const fin = finaleTick();
  const view = fin && fin.phase === 'forge' && forgeState ? forgeState : s;
  if (view === forgeState && forgeState) step(forgeState, rdt, { red: false });
  const vb = viewBounds(view);
  cam.update(vb.b, vb.key, cw, ch, rdt);
  if (fin?.phase === 'forge' && view === forgeState) cam.fit(vb.b, cw, ch, true);
  hoverT += rdt;
  if (hoverT > 0.1) {
    hoverT = 0;
    hover = mouse.in && !drag?.moved ? hitTest(view, cam, mouse.x * dpr, mouse.y * dpr, cw, ch) : null;
    showTooltip(hover && (hover.worker >= 0 || hover.station !== -1 || hover.line >= 0 || view.factories.length > 1) ? hover : null, mouse.x, mouse.y);
  }
  const useGl = post.ok && G.settings.fx;
  drawScene({ ctx, glow: useGl ? gctx : null, cw, ch }, view, cam, {
    T: now / 1000, red: inRed(), rev: G.rev, selected: G.factory, reduced: reducedMotion(), finale: fin, hover, highlight: G.highlight,
  }, rdt);
  post.render(useGl, cv, glowCv, now / 1000, view, inRed());
  updateGauge();
  ambientTick(view);
  saleTick(rdt);
  $('hint').classList.toggle('show', G.started && !G.paused && s.act === 0 && s.t < 120 && G.lastInput === 0 && !telexOpen());
  uiT += rdt;
  if (uiT > 0.2) {
    uiT = 0;
    updateConsole();
    renderPanel();
  }
}

// ------------------------------------------------------------------ Lancement

loadSettings();
applySettings();
initTelex();
initPanel();
$('hint').textContent = 'Maintenez le clic sur l’atelier (ou la barre d’espace) pour accélérer le temps';
updateConsole();
renderPanel();
// Accès de test : en développement, sous navigateur piloté (Playwright) ou avec ?debug.
if (import.meta.env.DEV || navigator.webdriver || location.search.includes('debug')) {
  installDebug({ begin, cam, getCanvas: () => cv, absence, startFinale });
}
title();
void hasSave;
requestAnimationFrame(frame);
