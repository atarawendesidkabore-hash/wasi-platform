# WASI Platform — Runbook opérationnel

*Dernière mise à jour : 2026-08-07*

## 1. Dépôt canonique

- **Code source** : `C:\Users\eu\OneDrive\Desktop\Project\wasi-platform`
- **Remote GitHub** : https://github.com/atarawendesidkabore-hash/wasi-platform (branche `main`)
- **Site live (GitHub Pages)** : https://atarawendesidkabore-hash.github.io/wasi-platform/index.html

Toute modification passe par ce dépôt. Un `git push` sur `main` redéploie automatiquement le site GitHub Pages (délai ~1–2 min).

> ⚠️ Le dossier vit dans OneDrive : ne jamais éditer le même dépôt depuis deux machines en même temps (risque de conflits de synchronisation OneDrive sur `.git`).

## 2quinquies. Veille législative quotidienne (→ score pays)

`.github/workflows/refresh-legal-news.yml` s'exécute **chaque jour à 05h30 UTC** : `scripts/fetch-legal-news.mjs` → `data/legal-news.json`. C'est la **quatrième composante du score pays** (`legalAdj`, borné à ±2), aux côtés du macro Banque mondiale (±5) et de la stabilité.

```bash
node scripts/fetch-legal-news.mjs            # les 53 pays (~1 min)
node scripts/fetch-legal-news.mjs GH BF CI   # seulement ces codes ISO2
```

Source : Google News RSS, requête par pays restreinte au vocabulaire législatif (français pour les pays francophones, anglais sinon). Aucune clé requise.

### Garde-fous (ne pas les retirer sans y réfléchir)

Chacun corrige une erreur observée en test :

| Garde-fou | Erreur qu'il corrige |
|---|---|
| **Verbe + sujet économique** requis pour un signal positif | « Parliament passes anti-LGBTQ+ bill » notait **+1** sur le seul mot « passes ». Or cette loi a coûté à Ghana des financements Banque mondiale. |
| **Régressions de droits = négatif** | Même cas : criminalisation, presse, coupures Internet sont des risques d'investissement réels (suspensions de bailleurs). |
| **Législateur étranger écarté** | « US House passes bill to halt Nigeria aid » notait **+** pour le Nigeria. |
| **Deux titres concordants minimum** | Un titre isolé ne doit jamais déplacer un score souverain. |
| **Déduplication par histoire** (mot-clé + semaine) | Une seule affaire ghanéenne générait 40 titres → net −24. Le volume de presse n'est pas le nombre d'événements. |
| **Plafond ±2** | Un lexique de mots-clés ne mérite pas plus d'influence que ça. |

⚠️ Le classement est un **lexique** (`lexicon_v1`), pas une compréhension. Les titres ambigus valent **zéro**. Les titres justificatifs sont affichés dans la fiche pays : si un ajustement paraît faux, c'est vérifiable — et corrigeable en enrichissant les listes dans le script.

Amélioration prévue : reclasser les titres via Claude (proxy IA) pour remplacer le lexique, une fois le proxy en service et créditée.

## 2quater. AFEX — profils pays « Starter » → « Detailed »

`scripts/build-afex-profiles.mjs` calcule les **pondérations réelles** de chaque indice pays à partir des statistiques officielles d'exportation (UN Comtrade, endpoint public) et écrit `data/afex-profiles.json`. Le DEX (`wasi-dex/app.js`) charge ce fichier et **promeut automatiquement** un pays en `Detailed` quand les données le justifient (≥ 5 ans de données, ≥ 3 lignes de produits).

```bash
node scripts/build-afex-profiles.mjs                 # les 54 pays (~45 min)
node scripts/build-afex-profiles.mjs BUREX ZMBEX     # seulement ces codes
node scripts/build-afex-profiles.mjs --years=2014-2023
```

Les réponses sont mises en cache dans `data/.afex-cache/` (non versionné) : une exécution interrompue ou limitée en débit se relance sans tout retélécharger.

### ⚠️ Base de pondération : valeur, pas tonnage

La méthodologie publiée annonce « moyenne glissante 20 ans du **tonnage** d'exportation ». **Ce calcul n'est pas réalisable** avec les données disponibles :

- UN Comtrade ne reçoit **aucun poids net** de la plupart des déclarants africains (Burkina Faso 2022 : 0 ligne sur 86 avec `netWgt`).
- Les données miroir (imports déclarés par les partenaires) ne sont pas exposées sur l'endpoint public.
- FAOSTAT exige désormais une clé d'API (401).

Les pondérations sont donc calculées sur la **valeur d'exportation en USD**, et chaque profil porte `weighting_basis: "export_value_usd"` ainsi que le taux de couverture tonnage constaté. **À corriger dans les documents investisseurs** avant toute diffusion, ou à sourcer auprès des instituts nationaux de statistique si le tonnage est exigé.

Contrôle de cohérence : NGAEX ressort à ~93 % pétrole/gaz en valeur, contre « ~86 % en tonnage » annoncé dans la note existante — ordres de grandeur compatibles.

## 2ter. WASI Transfer — un seul moteur de tarification

Le produit Transfert existe sur **deux surfaces** :

1. **WASI Transfer Mobile** — `wasi-dex/wasi-transfer-app.html` (app dédiée, écran mobile).
2. **DEX → onglet « Transfert WASI »** — dans `index.html`.

Les deux chargent **`wasi-transfer-core.js`**, unique source de vérité : paliers tarifaires, taux, formule de calcul et formatage des nombres.

| Palier | Montant envoyé | Frais | Marge FX | Coût total |
|---|---|---|---|---|
| Starter | 0 – 199 | 1,00 % … 1,20 % | 0,40 % | **1,60 %** |
| Growth | 200 – 999 | 1,00 % | 0,40 % | **1,40 %** |
| Pro | 1 000 + | 0,80 % | 0,40 % | **1,20 %** |

Formule (ne pas « simplifier ») : `frais = envoi × feePct` → `livré = (envoi − frais) × taux × (1 − fxPct)`.
Contrôle : 200 EUR → XOF doit toujours donner **129 360 XOF** (palier Growth).

> ⚠️ **Toute modification de tarif ou de taux se fait dans `wasi-transfer-core.js` uniquement.** Ne jamais redéclarer de paliers ou de taux dans `index.html` ou `wasi-transfer-app.js` — les deux surfaces afficheraient alors des prix différents au même client.

Les taux du jour proviennent de `data/market-live.json` (voir ci-dessous) ; l'EUR reste à la parité fixe BCEAO 655,957. Sans ce fichier, les taux de référence du core s'appliquent.

## 2bis. Pipeline cours de marché (quotidien)

`.github/workflows/refresh-market.yml` s'exécute **chaque jour ouvré à 18h15 UTC** (après clôture BRVM/JSE/EGX) : `scripts/fetch-market-data.mjs` → `data/market-live.json`.

- **Live** : FX (open.er-api.com, ~165 paires vs XOF — alimente aussi le Transfert WASI), crypto (CoinGecko), **BRVM cours officiels** (scrape brvm.org), JSE et EGX (Yahoo Finance).
- **Référence** : NGX, GSE, NSE Kenya et autres bourses sans flux gratuit — libellées comme telles dans le badge du DEX.
- **Badge DEX** : « Cours au \<date\> · Live : ... » — passe orange si les données ont plus de 4 jours.
- **Panne probable** : le scrape BRVM casse si brvm.org change sa mise en page (le script échoue proprement, les autres sources continuent).

## 1bis. Moteurs métier et tests

Le dépôt reste **sans dépendance et sans étape de build**. Les tests utilisent le lanceur intégré de Node :

```bash
npm test          # 63 tests, sans aucune dépendance
```

| Module | Rôle | Tests |
|---|---|---|
| `lib/africredit/credit-scoring.js` | Score de crédit WASI (7 facteurs pondérés + vetos) | ✅ |
| `lib/africredit/par-calculator.js` | PAR30/60/90, OSS, synthèse de portefeuille | ✅ |
| `lib/africredit/expert-scoring-engine.js` | Proposition de décision (7 composantes, veto dette souveraine) | ✅ |
| `lib/banking-engine.js` | Comptes, dépôts, retraits, virements (bigint en centimes XOF) | ✅ |
| `lib/africredit/amortisation.js` | Échéanciers, imputation des paiements, arriérés par échéance | ✅ |

`.github/workflows/tests.yml` exécute la suite à chaque push et pull request.

### Provenance : récolté depuis l'app React

Ces moteurs ont été **portés depuis `wasi-frontend` (`src/africredit`, `src/banking`)**, où ils étaient écrits en TypeScript avec `decimal.js`. Le portage est **numériquement identique à l'original**, vérifié par un harnais d'équivalence de **30 197 comparaisons, 0 divergence**.

⚠️ **Deux pièges rencontrés lors du portage — ne pas les réintroduire :**

1. **`round2` doit reproduire `decimal.js` ROUND_HALF_UP**, qui arrondit la *représentation la plus courte* du double. `Math.round(value * 100)` donne `1.005 → 1.00` au lieu de `1.01`. Inversement, « nettoyer » le bruit binaire avec `toPrecision` rendait chaque score concerné **un centime trop haut**.
2. **Multiplier avant de diviser** pour le ratio de garantie : `22M / 50M * 100` en flottant donne `44.000000000000006`, pas `44`, ce qui décale l'arrondi final d'un centime. `decimal.js` calculait exact.

Le harnais d'équivalence n'est pas versionné (il dépend de `node_modules` de l'app React). Pour le rejouer, bundler les originaux avec esbuild et comparer aux modules de `lib/`.

## 1ter. Microfinance — PAR et scores calcules par AfriCredit

`microfinance-app/app.js` est charge en **module** (`<script type="module">`) et importe les moteurs de `lib/africredit`. Il ne recalcule plus ces metriques lui-meme.

| Avant | Maintenant |
|---|---|
| « PAR 30 » = encours des credits dont le *statut* etait « Late », divise par l'encours total | **PAR 30 / 60 / 90** calcules par `generatePortfolioSummary` sur les **jours de retard reels** (deduits de `nextDueDate`) |
| Score client = 100 moins des penalites ad hoc | **`calculateCreditScore`** (7 facteurs ponderes + vetos), avec note AAA..D |
| Aucun suivi de l'engagement investisseur | Carte dediee : `PAR30 < 5 %` respecte ou **DEPASSE** |

### Points d'attention

- **Garantie obligatoire.** Le moteur exige un collateral > 0. Le formulaire de credit a donc un champ « Garantie XOF », et `normalizeState` met les anciens credits a 0 : le score affiche alors « garantie non renseignee » au lieu d'un chiffre invente.
- **Dates de la demo relatives.** Les credits de demonstration utilisent `seedDueDate(offset)`. Les dates figees pourrissaient : les credits etaient dus en mars 2026, donc des que le PAR a suivi les vrais jours de retard, tout le portefeuille ressortait a 140 jours de retard et le PAR30 affichait 100 %.
- **Portefeuille de demo a 26 credits.** Avec 3 credits seulement, un seul impaye pesait plus de 5 % de l'encours et la carte d'engagement s'affichait toujours en depassement. Le portefeuille compte desormais 3 agences, 5 agents, 22 clients (dont ~60 % de femmes, conformement a l'engagement investisseur) et 26 credits, pour **13 443 253 F CFA d'encours et un PAR30 de 3,24 %** — engagement respecte. Chaque credit est genere par `seedLoan()`, qui construit son echeancier reel et solde ses `settled` premieres echeances : les arrieres sont donc exacts et relatifs a la date du jour.

- **`debtRatio` = charge de la dette / revenu, pas l'encours / le principal.** Le moteur AfriCredit refuse au-dela de 80 % : c'est un ratio de **service de la dette**. L'app lui passait `outstanding / principal`, c'est-a-dire le taux d'utilisation du credit — 100 % le jour du deblocage et 0 % a l'echeance. Resultat : **tout nouvel emprunteur etait vetoe** (score 0, note D) et un emprunteur presque rembourse paraissait irreprochable. La fiche client porte donc maintenant un **revenu mensuel net** obligatoire ; sans lui, aucun score n'est calcule (« revenu non renseigne ») plutot qu'un ratio de 0 % qui serait la valeur la plus flatteuse possible.

- **Retards severes : le veto est desormais atteignable.** L'app plafonnait son `paymentHistory` a exactement 10 alors que le veto se declenche **en dessous** de 10 : un emprunteur a 200 jours de retard etait note 52,44 / BB au lieu d'etre refuse. L'echelle est maintenant calee sur le seuil PAR90 (0 j → 100, 45 j → 50, 90 j et plus → 0, donc veto).

- **Garantie jugee en couverture, pas en francs absolus.** `COLLATERAL_FULL_SCORE_XOF` vaut 50 000 000 XOF, calibre pour du credit corporate : une garantie villageoise de 450 000 XOF y valait 0,9/100 et les 10 % de ponderation du facteur etaient **inertes** — deux clients aux garanties six fois differentes etaient separes de 0,07 point. `calculateCreditScore` accepte donc un `collateralFullScoreXof` optionnel (defaut inchange) et l'app microfinance lui passe le principal : le facteur lit alors « quelle part du montant prete est couverte ».

- **Tresorerie alignee sur le risque sectoriel.** L'ancienne regle donnait `STABLE` (100) aux secteurs a risque **eleve** et ne penalisait que les secteurs moyens, annulant 4,0 des 4,5 points que le facteur sectoriel est cense separer. Un secteur eleve est desormais `VOLATILE`, moyen `VARIABLE`, faible `STABLE`, et 30 jours de retard imposent `VOLATILE` quel que soit le secteur.

- **`countryRisk` lu sur la fiche.** Il etait code en dur a `"CI"`, donc le veto « transition militaire » (BF, ML, NE, GN) ne pouvait **jamais** se declencher. Le defaut reste ivoirien parce que l'institution l'est, pas parce que le champ serait fixe.

- **Constantes de module en tete de fichier.** `SUPPORTED_COUNTRY_RISKS` et `CASH_FLOW_LABELS` sont declarees avant le bloc de donnees de demo. Declarees plus bas, elles se trouvaient dans leur *temporal dead zone* au moment ou le portefeuille de demonstration se construit et scorait les clients : `Cannot access 'SUPPORTED_COUNTRY_RISKS' before initialization`, et la liste des clients restait vide.

### Creation de credit : panne du filtre juridique = revue humaine

Le formulaire passe par un controle juridique IA servi par `microfinance-app/server.mjs`. Ce serveur **ne demarre pas depuis ce depot** (il importe `../archives-bf-ai/lib/search-utils.mjs`, present dans le depot `WASI`) et **n'existe pas sur GitHub Pages**.

Avant, une panne du filtre **jetait le dossier** : le bloc `catch` affichait « REVIEW » mais retournait `null`, donc l'agent perdait sa saisie et aucun credit ne pouvait etre enregistre tant que le serveur etait indisponible.

Desormais une panne technique **n'est pas un refus** : elle est routee vers la revue humaine qui existait deja.

1. La carte indique explicitement que le filtre juridique **n'a pas ete execute**.
2. L'agent verifie les sources officielles, puis clique « Valider le pret apres revue manuelle » (confirmation obligatoire).
3. Le credit est enregistre avec `approvalMode: "manual-review"` et `complianceDecision: "REVIEW_FILTRE_INDISPONIBLE"`.
4. La fiche du credit porte le badge **« Filtre juridique IA non execute »**.

> Rien n'est approuve automatiquement. Pour lister les credits engages sans filtre : filtrer sur `complianceDecision === "REVIEW_FILTRE_INDISPONIBLE"`.

Les **remboursements** suivent desormais exactement le meme parcours (bouton « Valider le remboursement apres revue manuelle », marqueur `REVIEW_FILTRE_INDISPONIBLE`, badge sur la fiche). C'etait le cas le plus urgent : le client a deja remis les fonds, refuser de les enregistrer creait un ecart de caisse.

Les deux chemins (automatique et revue manuelle) passent par une seule fonction d'ecriture (`recordRepaymentFromDraft`), pour qu'ils ne puissent pas diverger dans la mise a jour du credit.

### Echeancier d'amortissement (`lib/africredit/amortisation.js`)

Le PAR se mesure sur **l'echeance impayee la plus ancienne**, pas sur une date unique. C'etait indispensable : avec une seule `nextDueDate` que rien ne faisait avancer, un client qui payait restait en retard pour toujours et le PAR ne pouvait jamais redescendre.

| Element | Regle |
|---|---|
| Base de calcul | Annuite (echeance totale constante), interets sur solde degressif |
| Taux | `interestRate` est **annuel nominal** ; taux periodique = taux / 12 / 100 |
| Monnaie | bigint en centimes XOF, jamais de flottant |
| Granularite | **franc entier** : chaque echeance est un multiple de 100 centimes |
| Derniere echeance | Absorbe le residu d'arrondi : principal rembourse = principal decaisse **au centime** |
| Imputation d'un paiement | Echeance la plus ancienne d'abord ; dans une echeance, interets avant principal |
| Encours pour le PAR | Principal restant du (`schedulePrincipalOutstandingCentimes`), pas principal + interets |
| Surplus | Retourne comme `excessCentimes` et stocke en `loan.prepaymentXof`, jamais absorbe en silence |

Apres un remboursement, `outstanding`, `nextDueDate` et le statut sont **derives** de l'echeancier. Le statut « Watch » pose par un agent n'est jamais ecrase.

**Repli pour les credits sans echeancier** (donnees anciennes, ou termes refuses par le moteur) : le remboursement reduit l'encours et **avance `nextDueDate` d'une periode**. La fiche affiche alors « Pas d'echeancier ». Sans ce repli, ces credits accumuleraient des arrieres indefiniment.

⚠️ Un echeancier vit en bigint : **ne jamais le stocker sur l'objet credit**, `JSON.stringify` leve une exception sur BigInt et casserait `saveState()`. Il est serialise en chaines via `serialiseSchedule` dans `loan.schedule`.

### Francs entiers, pas seulement a l'affichage

Le XOF n'a **pas de sous-unite en circulation** : un guichetier ne peut pas encaisser 53 centimes. Une echeance de 110 163,53 XOF n'est donc pas collectable. Consequence sur tout le moteur :

- chaque echeance (principal, interets, total) est arrondie au **franc entier** (multiple de 100 centimes), la derniere absorbant le residu — le principal rembourse reste egal au principal decaisse **exactement** ;
- les paiements entrent en francs entiers (`BigInt(Math.round(montant)) * 100n`) ;
- `loan.outstanding` est donc un **entier**, plus 327 350,53 mais 327 352 ;
- les montants restent stockes en centimes pour rester coherents avec `lib/banking-engine.js`, mais contraints au franc.

`roundingUnitCentimes` (defaut `100n`) permet de repasser au centime pour une devise qui en a une : `buildSchedule({ ..., roundingUnitCentimes: 1n })`. Quatre tests verrouillent l'invariant, dont la conservation du principal apres arrondi.

Controle : sur la demo, PAR30 passe de **20,71 % a 0 %** quand l'echeance en retard de Mariam Traore est reglee — l'exact scenario impossible avant.

## ⚠️ Creation de credit bloquee hors poste de dev

Le formulaire passe par un controle juridique IA servi par `microfinance-app/server.mjs`. Ce serveur **ne demarre pas depuis ce depot** : il importe `../archives-bf-ai/lib/search-utils.mjs`, absent de `wasi-platform` (present dans le depot `WASI`), et requiert `express`, `@anthropic-ai/sdk` et des credits Anthropic. Sur GitHub Pages il n'y a aucun serveur : le controle echoue et **aucun credit ne peut etre enregistre en ligne**. Les vues lecture (portefeuille, PAR, scores) fonctionnent normalement.

## 2sexies. Les 5 composantes du score, et leur cadence

| Composante | Borne | Source | Cadence |
|---|---|---|---|
| Score de base | — | Notation d'expert WASI | revues de plateforme |
| Macro | ±5 | Banque mondiale (`country-macros.json`) | **quotidien 06h00 UTC** |
| Stabilité | −4…+2 | Drapeau `coup` + niveau du score de base | avec le score de base |
| Veille législative | ±2 | Google News RSS (`legal-news.json`) | **quotidien 05h30 UTC** |
| Diversification export | ±3 | UN Comtrade HHI (`afex-profiles.json`) | hebdomadaire dim. 04h00 UTC |

Le score lui-même est **recalculé côté client** à chaque chargement (et toutes les 6 h dans un onglet ouvert) à partir de ces fichiers : il suffit qu'un fichier change pour que le score suive, sans redéploiement.

**Alignement DEX ↔ score** : la composante export et les indices AFEX du DEX lisent **le même `data/afex-profiles.json`**. La jointure se fait par `iso3` → `iso2` via `country-macros.json` (qui porte les deux codes), afin qu'aucune table de correspondance ne puisse dériver. Une jointure manquée est journalisée en `console.warn` — jamais silencieuse. État vérifié : **46 pays joints sur 53**, les 7 manquants étant exactement les non-déclarants Comtrade (Tchad, Guinée équatoriale, Soudan du Sud, Éthiopie, Érythrée, Somalie, Soudan), dont la composante export vaut 0.

## 2. Pipeline de données (scores pays)

### Fonctionnement

1. **GitHub Actions** (`.github/workflows/refresh-data.yml`) s'exécute **lundi et jeudi à 06h00 UTC** :
   - `scripts/fetch-world-bank.mjs` → récupère PIB, croissance, inflation, dette (Banque mondiale) + croissance FMI (cross-check) → `data/country-macros.json`
   - `scripts/build-score-history.mjs` → reconstruit la série temporelle depuis l'historique git → `data/country-history.json`
   - Commit + push automatiques si les données ont changé → redéploiement Pages.
2. **Côté app** : `wasi-ai-integration.js` charge ces deux fichiers au démarrage, applique l'ajustement macro (±5) aux scores de base et pilote les flèches de tendance ↑↓→.
3. **Badge de santé** : la barre du haut affiche `● LIVE · BM <date>` (vert). Si les données ont plus de 10 jours : `⚠ données anciennes` (orange) → vérifier le workflow.

### Vérifier / relancer manuellement

- **Vérifier les dernières exécutions** : GitHub → Actions → « Refresh WASI Country Macros ».
- **Relancer à la main** : bouton *Run workflow* (workflow_dispatch), ou en local :

```bash
node scripts/fetch-world-bank.mjs && node scripts/build-score-history.mjs && git add data/ && git commit -m "data: refresh manuel" && git push
```

### Pannes connues

| Symptôme | Cause probable | Remède |
|---|---|---|
| Badge orange « données anciennes » | Le cron a échoué (API BM en panne) | Relancer via *Run workflow* ; les fetchs ont désormais 3 relances automatiques |
| Aucun commit du bot depuis > 60 jours | GitHub désactive les crons après 60 jours d'inactivité du dépôt | Actions → réactiver le workflow ; pousser un commit |
| Scores identiques pendant des semaines | Normal : les indicateurs BM sont **annuels** | Rien à faire (voir `methodologie.html`) |

## 3. Assistant IA (Claude)

Trois modes, dans cet ordre de priorité :

1. **Proxy WASI** (recommandé — la clé Anthropic reste côté serveur) : `index.html` pointe déjà par défaut sur `https://wasi-ai-proxy.onrender.com`. Les utilisateurs n'ont besoin que d'un **token WASI** (ex. `WASI-DEMO-2026`), jamais d'une clé API.
2. **Repli BYOK** : clé Anthropic personnelle saisie dans Admin → Clé API (localStorage). Usage interne uniquement.
3. **Repli local** : sans proxy ni clé, le chat répond via le moteur local (scores, WACC, risques) — jamais d'écran d'erreur.

### Mise en service du proxy (à faire une fois)

*Vérifié en local le 2026-08-10 : toute la chaîne UI → proxy → Anthropic fonctionne ; seule la clé API était révoquée.*

1. **Créer une clé API valide** : https://console.anthropic.com → API Keys → Create Key.
   La clé trouvée dans `WASI\.env` est **révoquée** (HTTP 401) — mettre à jour la ligne `ANTHROPIC_API_KEY=` de `WASI\.env` ET de `wasi-platform\backend\.env` (jamais commitées, `.gitignore` le garantit).
2. **Tester en local** :
   ```bash
   cd wasi-platform/backend && npm install && node server.js
   ```
   Puis dans l'app locale (console navigateur) : `wasiSetProxyUrl("http://localhost:3000")` — le chat doit répondre via Claude.
3. **Déployer sur Render** : https://dashboard.render.com → New → Web Service → connecter le repo GitHub `wasi-platform`, root directory `backend` (le blueprint `backend/render.yaml` préremplit tout). Nom du service : **wasi-ai-proxy** (doit correspondre à l'URL par défaut et à la CSP).
   Variables d'environnement à saisir dans le dashboard Render : `ANTHROPIC_API_KEY` (la nouvelle clé), `WASI_ACCESS_TOKENS` (ex. `WASI-DEMO-2026,WASI-CLIENT1-26`), `ALLOWED_ORIGINS=https://atarawendesidkabore-hash.github.io`.
4. **Vérifier** : `https://wasi-ai-proxy.onrender.com/` doit répondre `{"status":"online"}` ; le chat du site live bascule alors automatiquement sur Claude — aucun changement de code nécessaire.

Notes : plan gratuit Render = mise en veille après 15 min d'inactivité (première réponse lente ~30 s) ; passer au plan Starter pour un service permanent. Chaque token WASI distribué est un identifiant client — les révoquer en les retirant de `WASI_ACCESS_TOKENS`. Journal d'audit (tokens hachés, jamais en clair) visible dans les logs Render.

## 4bis. ⚠️ Cache navigateur — à faire à CHAQUE déploiement de code

Les fichiers JS/CSS sont référencés avec un jeton de version, par ex. `./app.js?v=20260811a`. **Sans cela, les visiteurs continuent d'exécuter l'ancien code après un déploiement** — c'est exactement ce qui s'est produit : la correction du panneau de transfert était en ligne mais invisible sans `Ctrl+Shift+R`, et le DEX affichait encore « Detailed 4 » alors que le fichier déployé en contenait 43.

Après toute modification d'un `.js` ou `.css`, incrémenter le jeton dans les trois pages :

```bash
node -e "const fs=require('fs');const v=new Date().toISOString().slice(0,10).replace(/-/g,'')+'a';['index.html','wasi-dex/index.html','wasi-dex/wasi-transfer-app.html'].forEach(f=>{let c=fs.readFileSync(f,'utf8');c=c.replace(/\?v=\d{8}[a-z]/g,'?v='+v);fs.writeFileSync(f,c);});console.log('version -> '+v)"
```

Les fichiers de **données** (`data/*.json`) portent déjà `?v=` + horodatage à l'exécution : ils n'ont jamais besoin d'être versionnés à la main.

## 4. Déploiement du site

- `git push` sur `main` → GitHub Pages se redéploie tout seul. Aucune étape de build.
- Fichiers clés : `index.html` (app), `wasi-ai-integration.js` (IA + données live), `methodologie.html` (méthodologie publique), `data/*.json` (données).
- La CSP dans `index.html` (`connect-src`) doit lister toute nouvelle origine appelée par l'app (proxy, API...).

## 5. Consolidation des dossiers (à faire)

Le dossier `Project` contient de nombreuses copies historiques de WASI. **Dépôt canonique = `wasi-platform` uniquement.** Copies candidates à l'archivage (déplacer dans un dossier `_archive`, ne pas supprimer sans vérification) :

- `wasi-platform-inspect`, `wasi-platform-next-inspect`, `wasi-frontend-inspect`
- `wasi-backend-api-inspect`, `wasi-backend-api-hash-inspect`, `wasi-cli-inspect`
- `wasi-intelligence-fixed`, `WASI-INTELLIGENCE-EXACT`
- `WASI\wasi-platform` (copie imbriquée), `WASI\WASI-PLATFORM-EXACT`, `WASI\WASI-PLATFORM-LITE`, `WASI\wasi-platform-live`
- `WASI.worktrees`

Avant d'archiver : vérifier `git -C <dossier> status` (rien de non commité) et qu'aucun raccourci (`.lnk`) n'y pointe.

## 6. Contacts et accès

- **Propriétaire** : kabore.tara@gmail.com
- **Demandes Pro** (rapports, licences AFEX, API) : bouton « Accès Pro » dans l'app → email pré-rempli. Compteur local de clics : `localStorage.wasi_pro_clicks`.
