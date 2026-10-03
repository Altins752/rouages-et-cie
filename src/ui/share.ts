/**
 * Partager : mode carte postale (l'usine seule, en grand, avec capture PNG) et carte de fin de
 * partie (image et résumé texte à envoyer). Rien n'est publié : tout se télécharge en local.
 */
import { sfx } from '../audio/audio';
import { G } from '../game';
import type { GameState } from '../sim/types';
import { $ } from './dom';
import { dur, fmt } from './format';
import { ACT_NAMES, SITE_NAMES } from './text';
import { unlock } from './achievements';
import { toast } from './toast';

export function postcardOn(): boolean {
  return document.body.classList.contains('postcard');
}

function bar(): HTMLElement {
  let el = document.getElementById('postcard');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'postcard';
  el.className = 'postcard-bar';
  el.innerHTML = '<button type="button" id="pcShot" class="buy"><span class="c">📷 Capturer</span><small>enregistre une image</small></button><button type="button" id="pcExit" class="buy plain"><span class="c">Revenir au pupitre</span><small>P ou Échap</small></button>';
  $('stage').appendChild(el);
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.querySelector('#pcShot')!.addEventListener('click', () => capture());
  el.querySelector('#pcExit')!.addEventListener('click', () => togglePostcard(false));
  return el;
}

/** Bascule le mode carte postale : pupitre, panneau et carnet masqués, l'usine plein écran. */
export function togglePostcard(on = !postcardOn()): void {
  bar();
  document.body.classList.toggle('postcard', on);
  sfx('click');
  if (on) ($('pcShot') as HTMLElement).focus();
}

function download(c: HTMLCanvasElement, name: string): void {
  c.toBlob((b) => {
    if (!b) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, 'image/png');
}

const stamp = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Bandeau de pupitre en bas d'une image : nom du jeu, site, acte, chiffres. */
function banner(ctx: CanvasRenderingContext2D, w: number, h: number, k: number, lines: [string, string]): void {
  const bh = 64 * k;
  const y = h - bh;
  ctx.fillStyle = 'rgba(14,15,17,.92)';
  ctx.fillRect(0, y, w, bh);
  for (let x = -bh; x < w; x += 22 * k) {
    ctx.fillStyle = '#f2b705';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 11 * k, y);
    ctx.lineTo(x + 11 * k - 6 * k, y + 6 * k);
    ctx.lineTo(x - 6 * k, y + 6 * k);
    ctx.fill();
  }
  ctx.fillStyle = '#f2b705';
  ctx.font = `${26 * k}px "Saira Stencil One", "Chakra Petch", sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText('Rouages & Cie', 18 * k, y + 36 * k);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffb02e';
  ctx.font = `${15 * k}px "Share Tech Mono", monospace`;
  ctx.fillText(lines[0], w - 18 * k, y + 26 * k);
  ctx.fillStyle = '#c9cfd6';
  ctx.fillText(lines[1], w - 18 * k, y + 46 * k);
}

/** Capture l'usine telle qu'à l'écran, avec un bandeau, en PNG. */
export function capture(): void {
  // l'image finale : le post-traitement s'il est affiché, sinon la scène 2D ; puis les signaux
  const gl = document.getElementById('glcv') as HTMLCanvasElement;
  const src = gl.style.visibility === 'visible' ? gl : (document.getElementById('cv') as HTMLCanvasElement);
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  ctx.drawImage(document.getElementById('uicv') as HTMLCanvasElement, 0, 0);
  const s = G.s;
  const k = Math.max(1, c.width / 1400);
  const site = s.ended && s.act === 5 ? 'Groupe Rouages & Cie' : SITE_NAMES[s.act];
  banner(ctx, c.width, c.height, k, [`${site} · ${ACT_NAMES[s.act]}`, `${fmt(s.stats.produced)} écrous produits · ${s.factories.length} usine${s.factories.length > 1 ? 's' : ''} · ${stamp()}`]);
  download(c, `rouages-cie-${stamp()}.png`);
  sfx('cash');
  toast('📷 Carte postale enregistrée');
  unlock('postcard');
}

/** Résumé texte de fin de partie, à coller dans une conversation. */
export function endSummary(s: GameState): string {
  const st = s.stats;
  return [
    `Rouages & Cie : j'ai racheté Ferrum Industries ! (${s.ending === 'warm' ? 'fin chaleureuse' : 'fin amère'})`,
    `⏱ ${dur(st.playTime)} de jeu · 🔩 ${fmt(st.produced)} écrous · 💶 ${fmt(st.revenueTotal)} € de chiffre d'affaires`,
    `🎓 ${st.trainings} formations, ${st.promotions} promotions · 🤝 ${st.retrained} reconvertis, ${st.laidOff} licenciés`,
    `🏭 ${s.factories.length} usines · 📄 ${st.contractsDone} commandes livrées · 🎖 ${st.knowHowEarned} points de savoir-faire`,
  ].join('\n');
}

/** Carte de fin 1200 × 630 (format des aperçus de liens) en PNG. */
export function endCard(s: GameState): void {
  const w = 1200;
  const h = 630;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#3a3f46');
  g.addColorStop(1, '#1d2025');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // tôle larmée discrète
  ctx.strokeStyle = 'rgba(255,255,255,.04)';
  ctx.lineWidth = 3;
  for (let y = 20; y < h; y += 26) for (let x = (y / 26) % 2 ? 10 : 23; x < w; x += 26) {
    ctx.beginPath();
    ctx.moveTo(x - 5, y + 3);
    ctx.lineTo(x + 5, y - 3);
    ctx.stroke();
  }
  for (let x = -40; x < w; x += 44) {
    ctx.fillStyle = '#f2b705';
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 22, 0);
    ctx.lineTo(x + 10, 18);
    ctx.lineTo(x - 12, 18);
    ctx.fill();
  }
  ctx.fillStyle = '#f2b705';
  ctx.font = '64px "Saira Stencil One", "Chakra Petch", sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('Rouages & Cie', 60, 120);
  ctx.fillStyle = '#e9e4d6';
  ctx.font = '600 30px "Chakra Petch", sans-serif';
  ctx.fillText('a racheté Ferrum Industries.', 60, 168);
  ctx.fillStyle = s.ending === 'warm' ? '#7dff9a' : '#ff8a7a';
  ctx.font = '22px "Share Tech Mono", monospace';
  ctx.fillText(s.ending === 'warm' ? 'Fin chaleureuse : Marcel a rallumé la vieille forge, entouré des anciens.' : 'Fin amère : Marcel a rallumé seul la vieille forge.', 60, 212);
  const st = s.stats;
  const tiles: [string, string][] = [
    ['Temps de jeu', dur(st.playTime)],
    ['Écrous produits', fmt(st.produced)],
    ['Chiffre d’affaires', `${fmt(st.revenueTotal)} €`],
    ['Usines', String(s.factories.length)],
    ['Formations', String(st.trainings)],
    ['Promotions', String(st.promotions)],
    ['Reconvertis / licenciés', `${st.retrained} / ${st.laidOff}`],
    ['Commandes livrées', fmt(st.contractsDone)],
  ];
  tiles.forEach(([label, value], i) => {
    const x = 60 + (i % 4) * 275;
    const y = 270 + Math.floor(i / 4) * 150;
    ctx.fillStyle = '#0e0f11';
    ctx.fillRect(x, y, 250, 120);
    ctx.strokeStyle = '#4a4e55';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, 248, 118);
    ctx.fillStyle = '#9aa1aa';
    ctx.font = '600 18px "Chakra Petch", sans-serif';
    ctx.fillText(label, x + 18, y + 38);
    ctx.fillStyle = '#ffb02e';
    ctx.font = '36px "Share Tech Mono", monospace';
    ctx.fillText(value, x + 18, y + 90);
  });
  ctx.fillStyle = '#7e868f';
  ctx.font = '18px "Share Tech Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`un jeu sur la cadence, l’organisation et la valeur d’une pièce · ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`, w - 60, h - 24);
  download(c, `rouages-cie-fin-${stamp()}.png`);
  sfx('cash');
}

/** Copie le résumé texte dans le presse-papiers. */
export async function copySummary(s: GameState): Promise<void> {
  try {
    await navigator.clipboard.writeText(endSummary(s));
    toast('📋 Résumé copié : il ne reste qu’à le coller à vos amis');
  } catch {
    toast('Copie impossible dans ce navigateur', true);
  }
}
