# Avancement — Rouages & Cie (version PC)

Plan de réalisation du cadrage (section 16), découpé en sous-tâches cochables.
Ce fichier sert à reprendre une session interrompue : l'étape en cours est marquée **EN COURS**.

## Reprendre une session

- Node.js : portable, installé dans `%LOCALAPPDATA%\nodejs-portable\node-v22.23.3-win-x64` (ajouter au `PATH`).
- Le chemin du dépôt contient `&` : les scripts npm appellent `node ./node_modules/...` directement (les raccourcis `.cmd` de npm cassent sur ce caractère).
- `npm install`, puis `npx playwright install chromium` (une fois), puis les commandes de `CLAUDE.md`.

## Étape 1 — Socle du projet et moteur de simulation — FAIT

- [x] Git, `package.json`, TypeScript strict, Vite, Vitest, Playwright, arborescence de `CLAUDE.md`
- [x] `src/data/balance.ts` : toutes les valeurs (POC v6.1 + cadrage, rééquilibrées)
- [x] `src/sim/` : générateur à graine, état, formules, pas de temps fixe (moteur robuste à la taille du pas)
- [x] Moteur de chaîne porté du POC : 4 postes, piles plafonnées à 8, unités, ouvriers qui marchent, affectation automatique
- [x] Ventes, marché, part de marché (moyenne glissante), charges ; et déjà : usure, énergie, contrats, moral, Ferrum, prestige
- [x] Actions du joueur (toutes les actions de la campagne)
- [x] Analyse en régime établi (débit, goulot) et conseiller à plans multi-étapes (temps de retour)
- [x] Tests Vitest : déterminisme, débits mesurés du POC (0,25 / 0,67 / 2,11 €/s), goulot, invariants
- [x] Simulateur TypeScript `npm run sim` sur le vrai moteur (3 profils, critères vérifiés automatiquement)
- [x] Mise en page PC jouable (scène, pupitre, panneau, onglets), tests de fumée, captures 1440 × 900 et 1280 × 720
- [x] Commit

## Étape 2 — Prologue complet — FAIT

- [x] Rendu de l'atelier (repris du POC, adapté PC) : établis, ouvriers, piles, caisse, lampes, verrières, jour et nuit
- [x] Compte-tours (clic maintenu, barre d'espace, zone rouge, vignettage rouge, distorsion WebGL)
- [x] Télex (file, frappe, Entrée/Échap), toasts, dette et échéance (+10 %, +10 min), jalons récompensés
- [x] Onglets Atelier / Équipe / R&D / Marché / Données, raccourcis 1–5, aide (H), info-bulles au survol
- [x] Écran titre, menu pause, sauvegarde versionnée v1 (migrations, champs par défaut), thèmes clair et sombre
- [x] Audio synthétisé (compresseur, réverbération, sons de poste, ronron d'usine)
- [x] Équilibrage du prologue : 7,1 min réelles en actif (critère 5–10 min), premier achat à 16 s
- [x] Tests : histoire (paliers, jalons, échéance), sauvegarde (aller-retour, migrations), hors ligne ; e2e (zone rouge, info-bulle, passage à l'acte I) ; captures vérifiées
- [x] Commit

## Étape 3 — Acte I : la ville — FAIT

- [x] Bureau d'études (R&D) : machines mécaniques, acier doux, laiton
- [x] Moderniser un poste, opérateurs à former (qualification), revente 25 %
- [x] Contremaître : cadences, goulot, postes attitrés (+8,5 % sur une ligne de 12)
- [x] Marché de la ville (180 €/s après rééquilibrage), objectif 50 % pendant 30 s, Ferrum (débauchage, guerre des prix)
- [x] Usure et pannes des machines, maintenance externe (jamais refusée, dette possible), révision
- [x] Deux chaînes max (frais de hall), vue de site à deux halls, jalons secondaires
- [x] Tests (act1.test.ts), e2e acte I joué par l'IA (machines, goulot, panne), captures vérifiées, commit

## Étape 4 — Acte II : la région — FAIT

- [x] Déménagement (prestige d'acte) : savoir-faire, capital 15 %, conservés / remis à zéro
- [x] Chaînes multiples (4), halls, caméra qui recule, zoom à la molette, déplacement au glisser
- [x] Usure complète, révision, maintenance préventive, atelier de maintenance
- [x] Moral (goulot qui s'épuise, plancher 70 %), spécialisation, cantine, RH (formation automatique), superviseur (conseil d'achat)
- [x] Énergie : réseau, solaire, éolien, batterie, revente, coupure si dette ; tout est visible dans la scène (annexe du site)
- [x] Contrats ponctuels et long terme, réputation, événements Ferrum, directeur d'incidents (une crise à la fois)
- [x] Inox, semi-automatique
- [x] Tests (act2.test.ts), e2e acte II joué par l'IA (énergie, contrats), captures vérifiées, sim, commit

## Étape 5 — Acte III : le pays — FAIT

- [x] Rôles support (logistique : livre les contrats ; commercial : signe les contrats tenables ; contrôleur : rapport périodique avec alertes)
- [x] Onglet Données verrouillé par rôles : tableaux et graphiques de télémétrie (15 min / 4 h, lecture au survol)
- [x] Robotisation (un technicien par chaîne, sinon 50 %), titane, maintenance prédictive
- [x] Reconversion (former un technicien) ou licenciement des ouvriers remplacés, comptés pour la fin
- [x] Tests (act3.test.ts), e2e acte III joué par l'IA, rendu des robots et de l'usine noire, captures vérifiées, commit

## Étape 6 — Acte IV : le monde et la fin — FAIT

- [x] Usine noire (aucun humain, hall dans le noir, LED), carbure, diamant (scintillement avec bloom)
- [x] Objectif 1,5 Md€, rachat de Ferrum, séquence finale : l'usine s'éteint, la vieille forge se rallume (deux variantes selon reconversions et licenciements)
- [x] Jalons de l'acte IV pour occuper l'attente des recherches (usine noire, diamant)
- [x] e2e : acte IV joué par l'IA, rachat, séquence finale, écran de fin, passage au bac à sable ; captures vérifiées ; commit

## Étape 7 — Prestige, bac à sable, finitions — FAIT

- [x] Bac à sable (marché sans plafond), prestige facultatif « nouveau site », arbre de savoir-faire (7 branches)
- [x] Caméra évolutive (atelier → halls → site), intérieur des halls au-delà de 300 px, zoom et déplacement ; lointain qui change à chaque déménagement
- [x] Post-traitement WebGL (bloom, grain, vignette, aberration, distorsion en zone rouge, teinte de nuit), cycle jour/nuit
- [x] Audio : ronron, brouhaha des machines, vent des éoliennes, servomoteurs des robots, sifflement de l'usine noire, sons de poste et d'interface
- [x] Progression hors ligne (8 h max), rapport d'absence, sauvegarde v2 avec migration
- [x] Outillage visible sur chaque unité ; accès de test réservé au développement et aux navigateurs pilotés
- [x] Corrections d'équilibre de fond : part de marché des contrats au fil de l'eau, relève des ouvriers fatigués, pas de marche inutile vers un poste déjà servi
- [x] `dist/rouages.html` autonome (182 Ko), README, captures dans `docs/captures/`, rapport final
- [x] Sim finale, 61 tests unitaires, 36 tests e2e, commit

## Refonte v2 (demandée le 2026-10-03) — FAIT

Nouvelle partie obligatoire (sauvegarde v3, les anciennes sont refusées). Vocabulaire : une **usine** (hall) contient jusqu'à 4 **chaînes** (rangées), chacune avec ses 4 **postes** (découpe, frappe, taraudage, contrôle).

- [x] R1 — Moteur : usines et chaînes, pièces rattachées à leur chaîne (débord vers une chaîne qui a le poste suivant), postes fixes (affectés à l'embauche, ne bougent plus), polyvalents (moins chers, moins productifs, relève), convoyeur manuel par chaîne avec un ouvrier à la manivelle (sinon portage des pièces), formation (+4 %/formation) et promotion après 5 formations (on n'embauche que des manœuvres), outillage global par poste et par palier sur 50 niveaux, modernisation machine par machine, ingénieur méthodes (consigne), congédier un rôle ; tests
- [x] R2 — Analyse, conseiller et IA du simulateur ; nouveaux critères ; rééquilibrage 5–6 h (5 h 13 à 5 h 18 sur 3 graines)
  - Garde-fous ajoutés : formation d'urgence à découvert (machine à l'arrêt faute de qualification), l'IA et l'ingénieur méthodes préparent l'ouvrier avant de moderniser, les RH anticipent la consigne, tout ouvrier de l'usine peut devenir technicien
  - Équilibrage : outillage (coût 0,8 × 1,09^n, τ = 18), convoyeur au prix de sa chaîne (60 %), halls ×1,5, marchés 220 / 3 000 / 32 000 €/s, recherches semi-auto 150 k€, robots 3 M€, usine noire 500 M€, inox 100 k€, titane 2,5 M€, diamant 1,5 Md€, rachat 2 Md€
- [x] R2 bis — Tests unitaires réécrits (72) : postes fixes, débord entre chaînes, convoyeur et manivelle, outillage global, formation et promotion, formation d'urgence, ingénieur méthodes, congédier un rôle, sauvegarde v3
- [x] R3 — Rendu : une usine = un hall à 4 rangées (chaînes numérotées), piles par chaîne, convoyeur à manivelle animé, portage visible, ouvriers fixes, silhouettes en pointillés aux postes vacants, jauge d'outillage, voyant « attend une promotion », cadences du contremaître au-dessus de chaque poste
- [x] R4 — Interface : Atelier (chaînes, postes un par un, modernisation machine par machine, outillage par palier, convoyeurs, usines), Équipe (embaucher au poste libre, polyvalents, chaque ouvrier : former / promouvoir / licencier, rapport du contremaître, consigne de l'ingénieur méthodes, congédier un rôle, alerte salaires / recettes), recettes €/s sur le pupitre, info-bulles par chaîne et par poste
- [x] R5 — Cadrage (§ 19), CLAUDE.md (invariants 2 et 4), décisions, e2e (38), captures, README, fichier unique
- [x] Confort d’affichage : délai avant achat, repérage dans la scène au survol, « +€ » au-dessus de la caisse, touches [ et ], filtre des ouvriers par chaîne (40 tests e2e)

## Suite (plan validé le 2026-10-03)

- [x] Équipe de nuit : rendement (50 niveaux) et durée (10 paliers), acte II, absence courte rattrapée, manque à gagner au rapport d'absence, gardiens dans la scène, sauvegarde v4 (migration v3 → v4) ; campagne actif 5 h 23
- [x] Quêtes : carnet de Marcel (3 actives + l'objectif de l'acte), récompenses en argent ou outillage offert, « Aide Marcel » pas à pas (bulle + cible qui clignote) ; remplacent les jalons ; campagne actif 5 h 12
- [x] Rail de Marcel : complet au prologue (panneau grisé, dette gelée), court à chaque acte (explications), « Je connais, Marcel », option du menu
- [ ] Commandes spéciales dès l'acte I, calées sur la cadence mesurée (3 difficultés)
- [ ] Traits des ouvriers
- [ ] Télex narquois du patron de Ferrum
- [ ] Mode carte postale (capture) et carte de fin de partie
- [ ] Succès humoristiques
- [ ] Carnet du grand-père en pages à collectionner
- [ ] Radio de l'atelier
- [ ] Défis de bac à sable

## Durées simulées

Minutes réelles par étape. Critères : actif entre 5 et 6 h, prologue actif entre 5 et 10 min, premier achat < 60 s, jamais plus de 3 min sans achat possible, aucun acte bloqué.

### Refonte v2 (graine 11)

| Profil | Prologue | Acte I | Acte II | Acte III | Acte IV | Total | 1er achat | Attente max |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Calme (sans clic) | 10,3 | 70,0 | 87,0 | 110,0 | 345,0 | 10 h 22 | 30 s | 120 s |
| Actif (zone verte) | 6,5 | 39,2 | 46,5 | 55,2 | 168,7 | 5 h 16 | 16 s | 24 s |
| Gros cliqueur (zone rouge) | 3,9 | 25,1 | 24,0 | 27,3 | 80,3 | 2 h 41 | 12 s | 18 s |

« Attente max » : plus longue période sans aucun achat abordable qui augmente les recettes. Achats possibles par tranche de 10 min (actif) : 25 au prologue, 64 à l'acte I, 98 à l'acte II, 213 à l'acte III, 18 à l'acte IV. L'attente sans achat rentabilisé en moins de 5 min reste longue à l'acte IV (≈ 90 min en jeu actif) : épargne pour l'usine noire, le diamant et le rachat. Autres graines (actif) : 5 h 13 à 5 h 18. Aucun acte bloqué, fin chaleureuse.

### Version PC v1 (graine 11, avant la refonte)

| Profil | Prologue | Acte I | Acte II | Acte III | Acte IV | Total | 1er achat | Attente max |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Calme (sans clic) | 11,3 | 40,0 | 61,3 | 123,8 | 417,3 | 10 h 53 | 45 s | 105 s |
| Actif (zone verte) | 6,9 | 22,5 | 32,4 | 60,8 | 202,9 | 5 h 26 | 16 s | 48 s |
| Gros cliqueur (zone rouge) | 4,3 | 12,8 | 17,1 | 30,9 | 94,3 | 2 h 39 | 12 s | 24 s |

### Historique

| Passage | Profil | Prologue | Acte I | Acte II | Acte III | Acte IV | Total |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Étape 1 | Calme | 11,5 | 39,5 | 154,0 | 160,3 | 328,5 | 11 h 34 |
| Étape 1 | Actif | 7,1 | 22,1 | 47,1 | 69,9 | 177,3 | 5 h 24 |
| Étape 1 | Zone rouge | 4,3 | 12,5 | 23,0 | 45,7 | 82,1 | 2 h 48 |
| Étape 4 | Calme | 11,5 | 39,5 | 98,5 | 202,5 | 347,8 | 11 h 40 |
| Étape 4 | Actif | 7,1 | 22,1 | 46,5 | 69,3 | 180,9 | 5 h 26 |
| Étape 4 | Zone rouge | 4,3 | 12,5 | 25,2 | 31,9 | 79,5 | 2 h 33 |

Aux étapes 1 et 4, l'actif variait de 5 h 15 à 6 h 52 selon la graine : un acte II pouvait s'enliser (moral effondré, objectif tenu seulement grâce aux pics de livraison des contrats). Les corrections de l'étape 7 ont ramené l'écart à quelques minutes.

## Rapport final

### Ce qui est fait

- **Jeu complet sur PC** : écran titre, prologue, actes I à IV, séquence finale à deux variantes, bac à sable avec prestige facultatif. Pupitre (caisse, objectif, compte-tours, voyants), scène de l'usine à gauche, panneau à cinq onglets à droite, télex, info-bulles, aide (H), menu pause. Aucun défilement de page, de 1280 × 720 à 2560 × 1440.
- **Moteur de simulation** (`src/sim`) porté du POC, déterministe et indépendant de la taille du pas : ouvriers qui marchent et s'affectent seuls, piles plafonnées devant le goulot, quatre leviers, cinq paliers technologiques, sept matériaux, usure et pannes, maintenance (externe, atelier, préventive, prédictive), moral avec relève, spécialisation, cantine, énergie (réseau, solaire, éolien, batterie, revente, coupure), contrats ponctuels et long terme, réputation, Ferrum (débauchage, guerre des prix, contrat exclusif) avec un directeur de crises, six rôles d'encadrement qui débloquent l'information et décident, déménagements, savoir-faire.
- **Information qui se débloque** : sans rôle, seuls la caisse et le stock ; l'onglet Données se remplit rôle par rôle (tableaux, graphiques avec lecture au survol).
- **Chaque achat se voit** : établis, machines (cinq dessins), outillage (encoches), halls, éoliennes, panneaux, batteries, cantine, encadrement ; la caméra recule quand l'usine grandit.
- **Sauvegarde** locale versionnée (v3 depuis la refonte ; les parties v1 et v2 ne sont pas reprises), progression hors ligne jusqu'à 8 h avec rapport d'absence ; thèmes clair et sombre (système ou forcés) ; `prefers-reduced-motion` respecté ; tout le panneau au clavier.
- **Refonte v2** : usines de 4 chaînes, postes achetés un par un, ouvriers à poste fixe, polyvalents, formation et promotion, convoyeurs à manivelle, outillage global sur 50 niveaux, ingénieur méthodes, rapport du contremaître, recettes €/s au pupitre (voir cadrage § 19).
- **Outillage** : `npm run sim` (campagne réelle, 3 profils, critères vérifiés), 72 tests unitaires, 38 tests e2e (deux thèmes, deux tailles d'écran, actes joués par l'IA, fin, hors ligne, fichier unique), `dist/rouages.html` autonome.

### Limites connues

- **L'équilibrage repose sur une IA**, pas sur des parties humaines. Elle décide toutes les 8 s avec une information complète ; un vrai joueur actif mettra probablement plus que 5 h 26. Le délai de réflexion du profil est le paramètre à recaler après les premiers essais.
- **Zone rouge très rentable** : en mitraillant en permanence, l'histoire tient en 2 h 40. L'usure ×5 est vite absorbée par la maintenance préventive. C'est un comportement extrême (dix clics par seconde pendant des heures), mais le coût de la zone rouge pourrait être relevé.
- **Le son n'a pas été écouté** : les tests tournent sans sortie audio ; le mixage (volumes relatifs, couches d'ambiance) est à vérifier à l'oreille.
- **Polices** : chargées depuis Google Fonts ; hors ligne, le fichier unique retombe sur les polices du système.
- **Grands sites** : au-delà de quatre chaînes, la vue d'ensemble montre les bâtiments ; il faut zoomer pour voir l'intérieur. Les performances avec 16 chaînes n'ont été mesurées que sur la machine de développement.
- **Accessibilité** : le panneau est utilisable au clavier et la barre d'espace est réservée au temps (Entrée active les boutons) ; la scène canvas n'est pas lisible par un lecteur d'écran au-delà de son étiquette et des info-bulles.
- **Hors ligne** simulé avec un pas plus grossier (jusqu'à 1,4 s) : écarts minimes avec le temps réel.

### Pistes d'amélioration

1. Parties tests avec de vrais joueurs pour recaler le profil actif, le rythme du prologue et la lisibilité du goulot.
2. Réglages : volume par catégorie, palette pour daltoniens, remappage des touches.
3. Coût de la zone rouge plus marqué (rebut, chaleur visible, panne immédiate au-delà d'un seuil).
4. Vie du site : camions de livraison, fumées et lumières par chaîne, sons d'ambiance jour/nuit (oiseaux, grillons de la v5).
5. Plus d'événements Ferrum (sabotage, rachat d'un fournisseur) et des jalons supplémentaires en bac à sable.
6. Export / import de la sauvegarde ; statistiques de fin plus détaillées (courbe de la partie).
7. Niveau de détail intermédiaire pour les grands sites (intérieur simplifié à 150–300 px).
