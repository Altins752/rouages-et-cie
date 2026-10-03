/** Surcouches plein écran : écran titre, menu, aide, rapport d'absence, fin. */
import { sfx } from '../audio/audio';
import { $ } from './dom';

let closeHandler: (() => void) | null = null;
let current = '';

export function overlayOpen(): string {
  return current;
}

function open(id: string, html: string, onClose: (() => void) | null): void {
  const o = $('overlay');
  o.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="ovTitle">${html}</div>`;
  o.hidden = false;
  current = id;
  closeHandler = onClose;
  const first = o.querySelector<HTMLElement>('[data-autofocus]') ?? o.querySelector<HTMLElement>('button');
  first?.focus();
}

export function closeOverlay(): void {
  const o = $('overlay');
  if (o.hidden) return;
  o.hidden = true;
  o.innerHTML = '';
  current = '';
  const h = closeHandler;
  closeHandler = null;
  h?.();
}

export interface TitleOpts {
  hasSave: boolean;
  summary: string;
  onContinue: () => void;
  onNew: () => void;
}

export function showTitle(o: TitleOpts): void {
  let armed = false;
  open(
    'title',
    `<h1 id="ovTitle">Rouages &amp; Cie</h1>
    <div class="subtitle">De la forge du grand-père au groupe industriel mondial. Un seul produit : l’écrou.</div>
    <div class="menu">
      ${o.hasSave ? `<button class="buy" type="button" id="ovCont" data-autofocus><span class="c">Continuer</span><small>${o.summary}</small></button>` : ''}
      <button class="buy ${o.hasSave ? 'plain' : ''}" type="button" id="ovNew" ${o.hasSave ? '' : 'data-autofocus'}><span class="c">Nouvelle partie</span><small id="ovNewSub">${o.hasSave ? 'efface la partie en cours' : 'la forge vous attend'}</small></button>
    </div>
    <p class="credits">Souris : maintenir le clic sur l’usine pour accélérer le temps · molette pour zoomer · glisser pour se déplacer<br>
    Clavier : barre d’espace (accélérer) · 1 à 5 (onglets) · H (aide) · Échap (fermer le télex)</p>`,
    null,
  );
  $('ovCont')?.addEventListener('click', () => {
    sfx('click');
    closeOverlay();
    o.onContinue();
  });
  $('ovNew').addEventListener('click', () => {
    if (o.hasSave && !armed) {
      armed = true;
      $('ovNewSub').textContent = 'cliquez encore pour confirmer';
      sfx('warn');
      return;
    }
    sfx('click');
    closeOverlay();
    o.onNew();
  });
}

export function showHelp(onClose: () => void): void {
  open(
    'help',
    `<h2 id="ovTitle">Aide</h2>
    <p>Vous fabriquez des écrous sur une ligne à quatre postes : <b>découpe</b>, <b>frappe</b>, <b>taraudage</b>, <b>contrôle</b>. Le débit d’une chaîne est celui de son poste le plus lent : le <b>goulot</b>. Là où les pièces s’entassent, c’est là que ça coince.</p>
    <p>Une usine compte quatre <b>chaînes</b>, achetées poste par poste. Quatre leviers : le <b>personnel</b> (chacun garde son poste ; former, puis promouvoir), la <b>technologie</b> (postes, machines, outillage, convoyeurs), les <b>usines</b> et le <b>matériau</b> (chaque écrou vaut plus).</p>
    <p>Survolez un bouton d’achat : ce qu’il touche clignote dans l’usine. Sous un achat trop cher, le délai indique quand la caisse suffira au rythme actuel.</p>
    <p>Le clic ne fabrique rien : il <b>accélère le temps</b>. Clic maintenu = zone verte. Pour la zone rouge, il faut cliquer très vite… et les machines s’usent cinq fois plus.</p>
    <h3>Commandes</h3>
    <table>
      <tr><td>Clic maintenu / Espace</td><td>Accélérer le temps (zone verte)</td></tr>
      <tr><td>Clics rapides</td><td>Monter en zone rouge</td></tr>
      <tr><td>Molette</td><td>Zoomer sur l’usine</td></tr>
      <tr><td>Glisser</td><td>Se déplacer quand l’usine dépasse l’écran</td></tr>
      <tr><td>Double-clic sur un hall</td><td>Choisir l’usine affichée dans le panneau</td></tr>
      <tr><td>[ et ]</td><td>Usine précédente, usine suivante</td></tr>
      <tr><td>0</td><td>Recadrer la vue sur tout le site</td></tr>
      <tr><td>+ et −</td><td>Zoomer, dézoomer</td></tr>
      <tr><td>1 à 5</td><td>Onglets Atelier, Équipe, R&amp;D, Marché, Données</td></tr>
      <tr><td>Entrée / Échap</td><td>Passer / fermer le télex</td></tr>
      <tr><td>P</td><td>Carte postale : l’usine en grand, capture d’image</td></tr>
      <tr><td>H</td><td>Cette aide</td></tr>
      <tr><td>Tab, flèches</td><td>Naviguer au clavier dans le panneau</td></tr>
      <tr><td>Entrée</td><td>Activer le bouton sélectionné (la barre d’espace est réservée au temps)</td></tr>
    </table>
    <div class="menu"><button class="buy" type="button" id="ovClose" data-autofocus><span class="c">Reprendre</span><small>Échap</small></button></div>`,
    onClose,
  );
  $('ovClose').addEventListener('click', () => closeOverlay());
}

/** Carnet du grand-père : pages trouvées en clair, les autres avec un indice. */
export function showNotebook(pages: { id: string; title: string; hint: string; text: string }[], got: Record<string, number>, onClose: () => void): void {
  const n = pages.filter((p) => got[p.id]).length;
  open(
    'notebook',
    `<h2 id="ovTitle">Carnet du grand-père <small class="ach-count">${n}/${pages.length} pages</small></h2>
    <div class="notebook">${pages.map((p, i) => got[p.id]
      ? `<article class="page"><h3>${p.title}</h3><p>${p.text}</p></article>`
      : `<article class="page locked"><h3>Page ${i + 1}</h3><p>${p.hint}</p></article>`).join('')}</div>
    <div class="menu"><button class="buy" type="button" id="ovClose" data-autofocus><span class="c">Reprendre</span><small>Échap</small></button></div>`,
    onClose,
  );
  $('ovClose').addEventListener('click', () => closeOverlay());
}

/** Liste des succès : débloqués en clair, les autres en grisé. */
export function showAchievements(list: { id: string; name: string; desc: string }[], got: Record<string, number>, onClose: () => void): void {
  const n = list.filter((a) => got[a.id]).length;
  open(
    'achievements',
    `<h2 id="ovTitle">Succès <small class="ach-count">${n}/${list.length}</small></h2>
    <ul class="ach">${list.map((a) => `<li class="${got[a.id] ? 'on' : ''}"><b>${got[a.id] ? '🏆' : '🔒'} ${a.name}</b><span>${a.desc}</span></li>`).join('')}</ul>
    <div class="menu"><button class="buy" type="button" id="ovClose" data-autofocus><span class="c">Reprendre</span><small>Échap</small></button></div>`,
    onClose,
  );
  $('ovClose').addEventListener('click', () => closeOverlay());
}

export interface MenuOpts {
  onResume: () => void;
  onNew: () => void;
  stats: string;
  achievements: () => void;
  notebook: () => void;
  tutorial: boolean;
  onTutorial: (on: boolean) => void;
}

export function showMenu(o: MenuOpts): void {
  let armed = false;
  open(
    'menu',
    `<h2 id="ovTitle">Pause</h2>
    <p>${o.stats}</p>
    <div class="menu">
      <button class="buy" type="button" id="ovRes" data-autofocus><span class="c">Reprendre</span><small>Échap</small></button>
      <button class="buy plain" type="button" id="ovNote"><span class="c">📖 Carnet du grand-père</span><small>les pages trouvées</small></button>
      <button class="buy plain" type="button" id="ovAch"><span class="c">🏆 Succès</span><small>gardés d’une partie à l’autre</small></button>
      <button class="buy plain" type="button" id="ovTut" aria-pressed="${o.tutorial}"><span class="c" id="ovTutC">Tutoriel : ${o.tutorial ? 'activé' : 'désactivé'}</span><small>Marcel guide au début de chaque phase</small></button>
      <button class="buy alt" type="button" id="ovNew"><span class="c">Nouvelle partie</span><small id="ovNewSub">efface la partie en cours</small></button>
    </div>
    <p class="credits">La partie est sauvegardée automatiquement dans ce navigateur. En votre absence, seule l’équipe de nuit (à partir de l’acte II) fait tourner l’usine.</p>`,
    o.onResume,
  );
  $('ovRes').addEventListener('click', () => closeOverlay());
  $('ovNote').addEventListener('click', () => {
    closeHandler = null;
    closeOverlay();
    o.notebook();
  });
  $('ovAch').addEventListener('click', () => {
    closeHandler = null;
    closeOverlay();
    o.achievements();
  });
  let tut = o.tutorial;
  $('ovTut').addEventListener('click', () => {
    tut = !tut;
    o.onTutorial(tut);
    $('ovTut').setAttribute('aria-pressed', String(tut));
    $('ovTutC').textContent = `Tutoriel : ${tut ? 'activé' : 'désactivé'}`;
    sfx('click');
  });
  $('ovNew').addEventListener('click', () => {
    if (!armed) {
      armed = true;
      $('ovNewSub').textContent = 'cliquez encore pour confirmer';
      sfx('warn');
      return;
    }
    closeHandler = null;
    closeOverlay();
    o.onNew();
  });
}

export function showReport(title: string, lines: string[], onClose: () => void): void {
  open(
    'report',
    `<h2 id="ovTitle">${title}</h2>${lines.map((l) => `<p>${l}</p>`).join('')}
    <div class="menu"><button class="buy" type="button" id="ovClose" data-autofocus><span class="c">Retour à l’usine</span><small>Entrée</small></button></div>`,
    onClose,
  );
  $('ovClose').addEventListener('click', () => closeOverlay());
}

export function showEnd(lines: string[], onClose: () => void, share?: { card: () => void; copy: () => void }): void {
  open(
    'end',
    `<h1 id="ovTitle">Fin</h1>
    <div class="subtitle">Rouages &amp; Cie a racheté Ferrum Industries.</div>
    ${lines.map((l) => `<p>${l}</p>`).join('')}
    <div class="menu">
      <button class="buy plain" type="button" id="ovCard"><span class="c">📷 Carte de fin</span><small>image à partager</small></button>
      <button class="buy plain" type="button" id="ovCopy"><span class="c">📋 Copier le résumé</span><small>à coller dans une conversation</small></button>
      <button class="buy" type="button" id="ovClose" data-autofocus><span class="c">Continuer en bac à sable</span><small>marché sans plafond, prestiges facultatifs</small></button>
    </div>
    <p class="credits">Rouages &amp; Cie — un jeu sur la cadence, l’organisation et la valeur d’une pièce. Merci d’avoir joué.</p>`,
    onClose,
  );
  $('ovClose').addEventListener('click', () => closeOverlay());
  if (share) {
    $('ovCard').addEventListener('click', () => share.card());
    $('ovCopy').addEventListener('click', () => share.copy());
  }
}
