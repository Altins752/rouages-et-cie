# Rouages & Cie — Document de cadrage (v1, version dépôt)

Source : document de cadrage rédigé le 2 octobre 2026. Les valeurs « POC v6.1 » remplacent celles du cadrage initial quand elles diffèrent (voir `docs/decisions.md`).

## 1. Vision et piliers

Incrémental où le joueur passe de l'artisan qui forge seul à la tête d'un groupe industriel mondial, jusqu'à racheter son concurrent. Un seul produit, l'écrou ; ce qui progresse, c'est la cadence, l'organisation et la valeur de la pièce. Fil directeur : **faire, puis faire faire, puis piloter**.

| Pilier | Concrètement |
| --- | --- |
| Une usine qu'on voit | Chaque achat ajoute un élément animé et cohérent ; la caméra recule quand l'usine grandit. |
| Un puzzle d'équilibrage | Le débit d'une chaîne est celui de son poste le plus lent ; le gaspillage coûte. |
| Sur le fil, jamais sous l'eau | Toujours un problème à régler, jamais de blocage. |
| Arcade complète | Pas de shifts ni de pauses, tout tourne en continu, chaque système a un vrai effet. |
| Une histoire qui mesure l'échelle | Objectifs chiffrés par acte, une vraie fin, puis un bac à sable sans fin. |

Périmètre : un seul produit, 4 postes, 7 matériaux, prologue + 4 actes, bac à sable. Hors périmètre : plusieurs types de produits, shifts, multijoueur.

## 2. Boucle de jeu et leviers

Produire → vendre (contrats) → réinvestir dans un levier → repérer le nouveau goulot.

| Levier | Effet | Coût / conséquence |
| --- | --- | --- |
| Personnel | Division du travail, cadence plus haute | Salaires continus, formation, moral |
| Technologie | Remplace un poste par une machine plus rapide | Achat, qualification, électricité, usure |
| Chaînes | Duplique une ligne entière | Coût élevé, besoins propres à chaque chaîne |
| Matériau | Augmente la valeur de chaque écrou | Matière plus chère, cycles plus longs, usure |
| Outillage (POC) | +25 % de vitesse sur un poste, 3 niveaux | Petit coût, progression fine |

Le **tap** (clic) n'est pas un levier de production : il accélère le temps du jeu.

## 3. Histoire

Le joueur hérite de la forge de son grand-père et finit par racheter Ferrum Industries, qui avait pris l'usine familiale. Chaque acte = un marché plus grand ; quand il est conquis, la croissance plafonne et l'histoire justifie le déménagement (prestige).

| Étape | Marché | Objectif | Systèmes introduits |
| --- | --- | --- | --- |
| Prologue — La dette | Quartier | Rembourser la dette avant l'échéance | Postes manuels, Marcel, ventes |
| Acte I — La ville | Ville | 50 % de part de marché | Division du travail, outillage, première machine, qualification, contremaître |
| Acte II — La région | Région | 50 % de part de marché | Chaînes multiples, usure/maintenance, moral, énergie, contrats long terme |
| Acte III — Le pays | Pays | 50 % de part de marché (entrée en bourse) | Rôles support, tableau de bord complet, matériaux nobles, robotisation |
| Acte IV — Le monde | Monde | Réunir la somme du rachat de Ferrum | Usine noire, carbure, diamant |

**Personnages** : le joueur (petit-fils du fondateur) ; **Marcel**, dernier ouvrier du grand-père, premier employé, qui monte en grade d'acte en acte ; **Ferrum Industries**, concurrent dont la part baisse quand celle du joueur monte et qui réagit (guerre des prix, débauchage, offre de rachat) ; **la banque**.

**Fin** : le rachat de Ferrum aboutit, l'usine historique du grand-père revient ; Marcel en rallume les lumières pendant que l'usine moderne tourne dans le noir. **Ensuite** : bac à sable sans échéance, marché illimité, prestiges facultatifs.

**Forme** : messages télex courts sur le pupitre, déclenchés par des paliers (jamais par chronomètre, sauf l'échéance du prologue). Tout est passable. Jalons secondaires récompensés à chaque acte.

## 4. Ligne de production

Quatre postes : **Découpe** (barre → lopin), **Frappe** (lopin → écrou brut), **Taraudage** (filetage), **Contrôle** (validation ou rebut).

- Chaque poste a un temps de cycle (technologie × matériau × outillage).
- Un poste contient jusqu'à **4 unités** identiques par chaîne. Capacité = unités en service ÷ cycle.
- Débit de la chaîne = capacité du poste le plus faible. Les pièces s'accumulent visuellement devant le goulot (piles plafonnées à 8 ; une pile pleine bloque l'amont).
- Une unité non robotisée exige un opérateur. **Affectation automatique** : chaque ouvrier prend la tâche disponible la plus en aval et préfère rester sur son poste.
- Moins d'ouvriers que de postes : un ouvrier enchaîne les postes et marche (1 s entre deux postes adjacents).
- Le contrôle met au rebut une part des pièces, en hausse quand on pousse les machines ou change de matériau.
- **Gaspillage pénalisé** : machine en attente = électricité à 30 %, opérateur payé, usure lente.

## 5. Personnel

| Niveau | Rôle | Opère | Salaire | Formation |
| --- | --- | --- | --- | --- |
| 1 — Manœuvre | Travail à la main | Établis | 0,03 €/s | — |
| 2 — Opérateur | Conduite de machine | Mécanique | 0,10 €/s | 100 €, 30 s |
| 3 — Régleur | Réglage, petite maintenance | Semi-automatique | 0,35 €/s | 800 €, 2 min |
| 4 — Technicien | Maintenance des robots | 1 par chaîne robotisée | 1,50 €/s | 15 000 €, 5 min |

- Embauche gratuite, toujours au niveau 1. La RH automatise les formations.
- **Spécialisation** : +1 % de vitesse toutes les 5 min sur le même poste, plafond +20 %.
- **Moral** : baisse (−1 pt/min) au-delà de 85 % d'occupation, remonte (+2 pts/min) sous 70 %. Cadence = 70 % + 30 % × moral (plancher 70 %). L'ouvrier du goulot s'épuise en premier. Cantine : +15 pts de plafond, remontée ×1,5. Pas de shifts.
- Remplacement par des robots : reconversion (formation) ou licenciement — compte pour la fin.

**Rôles support** (données débloquées + décision prise à la place du joueur) :

| Rôle | Acte | Salaire | Données | Décision |
| --- | --- | --- | --- | --- |
| Contremaître | I | 0,2 €/s | Cadence par poste, goulot | Affecte les ouvriers |
| Superviseur de chaîne | II | 5 €/s | Occupation, pièces en attente, gaspillage, usure | Recommande les achats |
| RH | II | 5 €/s | Compétences, moral, formations | Forme et motive |
| Opérateur logistique | III | 60 €/s | Flux de stock, autonomie, échéances | Priorise et livre les contrats |
| Commercial | III | 80 €/s | Prévisions, prix du marché | Signe les contrats long terme |
| Contrôleur de gestion | III | 120 €/s | Coût de revient, marges, compte de résultat | Rapport périodique avec alertes |

Sans rôle, le joueur ne voit que caisse et stock : il lit l'usine par le visuel.

## 6. Technologie

| Palier | Découpe | Frappe | Taraudage | Contrôle | Opérateur | Recherche |
| --- | --- | --- | --- | --- | --- | --- |
| 0 — Manuel | Scie à main | Marteau et matrice | Taraud à main | Calibre | Niveau 1 | — |
| 1 — Mécanique | Scie à ruban | Presse hydraulique | Taraudeuse à colonne | Banc de mesure | Niveau 2 | 300 € |
| 2 — Semi-auto | Scie automatique | Presse à transfert | Taraudeuse multibroche | Contrôle optique | Niveau 3 | 25 000 € |
| 3 — Robotisé | Découpe laser | Frappe à froid multi-postes | Taraudage CN | Vision IA | Aucun (1 technicien/chaîne) | 500 000 € |
| 4 — Usine noire | Ligne intégrée sans humains | | | | Aucun | 50 M€ |

**Temps de cycle en fonte (s)** — palier 0 = valeurs POC ; paliers suivants = vitesse relative du cadrage (palier 1 : ×3,5 / ×3 / ×3,3 / ×2,5 ; palier 2 : ×8 / ×7,5 / ×9 / ×6 ; palier 3 : ×28 / ×25 / ×32 / ×22 ; palier 4 : ×100 / ×95 / ×110 / ×90 par rapport au manuel du cadrage 4 / 6 / 5 / 2 s). À re-simuler après le changement des temps manuels.

| Palier | Découpe | Frappe | Taraudage | Contrôle |
| --- | --- | --- | --- | --- |
| 0 — Manuel (POC) | 2,0 | 3,0 | 2,5 | 1,0 |
| 1 — Mécanique | 1,14 | 2,0 | 1,52 | 0,8 |
| 2 — Semi-auto | 0,5 | 0,8 | 0,56 | 0,33 |
| 3 — Robotisé | 0,14 | 0,24 | 0,16 | 0,09 |
| 4 — Usine noire | 0,04 | 0,06 | 0,05 | 0,02 |

**Prix de la première unité (€)** et consommation :

| Palier | Découpe | Frappe | Taraudage | Contrôle | kW / unité |
| --- | --- | --- | --- | --- | --- |
| 0 — Manuel (POC) | 15 | 20 | 18 | 12 | 0 |
| 1 — Mécanique | 120 | 180 | 150 | 105 | 1,5 |
| 2 — Semi-auto | 1 600 | 2 400 | 2 000 | 1 400 | 25 |
| 3 — Robotisé | 24 000 | 36 000 | 30 000 | 21 000 | 150 |
| 4 — Usine noire | 480 000 | 720 000 | 600 000 | 420 000 | 2 500 |

- Unité supplémentaire sur un même poste : ×1,35 la précédente. 4 unités max par poste et par chaîne.
- Moderniser un poste remplace ses unités ; les anciennes sont revendues 25 %.
- **Outillage** (POC) : 3 niveaux par poste, +25 % de vitesse chacun (multiplicatif), coût = prix de l'établi × 1,5 × 2^niveau.
- Robotisé débloqué à l'acte III, usine noire à l'acte IV. Le bureau d'études (onglet R&D) débloque paliers, matériaux et confort (maintenance préventive, prédictive).

## 7. Chaînes

- Nouvelle chaîne = équipement de la meilleure chaîne × 1,2 + frais de hall ; frais de hall ×1,8 par chaîne supplémentaire.
- Chaque chaîne a ses ouvriers, son usure, sa consommation, et travaille un seul matériau.
- Nombre max de chaînes par site : prologue 1, acte I 2, acte II 4, acte III 8, acte IV 16.
- Visuel : chaque chaîne est un hall ; de près postes et ouvriers, de loin un bâtiment avec fumée et voyant de panne.

## 8. Matériaux

| Matériau | Prix de vente | Matière | Facteur de cycle | Palier min | Recherche | Disponible |
| --- | --- | --- | --- | --- | --- | --- |
| Fonte | 3 € | 0,60 € | ×1,0 | Manuel | — | Prologue |
| Acier doux | 7 € | 1,80 € | ×1,3 | Manuel | 500 € | Acte I |
| Laiton | 18 € | 5 € | ×1,1 | Mécanique (frappe + taraudage) | 8 000 € | Acte I |
| Acier inox | 50 € | 16 € | ×1,7 | Mécanique | 30 000 € | Acte II |
| Titane | 160 € | 55 € | ×2,4 | Semi-auto | 400 000 € | Acte III |
| Carbure de tungstène | 600 € | 220 € | ×3,2 | Robotisé | 8 M€ | Acte IV |
| Diamant synthétique | 3 000 € | 1 200 € | ×4,5 | Usine noire | 150 M€ | Acte IV |

Facteur appliqué : frappe et taraudage plein ; découpe 1 + (f − 1) × 0,5 ; contrôle 1 + (f − 1) × 0,3. L'usure suit le facteur. Couleurs : fonte gris mat, acier gris clair, laiton doré, inox argenté, titane bleuté, carbure presque noir, diamant scintillant (bloom).

## 9. Tap / clic : accélérer le temps

- Tout accélère ensemble (production, salaires, électricité, usure, moral, jour/nuit, délais). Hors ligne : vitesse ×1.
- Commande : un gros bouton rouge sur le pupitre, à côté du compte-tours (« NE PAS APPUYER — sauf si pressé »), ou la barre d'espace. Le clic sur la scène ne fait plus passer le temps : il est réservé aux actions sur les machines et les ouvriers.
- Modèle POC (régime `rev` de 0 à 1) : chaque appui +0,12 × √(1 − rev) ; retombée (0,08 + 0,5 × rev²) par seconde ; maintien du bouton (ou de la barre d'espace) = montée jusqu'à 0,5 ; zone rouge au-delà de 0,8 ; vitesse = 1 + rev × (max − 1).
- Vitesse max : ×3 prologue, ×4 acte I, ×4,5 acte II, ×5 acte III, ×5 acte IV (à valider).
- Zone rouge : usure ×5. Il faut ~10 clics/s pour y entrer.
- Compte-tours gradué tous les ×0,25 sur le pupitre ; retours visuels et sonores (ouvriers qui courent, son plus aigu, vignettage rouge).

## 10. Usure, pannes, maintenance

| Paramètre | Valeur |
| --- | --- |
| Usure à pleine charge, zone verte | 0 → 100 % en 2 h de jeu |
| Usure en veille | ×0,3 |
| Zone rouge | ×5 |
| Risque de panne | Dès 50 % : ((usure − 50)/50)² × 20 % par minute |
| Maintenance externe | 25 % du prix de l'unité, 60 s, jamais refusée (dette si besoin) |
| Technicien interne | 8 % du prix, 20 s |
| Préventive | Remise à zéro dès 60 %, 3 % du prix |
| Prédictive | Alerte 2 min avant |

## 11. Énergie

| Paramètre | Valeur |
| --- | --- |
| Réseau | 0,04 € par kW·s, illimité tant que payé |
| Veille | 30 % de la puissance |
| Module solaire | 50 kW crête, le jour seulement, 1 000 €, ×1,17 |
| Éolienne | 200 kW × 55–100 % selon le vent, 5 000 €, ×1,17 |
| Batterie | 10 000 kW·s, 3 000 € |
| Revente du surplus | 0,015 € par kW·s |

Sans trésorerie, le réseau coupe : ralentissement proportionnel, jamais d'arrêt si du renouvelable est disponible. Les techniciens réduisent la consommation.

## 12. Marché, contrats, Ferrum

| Étape | Marché (€/s de ventes) | Chaînes max | Hall supplémentaire | Objectif |
| --- | --- | --- | --- | --- |
| Prologue | 4 (POC) | 1 | — | Dette 800 € (POC), échéance 20 min de jeu, 20 € de départ |
| Acte I | 24 | 2 | 400 € | 50 % du marché pendant 30 s |
| Acte II | 1 000 | 4 | 3 000 € | 50 % |
| Acte III | 16 000 | 8 | 15 000 € | 50 % |
| Acte IV | 10 M | 16 | 100 000 € | Réunir 1,5 Md€ |

- Part de marché = ventes en € ÷ taille du marché (moyenne glissante). Au-delà du marché, les écrous ne se vendent plus.
- Échéance dépassée au prologue : dette +10 %, 10 min de délai en plus (jamais de game over).
- **Contrats ponctuels** : quantité, matériau, prix (prix de vente × 0,85–1,30 × réputation), délai ; paiement à la livraison complète ; échec = −2 réputation.
- **Contrats long terme** (acte II+) : prix × 1,08–1,22, prélèvement et paiement continus, rupture si l'approvisionnement chute.
- **Réputation** : +5 % sur les prix par niveau.
- **Ferrum** : part = 100 % − joueur ; événements à 30/50/70 % de part du joueur (guerre des prix −15 % pendant 5 min, débauchage, contrat exclusif retiré).

## 13. Prestige

- Savoir-faire gagné = ⌊(chiffre d'affaires de l'acte / 10 000)^0,3⌋ ; 1 point ≈ +3 % de cadence (arbre de bonus calibré sur cette équivalence).
- Capital de départ du site suivant : 15 % de la valeur d'achat des équipements revendus.
- Conservés : recherches, savoir-faire, Marcel, réputation partielle, statistiques. Remis à zéro : machines, chaînes, ouvriers, stock, contrats, trésorerie.

## 14. Principes d'équilibrage

- Sur le fil, jamais sous l'eau ; tout problème s'annonce avant de faire mal ; planchers partout ; une crise à la fois (directeur d'incidents) ; les problèmes se déplacent (humains → mécaniques → organisationnels) ; rendements décroissants par levier ; le gaspillage coûte ; 2–3 systèmes nouveaux par acte.
- Simulation de référence (cadrage initial, avant les valeurs POC) : campagne complète en 8 h 50 sans clic, 5 h 30 en jouant actif, 3 h 57 en zone rouge permanente, aucun blocage. Durées par acte (actif, min réelles) : 10 / 32 / 63 / 56 / 171.
- Mesures POC (moteur réel, prologue) : Marcel seul 0,25 €/s ; 4 ouvriers 0,68 €/s ; ligne équilibrée 9 ouvriers 2,13 €/s ; atelier manuel max 2,81 €/s.
- Points d'attention : l'acte I ne doit pas rester tout en manuel ; le creux d'attente de la recherche diamant (acte IV) doit être occupé par des jalons.

## 15. Visuel, audio, interface

- Scène de l'atelier en coupe (style POC) : établis/machines par poste, ouvriers qui marchent et travaillent, piles de pièces, rack de barres, caisse de produits finis, lampes, verrières.
- Caméra qui recule à chaque agrandissement (atelier → halls → site) ; zoom et déplacement à la molette et au glisser ; niveau de détail selon le zoom.
- Repris de la v5 : cycle jour/nuit, shaders (bloom, chaleur, grain), particules, sons synthétisés, pupitre industriel, onglet Données (verrouillé par rôles).
- Séquence finale : lumières qui s'éteignent dans l'usine noire, puis se rallument dans l'usine du grand-père.
- Pupitre : trésorerie, objectif de l'acte, compte-tours, alertes. Onglets : Atelier/Production, Équipe, R&D, Contrats/Marché, Données. Télex pour l'histoire.

## 16. Plan de réalisation

1. Socle du projet et moteur de simulation (porté du POC, déterministe, testé).
2. Prologue complet (moteur de chaîne, ouvriers, outillage, dette, télex).
3. Acte I : technologie, qualification, matériaux, contremaître, marché de la ville.
4. Acte II : chaînes multiples, usure/maintenance, moral, énergie, contrats.
5. Acte III : rôles support, onglet Données verrouillé par rôles, robotisation, titane.
6. Acte IV : usine noire, carbure, diamant, rachat de Ferrum, fin.
7. Prestige, savoir-faire, bac à sable, caméra évolutive, shaders, finitions, sauvegarde et hors-ligne.

## 17. Points ouverts (décider et journaliser si besoin)

- Une ou deux fins selon le sort des ouvriers remplacés (reconvertis ou licenciés).
- Ambiance du récit : mystérieuse façon CloverPit, ou chaleureuse et familiale.
- Contenu exact de l'arbre de savoir-faire.

## 18. Version PC : écarts avec ce cadrage (2 octobre 2026)

Valeurs re-simulées sur le vrai moteur (`npm run sim`) ; elles font foi dans `src/data/balance.ts`. Le détail et les raisons sont dans `docs/decisions.md`.

| Paramètre | Cadrage | Version PC |
| --- | --- | --- |
| Temps manuels | 4 / 6 / 5 / 2 s | 2 / 3 / 2,5 / 1 s (POC v6.1) |
| Établis | 30 € pondérés | 15 / 20 / 18 / 12 € (POC v6.1) |
| Outillage | — | 3 niveaux par poste, +25 % chacun, prix de l'unité du palier × 1,5 × 2^niveau, remis à zéro à la modernisation |
| Prologue | 400 € de dette | 20 € de départ, marché 4 €/s (5 €/s depuis la § 22), dette 800 €, échéance 20 min (POC v6.1) |
| Marché acte I | 24 €/s | 180 €/s |
| Marché acte II | 1 000 €/s | 1 700 €/s |
| Marché acte III | 16 000 €/s | 27 000 €/s |
| Recherche semi-auto / robotisé / usine noire | 25 k€ / 500 k€ / 50 M€ | 80 k€ / 1,2 M€ / 200 M€ |
| Recherche laiton / inox / titane / diamant | 8 k€ / 30 k€ / 400 k€ / 150 M€ | 30 k€ / 60 k€ / 800 k€ / 800 M€ |

Règles précisées :

- Les déménagements de fin d'acte (I → II → III → IV) sont les prestiges ; les rôles d'encadrement restent sur l'ancien site.
- Part de marché au prix de base ; un contrat compte au fil de la mise de côté de ses pièces.
- Relève : un ouvrier fatigué et surchargé laisse sa machine à un collègue libre ; embaucher plus d'ouvriers que de machines préserve le moral.
- Les établis ne s'usent pas ; trésorerie négative = réseau coupé, machines au rythme du renouvelable (plancher 30 %).
- Contrats, moral et énergie à partir de l'acte II ; deux fins selon reconversions et licenciements ; ambiance chaleureuse.

Durées simulées (jeu actif) : prologue 7 min, acte I 22 min, acte II 32 min, acte III 61 min, acte IV 203 min, total 5 h 25.

## 19. Refonte v2 : usines, chaînes, postes fixes (3 octobre 2026)

Demandée après les premières parties (acte III déficitaire, recettes invisibles, longues attentes sans achat). Elle remplace les sections 4, 5, 7 et 18 là où elles divergent ; `src/data/balance.ts` fait foi, le détail est dans `docs/decisions.md`.

**Structure.** Une usine (un hall) contient 4 chaînes ; une chaîne est une rangée de 4 postes (découpe, frappe, taraudage, contrôle). On achète les postes un par un : chaque nouveau poste va à la première chaîne qui ne l'a pas. Les pièces appartiennent à leur chaîne ; si une chaîne n'a pas le poste suivant, sa sortie part vers la chaîne la moins chargée qui l'a. Le nombre d'usines par site reste plafonné (1 / 2 / 4 / 8 / 16).

**Personnel.** On n'embauche que des manœuvres. Chaque ouvrier est affecté à l'embauche au poste libre le plus utile (avec contremaître : le plus lent) et n'en change plus, ni de poste ni d'usine. Pas de reconversion : on licencie et on embauche. Les polyvalents (70 % du salaire, 75 % de cadence, 6 par usine) tiennent les postes vacants et relèvent les fatigués. Formation : +4 % de productivité chacune ; après 5 formations, promotion au niveau suivant (opérateur, régleur, technicien).

**Technologie.** Modernisation machine par machine ; la machine garde son ouvrier et attend sa promotion s'il n'a pas le niveau (formation d'urgence possible à découvert). Outillage : 50 niveaux par poste et par palier, valables pour toutes les machines identiques de la partie ; gain 1 + 1,6 × (1 − e^(−n/18)), coût prix machine × 0,8 × 1,09^n.

**Flux.** Sans convoyeur, chaque pièce est portée à la main (1 s). Convoyeur à manivelle par chaîne, dès le prologue, actionné par un ouvrier dédié ; prix 60 % de la valeur des machines de la chaîne (40 € minimum). Les robots transfèrent seuls.

**Encadrement.** Contremaître : rapport dynamique de productivité par poste. Nouvel ingénieur méthodes (acte II) : modernise selon une consigne (palier visé par poste, part de trésorerie). Tous les rôles se congédient. Recettes en €/s toujours affichées ; alerte quand l'encadrement dépasse 25 % des recettes.

| Paramètre | Version PC (§ 18) | Refonte v2 |
| --- | --- | --- |
| Marchés actes I / II / III | 180 / 1 700 / 27 000 €/s | 220 / 3 000 / 32 000 €/s |
| Recherche mécanique / semi-auto / robotisé / usine noire | — / 80 k€ / 1,2 M€ / 200 M€ | 300 € / 150 k€ / 3 M€ / 500 M€ |
| Recherche laiton / inox / titane / diamant | 30 k€ / 60 k€ / 800 k€ / 800 M€ | 30 k€ / 100 k€ / 2,5 M€ / 1,5 Md€ |
| Rachat de Ferrum | — | 2 Md€ |
| Outillage | 3 niveaux, +25 % | 50 niveaux, global |

Durées simulées (jeu actif, graine 11) : prologue 6,5 min, acte I 39, acte II 47, acte III 55, acte IV 169, total 5 h 16.

## 23. Rejouabilité et partage (4 octobre 2026)

Quêtes du carnet de Marcel (remplacent les jalons), tutoriel sur rails, succès (29 + 3 de défis), carnet du grand-père en 12 pages, radio de l'atelier, carte postale et carte de fin, défis du bac à sable (site à 1 000 € ; « Sans licencier » 500 000 écrous, « L'artisan » 1 M€ au mécanique, « Contre la montre » 3 500 écrous en 30 min). Succès et pages du carnet sont gardés dans le navigateur, d'une partie à l'autre.

## 22. Caractère des ouvriers (4 octobre 2026)

Tiré à l'embauche : ordinaire 40 %, rapide 18 % (+15 % de cadence, fatigue × 1,6), endurant 16 % (−8 %, fatigue × 0,4), bon camarade 10 % (moral de sa chaîne : baisse × 0,8, remontée × 1,4), soigneux 8 % (usure × 0,7), doué 8 % (formations × 0,6). Marché du quartier : 5 €/s.

## 21. Commandes spéciales (4 octobre 2026)

Remplacent les contrats ponctuels de la section 12, dès l'acte I (une à la fois, sans réputation avant l'acte II). Taille : 2 à 5 min de la moitié de la production du matériau ; une commande acceptée met de côté la moitié de cette production au fil de l'eau. Difficultés : délai × 2 / × 1,3 / × 1,1, prime +8 / +15 / +25 %. Une commande manquée paie les pièces livrées au prix normal. Réputation +0,5 par commande tenue. Recherche de l'usine noire : 750 M€.

## 20. Équipe de nuit (4 octobre 2026)

Remplace la progression hors ligne de la version PC (8 h à pleine cadence). Disponible à l'acte II, gardée au déménagement.

| Piste | Niveaux | Effet | Prix |
| --- | --- | --- | --- |
| Rendement | 50 | +0,5 % de la cadence par niveau (25 % au maximum) | 1 500 € × 1,25^niveau |
| Durée | 10 | 30 min de base, +15 min par niveau (3 h au maximum) | 6 000 € × 2,2^niveau |

Une absence de 5 min au plus est rattrapée à plein régime. Au-delà, l'usine tourne « rendement × durée » à plein régime, et la part de marché ne progresse pas. Le rapport d'absence affiche le manque à gagner. Au maximum, une nuit vaut 45 min de production à vitesse normale.
