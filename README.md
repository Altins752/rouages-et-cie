# Rouages & Cie

Jeu incrémental pour navigateur web sur PC. Vous héritez de la forge de votre grand-père et de sa dette ; vous finirez à la tête d'un groupe industriel mondial, jusqu'à racheter Ferrum Industries, qui avait pris l'usine familiale.

Un seul produit, l'écrou. Ce qui progresse, c'est la cadence, l'organisation et la valeur de la pièce : **faire, puis faire faire, puis piloter**.

## Lancer le jeu

Le plus simple : ouvrir **`dist/rouages.html`** dans Chrome, Firefox ou Edge. C'est un fichier unique et autonome (scripts et styles intégrés) ; il fonctionne hors ligne, les polices se chargent depuis Google Fonts si le réseau est disponible.

Depuis les sources :

```bash
npm install
npm run dev
```

Puis ouvrir l'adresse affichée (par défaut `http://localhost:5173`).

Prérequis : Node.js 22 ou plus récent. Pour les tests de bout en bout, installer une fois le navigateur de Playwright :

```bash
node ./node_modules/@playwright/test/cli.js install chromium
```

> Le chemin de ce dépôt contient `&`. Les scripts npm appellent donc `node ./node_modules/...` directement : les raccourcis `.cmd` de npm sous Windows interprètent `&` comme un séparateur de commandes.

## Commandes

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm run build` | Vérification des types, build statique dans `dist/` et fichier unique `dist/rouages.html` |
| `npm test` | Tests unitaires de la simulation (Vitest) |
| `npm run e2e` | Tests de bout en bout (Playwright, 1440 × 900 et 1280 × 720, thèmes clair et sombre) ; captures dans `e2e/screens/` |
| `npm run sim` | Campagne complète simulée sur le vrai moteur, 3 profils de joueur, critères d'équilibrage vérifiés |
| `npm run sim -- actif -v --seed=23` | Un seul profil, journal des achats, autre graine |

`npm run e2e` utilise le build de `dist/` : lancer `npm run build` avant.

## Comment jouer

L'usine est une ligne à quatre postes : **découpe** (barre → lopin), **frappe** (lopin → écrou brut), **taraudage** (filetage), **contrôle** (validation ou rebut). Le débit d'une chaîne est celui de son poste le plus lent, le **goulot** : là où les pièces s'entassent, c'est là que ça coince.

Quatre leviers :

- **Personnel** : embaucher (onglet Équipe), former les ouvriers pour conduire des machines. Les ouvriers se répartissent seuls entre les postes.
- **Technologie** : ajouter des établis ou des machines (4 par poste), améliorer l'outillage (+25 % de vitesse, 3 niveaux), moderniser un poste (mécanique, semi-auto, robotisé, usine noire).
- **Chaînes** : dupliquer la ligne entière dans un nouveau hall.
- **Matériau** : fonte, acier, laiton, inox, titane, carbure, diamant ; chaque écrou vaut plus, mais s'usine plus lentement.

Le clic ne produit rien : il **accélère le temps**. Clic maintenu (ou barre d'espace) : zone verte. Pour la zone rouge, il faut cliquer très vite ; les machines s'usent alors cinq fois plus.

L'information se débloque avec l'encadrement : sans contremaître, vous ne voyez ni cadences ni goulot ; superviseur, RH, logistique, commercial et contrôleur de gestion remplissent peu à peu l'onglet Données et prennent des décisions à votre place.

### Histoire

| Étape | Objectif |
| --- | --- |
| Prologue — La dette | Rembourser 800 € avant l'échéance (20 min de jeu ; en retard : +10 %, 10 min de plus) |
| Acte I — La ville | Tenir 50 % du marché 30 secondes, puis déménager |
| Acte II — La région | Idem ; usure, moral, énergie, contrats |
| Acte III — Le pays | Idem ; rôles support, robots, titane |
| Acte IV — Le monde | Réunir 1,5 Md€ et racheter Ferrum |
| Fin, puis bac à sable | Marché sans plafond, nouveaux sites facultatifs (prestige) |

Chaque déménagement revend l'équipement (15 % en capital) et rapporte du **savoir-faire**, à dépenser dans l'onglet R&D. Les recherches, Marcel et le savoir-faire vous suivent.

### Commandes

| Souris / clavier | Action |
| --- | --- |
| Clic maintenu sur l'usine, barre d'espace | Accélérer le temps |
| Clics rapides | Zone rouge |
| Molette | Zoomer |
| Glisser | Se déplacer quand l'usine dépasse l'écran |
| Double-clic sur un hall | Afficher cette chaîne dans le panneau |
| Survol | Info-bulle d'un poste, d'un ouvrier, d'un hall |
| `1` à `5` | Onglets Atelier, Équipe, R&D, Marché, Données |
| `0` | Recadrer la vue |
| `H` | Aide |
| Entrée / Échap | Passer / fermer le télex |

La partie est sauvegardée automatiquement dans le navigateur. Absent, l'usine continue de tourner à vitesse normale (jusqu'à 8 heures) ; un rapport d'absence vous attend au retour.

## Architecture

TypeScript strict, Vite, aucun framework d'interface. Canvas 2D pour la scène, post-traitement WebGL optionnel (bouton « Effets »), Web Audio pour tous les sons (synthétisés, aucun fichier audio).

```
src/
  data/balance.ts   toutes les valeurs chiffrées, et seulement là
  sim/              moteur de jeu pur : aucun accès au DOM, au canvas ni à l'audio
    engine.ts         pas de simulation : ouvriers, robots, usure, énergie, ventes, contrats, moral, Ferrum
    actions.ts        actions du joueur (achats, embauches, recherche, déménagement…)
    analysis.ts       estimations en régime établi (débit, goulot, profit)
    advisor.ts        plans d'achat et temps de retour (superviseur, IA du simulateur)
    ai.ts             joueur automatique de la campagne simulée
    offline.ts        progression hors ligne
  story/            paliers d'histoire, télex, jalons, rapports du contrôleur
  save/             sauvegarde versionnée et migrations
  render/           scène canvas (halls, site, caméra), particules, post-traitement WebGL
  ui/               pupitre, onglets, télex, info-bulles, surcouches
  audio/            sons synthétisés
  main.ts           boucle de jeu, entrées, liaison de l'ensemble
tools/
  sim/campaign.ts   campagne simulée (npm run sim)
  sim/model.py      simulateur Python d'origine (référence historique)
  inline.mjs        production du fichier HTML unique
e2e/                tests Playwright
docs/               cadrage, journal des décisions, avancement et rapport final
```

Règles :

- `sim/` est déterministe : générateur aléatoire à graine stocké dans la partie, pas de `Math.random` ni de `Date.now`. Il avance par pas de temps de jeu fixes (0,05 s en jeu) et donne le même résultat quelle que soit la taille du pas.
- Le rendu lit l'état de la simulation et ne le modifie jamais.
- Temps de jeu et temps réel sont distincts : le compte-tours multiplie le temps de jeu, jamais la production.
- Sauvegarde : schéma versionné (`SAVE_VERSION`), une migration par changement de format (`src/save/save.ts`).
- Toute modification de `src/data/balance.ts` impose de relancer `npm run sim`.

Pour les tests, `window.__rouages` permet de démarrer une partie, d'avancer le temps ou de jouer avec l'IA jusqu'à un acte donné (`playTo`).

## Documents

- `docs/cadrage.md` : document de cadrage (systèmes, histoire, valeurs).
- `docs/decisions.md` : journal des décisions prises en cours de route.
- `docs/PROGRESS.md` : avancement par étape, durées simulées, rapport final.
