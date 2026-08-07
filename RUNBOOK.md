# WASI Platform — Runbook opérationnel

*Dernière mise à jour : 2026-08-07*

## 1. Dépôt canonique

- **Code source** : `C:\Users\eu\OneDrive\Desktop\Project\wasi-platform`
- **Remote GitHub** : https://github.com/atarawendesidkabore-hash/wasi-platform (branche `main`)
- **Site live (GitHub Pages)** : https://atarawendesidkabore-hash.github.io/wasi-platform/index.html

Toute modification passe par ce dépôt. Un `git push` sur `main` redéploie automatiquement le site GitHub Pages (délai ~1–2 min).

> ⚠️ Le dossier vit dans OneDrive : ne jamais éditer le même dépôt depuis deux machines en même temps (risque de conflits de synchronisation OneDrive sur `.git`).

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

Deux modes, dans cet ordre de priorité :

1. **Proxy WASI** (recommandé — la clé Anthropic reste côté serveur) :
   - Code : `backend/server.js` (Express, à déployer sur Render — `backend/render.yaml`).
   - Variables Render : `ANTHROPIC_API_KEY`, `WASI_ACCESS_TOKENS` (liste de tokens séparés par virgules), `ALLOWED_ORIGINS`.
   - Activer côté client : dans la console du navigateur `wasiSetProxyUrl("https://wasi-ai-proxy.onrender.com")` — ou définir `window.WASI_PROXY_URL` dans `index.html` pour l'activer pour tous les visiteurs.
   - Les utilisateurs n'ont alors besoin que d'un **token WASI** (ex. `WASI-DEMO-2026`), plus jamais d'une clé API.
2. **Repli BYOK** : clé Anthropic personnelle saisie dans Admin → Clé API (localStorage). Fonctionne sans proxy mais réservé à un usage interne.

Si ni proxy ni clé : l'app bascule sur les signaux locaux (pas de chat IA).

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
