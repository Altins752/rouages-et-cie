# Rouages & Cie — instructions pour Claude Code

Jeu incrémental **pour navigateur web sur PC** (souris et clavier, écran paysage) où le joueur passe de l'artisan qui forge seul à la tête d'un groupe industriel mondial. Un seul produit, l'écrou ; ce qui progresse, c'est la cadence, l'organisation et la valeur de la pièce. Fil directeur : **faire, puis faire faire, puis piloter**.

## Sources de vérité

| Fichier | Rôle |
| --- | --- |
| `docs/cadrage.md` | Document de cadrage : systèmes, histoire, valeurs d'équilibrage. **Toujours le relire avant de coder une étape.** |
| `docs/decisions.md` | Journal des décisions prises en cours de route (date, décision, raison). À tenir à jour. |
| `poc/rouages-poc.html` | POC v6.1 jouable (pensé mobile) : moteur de chaîne, ouvriers, goulot, compte-tours, prologue et acte I. Point de départ du code. |
| `legacy/rouages-v5.html` | Ancienne version (économie v5). Référence pour le rendu, les shaders WebGL, l'audio et l'onglet Données. Ne pas faire évoluer. |
| `tools/sim/` | Simulateur d'équilibrage Python d'origine. Référence jusqu'à son portage en TypeScript. |

Si le code et `docs/cadrage.md` divergent, signale-le et propose la mise à jour du cadrage plutôt que de trancher en silence.

## Stack

- TypeScript strict, Vite, aucun framework UI. Canvas 2D pour la scène, post-traitement WebGL optionnel (repris de la v5), Web Audio pour tous les sons (synthétisés, aucun fichier audio).
- Polices : Saira Stencil One (titres), Chakra Petch (texte), Share Tech Mono (afficheurs et chiffres).
- Tests : Vitest pour la simulation, Playwright pour les tests de fumée sur viewport PC (1440 × 900, et 1280 × 720 comme minimum).
- Le build doit pouvoir produire un fichier HTML unique autonome (publication en artifact claude.ai).
- Pas de dépendance ajoutée sans le justifier dans `docs/decisions.md`.

## Commandes

```bash
npm run dev       # serveur de développement
npm run build     # build statique + version fichier unique
npm test          # tests unitaires de la simulation
npm run e2e       # tests Playwright (PC, thèmes clair et sombre)
npm run sim       # campagne complète simulée, 3 profils de joueur
```

## Architecture

```
src/
  data/balance.ts   toutes les valeurs chiffrées, et seulement là
  sim/              moteur de jeu pur : aucun accès au DOM, au canvas ni à l'audio
  render/           scène canvas, particules, post-traitement WebGL
  ui/               pupitre, onglets, télex, toasts
  audio/            sons synthétisés
  story/            actes, objectifs, messages télex
  save/             sauvegarde versionnée et migrations
```

**Règles d'architecture**

- `sim/` est déterministe et testable : générateur aléatoire à graine, pas de `Math.random`, pas de `Date.now`. Il avance par pas de temps de jeu fixes.
- Le rendu lit l'état de la simulation et ne le modifie jamais.
- Aucune valeur d'équilibrage en dur ailleurs que dans `src/data/balance.ts`.
- Temps de jeu et temps réel sont distincts : le compte-tours multiplie le temps de jeu, jamais la production.
- Sauvegarde : schéma versionné, migration obligatoire à chaque changement de format. Ne jamais casser une partie existante sans le dire.

## Invariants de gameplay

À respecter dans toute modification :

1. **Un seul produit**, l'écrou, décliné en matériaux (fonte → diamant).
2. **Ligne à 4 postes** (découpe, frappe, taraudage, contrôle). Une usine compte 4 chaînes ; le débit d'une chaîne est celui de son poste le plus lent.
3. **Quatre leviers** : personnel, technologie, chaînes, matériau.
4. **Ouvriers affectés automatiquement** : à l'embauche, chacun prend le poste libre le plus utile et n'en change plus ; seuls les polyvalents circulent (postes vacants, relève).
5. **Le clic accélère le temps**, il ne produit rien. Clic maintenu sur la scène (ou barre d'espace maintenue) = milieu de zone verte ; la zone rouge exige de cliquer très vite et multiplie l'usure.
6. **Jamais bloqué** : planchers de cadence, maintenance toujours possible, dette plutôt que faillite, une crise à la fois.
7. **Le gaspillage coûte** : machine en veille = électricité à 30 %, opérateur payé, usure lente.
8. **L'information se débloque** : le tableau de bord commence vide et se remplit avec les rôles recrutés (contremaître, superviseur, RH…).
9. **Chaque achat se voit** : tout élément acheté apparaît dans la scène, animé et cohérent.
10. **Une usine qu'on lit** : sans données, le joueur doit repérer le goulot aux piles de pièces.

## Équilibrage

- Toute modification de `balance.ts` impose de relancer `npm run sim` et de reporter les durées obtenues dans la PR ou le commit.
- Critères d'acceptation de la campagne : aucun acte bloqué pour les 3 profils (calme, actif, gros cliqueur en zone rouge) ; joueur actif entre 5 et 6 h pour l'histoire complète ; prologue entre 5 et 10 min réelles en jouant activement.
- Le premier achat utile doit arriver dans la première minute ; ensuite, jamais plus de 2 à 3 minutes sans achat possible.

## Écarts connus entre le POC et le cadrage

Validés en jeu, à reporter dans `docs/cadrage.md` :

- Temps de cycle manuels divisés par deux : 2 / 3 / 2,5 / 1 s.
- Établis : 15 / 20 / 18 / 12 €.
- Nouveau levier « outillage » : 50 niveaux par poste et par palier, commun à toutes les machines identiques (refonte v2, cadrage § 19).
- Prologue : 20 € de départ, marché 5 €/s (4 €/s dans le POC, relevé avec les caractères des ouvriers), dette 800 €, échéance 20 min de jeu.
- Compte-tours : régime `rev` de 0 à 1 ; tap +0,12 × √(1 − rev) ; retombée (0,08 + 0,5 × rev²)/s ; appui long jusqu'à 0,5 ; zone rouge au-delà de 0,8 ; vitesse = 1 + rev × (max − 1), max ×3 au prologue et ×4 à l'acte I.

## Plateforme : PC

- Cible : navigateurs de bureau récents (Chrome, Firefox, Edge), écran paysage de 1280 × 720 à 2560 × 1440.
- Mise en page : la scène de l'usine occupe la grande partie gauche de l'écran ; le pupitre en haut ; les onglets de gestion dans un panneau latéral droit. Aucun défilement de page, seul le panneau défile.
- Souris : clic et maintien sur la scène pour accélérer le temps, molette pour zoomer, glisser pour se déplacer quand l'usine dépasse l'écran, survol des postes et des ouvriers pour une info-bulle.
- Clavier : barre d'espace maintenue = accélérer ; touches 1 à 5 = onglets ; Échap = fermer le télex ; raccourcis affichés dans une aide (touche H).
- Le POC est pensé mobile : reprendre sa logique et son rendu, pas sa mise en page.

## Style visuel et texte

- Esthétique de pupitre industriel : plaques d'acier rivetées, tôle larmée, bandes de chantier jaune et noir, afficheurs LCD ambrés, boutons poussoirs avec voyant.
- Thèmes clair (acier galvanisé) et sombre (gunmetal) selon le système ; focus clavier visible ; `prefers-reduced-motion` respecté ; tout est utilisable au clavier.
- Interface en français, phrases courtes, casse de phrase. Vocabulaire fixe : écrous, postes, cadence, goulot, chaîne, établi, machine, outillage, opérateur, contremaître. Un bouton garde le même verbe que le message qui le confirme.
- Code et identifiants en anglais, textes affichés en français.

## Façon de travailler

1. Une étape du plan de réalisation (`docs/cadrage.md`, section « Réalisation ») par session.
2. Avant de coder : relire la section concernée du cadrage, annoncer le découpage en sous-tâches.
3. Chaque étape se termine jouable, testée, et fait l'objet d'un commit clair.
4. Après chaque étape : tests de fumée Playwright et capture d'écran PC pour vérifier le rendu.
5. Toute décision de design prise en cours de route va dans `docs/decisions.md`.
6. En cas de doute sur un choix de game design : en session interactive, poser la question ; en mode autonome, trancher de façon cohérente avec le cadrage et le journaliser dans `docs/decisions.md`.
7. Tenir `docs/PROGRESS.md` à jour (étapes faites, en cours, restantes) pour pouvoir reprendre une session interrompue.
