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
- [x] Contremaître : cadences, goulot, postes attitrés (+11 % sur une ligne de 12)
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

## Étape 7 — Prestige, bac à sable, finitions — EN COURS

- [ ] Bac à sable (marché illimité), prestige facultatif « nouveau site », arbre de savoir-faire
- [ ] Caméra évolutive (atelier → halls → site), niveau de détail
- [ ] Post-traitement WebGL (bloom, grain, vignette, chaleur), cycle jour/nuit
- [ ] Audio complet (ambiance par machine)
- [ ] Progression hors ligne, rapport d'absence, migrations de sauvegarde
- [ ] `dist/rouages.html` autonome, README, rapport final
- [ ] Sim finale, tests, e2e, captures, commit

## Durées simulées

Minutes réelles par étape (graine 11). Critères : actif entre 5 et 6 h, prologue actif entre 5 et 10 min, premier achat < 60 s, jamais plus de 3 min sans achat possible, aucun acte bloqué.

| Passage | Profil | Prologue | Acte I | Acte II | Acte III | Acte IV | Total |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Étape 1 | Calme | 11,5 | 39,5 | 154,0 | 160,3 | 328,5 | 11 h 34 |
| Étape 1 | Actif | 7,1 | 22,1 | 47,1 | 69,9 | 177,3 | 5 h 24 |
| Étape 1 | Zone rouge | 4,3 | 12,5 | 23,0 | 45,7 | 82,1 | 2 h 48 |

| Étape 4 | Calme | 11,5 | 39,5 | 98,5 | 202,5 | 347,8 | 11 h 40 |
| Étape 4 | Actif | 7,1 | 22,1 | 46,5 | 69,3 | 180,9 | 5 h 26 |
| Étape 4 | Zone rouge | 4,3 | 12,5 | 25,2 | 31,9 | 79,5 | 2 h 33 |

Actif sur d'autres graines (étape 4) : 5 h 18 (graine 23), 5 h 21 (graine 37).

Actif sur d'autres graines (étape 1) : 5 h 15 (graine 37), 5 h 30 (graine 23).

## Rapport final

À rédiger en fin de projet.
