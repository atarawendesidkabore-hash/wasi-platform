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
