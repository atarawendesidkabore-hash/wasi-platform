(function () {
  // ── Proxy config — replace with your Render URL after deployment ─────────
  const PROXY_URL   = (window.WASI_PROXY_URL || "https://wasi-ai-proxy.onrender.com") + "/api/chat";
  const AUTH_URL    = (window.WASI_PROXY_URL || "https://wasi-ai-proxy.onrender.com") + "/api/auth";
  const CLAUDE_MODEL = "claude-sonnet-4-6";

  const state = {
    booted: false,
    source: null,
    signals: new Map(),
    loadingSignals: false,
    chatBusy: false,
    patched: false,
    proxyReady: false,
  };

  // ── WASI Access Token management ─────────────────────────────────────────
  // The WASI access token is a platform-level credential (e.g. "WASI-DEMO-2026").
  // It is NOT the Anthropic API key — that key lives exclusively on the backend proxy.
  // Users receive a token when they subscribe. Demo token is provided on the landing page.
  function getWasiToken() {
    // 1. Programmatically injected (highest priority)
    if (window.WASI_ACCESS_TOKEN) return window.WASI_ACCESS_TOKEN;
    // 2. URL param ?wasi_token=... (for link-based onboarding / SSO)
    try {
      const urlToken = new URLSearchParams(window.location.search).get("wasi_token") || "";
      if (urlToken) { localStorage.setItem("wasi_access_token", urlToken); return urlToken; }
    } catch (_) {}
    // 3. Persisted token from a previous session
    try {
      const stored = localStorage.getItem("wasi_access_token") || "";
      if (stored) return stored;
    } catch (_) {}
    // 4. Legacy: migrate old direct-API users gracefully
    //    (raw Anthropic keys are no longer accepted here — the proxy handles that server-side)
    return "";
  }

  // Store / clear WASI access token (called from login UI if one is added later)
  function setWasiToken(token) {
    try {
      if (token) localStorage.setItem("wasi_access_token", token.trim());
      else localStorage.removeItem("wasi_access_token");
    } catch (_) {}
    if (token) window.WASI_ACCESS_TOKEN = token.trim();
  }
  window.wasiSetToken = setWasiToken;

  async function validateToken(token) {
    try {
      const res = await fetch(AUTH_URL.replace('/chat', '').replace('/api/chat', '/api/auth'), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      });
      const data = await res.json();
      return data.valid === true;
    } catch (_) {
      return false; // Proxy unreachable — fall back to local AI
    }
  }

  // ── Chat persistence ─────────────────────────────────────────────────────
  const CHAT_STORAGE_KEY = "wasi_chat_history_v2";
  const MAX_STORED_MSGS  = 30;

  function saveChatHistory() {
    try {
      const toSave = (window.chatHistory || []).slice(-MAX_STORED_MSGS);
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(toSave));
    } catch (_) {}
  }

  function loadChatHistory() {
    try {
      const raw = localStorage.getItem(CHAT_STORAGE_KEY);
      if (!raw) return;
      const history = JSON.parse(raw);
      if (!Array.isArray(history) || !history.length) return;
      window.chatHistory = history;

      const container = document.getElementById("chat-messages");
      if (!container) return;

      // Keep welcome message, append restored turns
      const restored = history.slice(-12);
      restored.forEach((msg) => {
        const div = document.createElement("div");
        div.className = "chat-msg " + (msg.role === "user" ? "user" : "bot");
        div.textContent = String(msg.content || "");
        container.appendChild(div);
      });

      // Add a small separator
      const sep = document.createElement("div");
      sep.className = "chat-msg bot";
      sep.style.cssText = "font-size:.72rem;color:var(--text-dim);border-top:1px solid var(--border);padding-top:8px;margin-top:4px;";
      sep.textContent = "— Historique restauré · " + new Date().toLocaleDateString("fr-FR", { day:"2-digit", month:"short" }) + " —";
      container.appendChild(sep);

      container.scrollTop = container.scrollHeight;
    } catch (_) {}
  }

  function clearChatHistory() {
    try { localStorage.removeItem(CHAT_STORAGE_KEY); } catch (_) {}
    window.chatHistory = [];
    const container = document.getElementById("chat-messages");
    if (container) container.innerHTML = '<div class="chat-msg bot">Historique effacé. Nouvelle session WASI AI.</div>';
  }

  // Expose globally so users can call wasiClearChat() from console
  window.wasiClearChat = clearChatHistory;

  // ── Build compact 54-country encyclopedia for system prompt ─────────────
  function buildCountryEncyclopedia() {
    const countries = Array.isArray(window.COUNTRIES) ? window.COUNTRIES : [];
    const details   = window.COUNTRY_DETAILS || {};
    const risks     = window.COUNTRY_RISKS   || {};
    if (!countries.length) return "";

    const lines = countries.map(function(c) {
      const d = details[c.code] || {};
      const r = risks[c.code]   || {};
      const coup = c.coup ? " [RÉGIME MILITAIRE]" : "";
      const wacc = r.wacc ? ` WACC:${r.wacc}%` : "";
      const credit = r.credit ? ` Crédit:${r.credit}` : "";
      const resources = (d.resources || []).join("/");
      const exports_  = (d.exports   || []).join("/");
      return `${c.flag||""} ${c.name} (${c.code}${coup}) | Score:${c.score}/100 | Region:${c.region} | PIB:${c.gdp} | Croissance:${d.growth||"N/A"} | Inflation:${d.inflation||"N/A"} | Dette:${d.dette_pib||"N/A"} | Devise:${d.currency||"N/A"} | Capital:${d.capital||"N/A"} | President:${d.president||"N/A"} | Pop:${d.pop||"N/A"} | Ressources:${resources||"N/A"} | Exports:${exports_||"N/A"} | Politique:${(d.indices||{}).politique||"?"} Economie:${(d.indices||{}).economie||"?"} Infra:${(d.indices||{}).infra||"?"} Juridique:${(d.indices||{}).juridique||"?"} Humain:${(d.indices||{}).humain||"?"} Integration:${(d.indices||{}).integration||"?"}${credit}${wacc}`;
    });

    return "BASE DE DONNÉES WASI — 54 PAYS AFRICAINS (données World Bank 2024) :\n" + lines.join("\n");
  }

  // ── Secure Claude call — ALL traffic routes through the backend proxy ────
  // The Anthropic API key NEVER touches the browser. The proxy (wasi-ai-proxy.onrender.com)
  // holds the key in its server environment variables and validates the WASI access token.
  async function callClaude(userMessage, history, countryProfile) {
    const token = getWasiToken();
    if (!token) throw new Error("no_key"); // → local AI fallback

    // ── Platform knowledge ─────────────────────────────────────────────────
    const wasiKnowledge =
      "Tu es WASI AI, l'intelligence artificielle officielle de WASI (Whole African Strategic Intelligence), " +
      "infrastructure financière africaine fondée par Tarawendesida Thomas KABORE, FMVA, CEO à Ouagadougou, Burkina Faso. " +
      "WASI couvre 54 pays africains avec scores WASI (0-100) sur 6 axes : Politique, Economie, Infra, Juridique, Humain, Intégration. " +
      "Modules : (1) Intelligence — scores pays IA ; (2) DEX — marchés financiers (BRVM, NGX, GSE, JSE, BVMAC) ; " +
      "(3) CIREX Microfinance ; (4) Private Market ; (5) Ecosystem Hub ; (6) CLI Bloomberg-style. " +
      "Cadres légaux : OHADA, SYSCOHADA, BCEAO, UEMOA, CEDEAO. TAM : $4.2Mds USD.";

    // ── Instructions ───────────────────────────────────────────────────────
    const instructions =
      "RÈGLES DE RÉPONSE OBLIGATOIRES :\n" +
      "1. Utilise EXCLUSIVEMENT les données WASI fournies dans ce prompt pour les chiffres (PIB, croissance, inflation, score, dette, WACC, président, ressources, exports).\n" +
      "2. Pour toute question sur un pays : cite systématiquement son Score WASI, son PIB, sa croissance, son inflation, son président, sa devise, ses 3 ressources principales et ses 3 exports principaux.\n" +
      "3. Donne un verdict d'investissement clair : FAVORABLE / PRUDENCE / ÉVITER, avec les 3 secteurs porteurs et les 2 risques majeurs.\n" +
      "4. Pour des comparaisons de pays : compare les scores WASI, PIB, croissance et WACC côte à côte avec des chiffres précis.\n" +
      "5. Pour les corridors commerciaux : cite les pays, les produits échangés et les devises concernées.\n" +
      "6. Style : analytique, structuré, chiffré. Paragraphes courts. Réponds TOUJOURS en français.\n" +
      "7. Si une donnée n'est pas dans ce prompt, dis-le clairement au lieu d'inventer.\n" +
      "8. Ne remplace pas un avis juridique ou financier formel.";

    // ── Focused country deep profile ────────────────────────────────────────
    let focusedCtx = "";
    if (countryProfile) {
      const riskData = (window.COUNTRY_RISKS || {})[countryProfile.code] || {};
      const risques = (riskData.risques || []).map(function(r) {
        return r.nom + " (cat:" + r.cat + " prob:" + r.prob + "/5 impact:" + r.impact + "/5)";
      }).join("; ");

      focusedCtx =
        "═══ PAYS EN FOCUS ACTIF : " + countryProfile.name + " (" + countryProfile.code + ") ═══\n" +
        "Score WASI global : " + countryProfile.currentScore + "/100" + (countryProfile.coup ? " ⚠ RÉGIME MILITAIRE" : "") + "\n" +
        "Région : " + countryProfile.region + "\n" +
        "Président : " + (countryProfile.president || "N/A") + "\n" +
        "Capitale : " + (countryProfile.capital || "N/A") + " | Centre éco : " + (countryProfile.eco_center || "N/A") + "\n" +
        "Population : " + (countryProfile.pop || "N/A") + " | Devise : " + (countryProfile.currency || "N/A") + "\n" +
        "PIB : " + countryProfile.gdp + " (" + (countryProfile.gdp_year || "2024") + ") | Source : " + (countryProfile.dataSource || "WASI") + "\n" +
        "Croissance : " + countryProfile.growth + " | Inflation : " + countryProfile.inflation + " | Dette/PIB : " + countryProfile.debt_gdp + "\n" +
        "Ressources naturelles : " + countryProfile.resources + "\n" +
        "Exports principaux : " + countryProfile.exports + "\n" +
        "Sous-indices WASI :\n" +
        "  - Politique : " + countryProfile.politique + "/100\n" +
        "  - Economie : " + countryProfile.economie + "/100\n" +
        "  - Infrastructure : " + countryProfile.infra + "/100\n" +
        "  - Juridique : " + countryProfile.juridique + "/100\n" +
        "  - Capital Humain : " + countryProfile.humain + "/100\n" +
        "  - Intégration régionale : " + countryProfile.integration + "/100\n" +
        (riskData.credit ? "Signal Crédit WASI : " + riskData.credit + "\n" : "") +
        (riskData.wacc   ? "WACC pays : " + riskData.wacc + "% (" + (riskData.waccNote || "") + ")\n" : "") +
        (riskData.fxRisk ? "Risque FX : " + riskData.fxRisk + " — " + (riskData.fxNote || "") + "\n" : "") +
        (riskData.electionYear ? "Prochaine élection : " + riskData.electionYear + "\n" : "") +
        (risques ? "Risques spécifiques identifiés : " + risques + "\n" : "") +
        (countryProfile.micro ? (
          "Micro-économie : Élasticité-prix=" + countryProfile.micro.elasticite_prix +
          " Concentration export=" + countryProfile.micro.concentration_export +
          " Productivité=" + countryProfile.micro.productivite +
          " Compétitivité=" + countryProfile.micro.competitivite +
          " Résilience=" + countryProfile.micro.resilience + "\n"
        ) : "");
    }

    // ── 54-country encyclopedia ────────────────────────────────────────────
    const encyclopedia = buildCountryEncyclopedia();

    const systemPrompt = [
      wasiKnowledge,
      instructions,
      encyclopedia,
      focusedCtx,
    ].filter(Boolean).join("\n\n");

    const messages = [
      ...history.slice(-8)
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role, content: String(m.content) })),
      { role: "user", content: userMessage },
    ];

    // ── POST to backend proxy — API key stays on the server ─────────────
    const _ctrl = new AbortController();
    const _tid  = setTimeout(function(){ _ctrl.abort(); }, 20000); // 20s — proxy may cold-start
    const resp = await fetch(PROXY_URL, {
      method: "POST",
      signal: _ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        "x-wasi-token": token,          // WASI subscription token, NOT the Anthropic API key
      },
      body: JSON.stringify({ messages, system: systemPrompt, max_tokens: 1800 }),
    });
    clearTimeout(_tid);

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      if (resp.status === 401) {
        // Invalid or expired WASI token — clear it and fall back to local AI
        setWasiToken("");
        throw new Error("Token WASI invalide ou expiré. Contactez support@wasi.africa.");
      }
      if (resp.status === 429) throw new Error("Limite de requêtes atteinte. Attendez 1 minute.");
      if (resp.status === 503 || resp.status === 502) throw new Error("proxy_sleep"); // Render cold start
      throw new Error(err?.error || `Erreur proxy ${resp.status}`);
    }

    const data = await resp.json();
    const reply = data.reply || "Je n'ai pas pu produire une réponse exploitable.";
    return { reply, citations: [], countrySignal: null, source: { aiEnabled: true } };
  }

  // ── Local country signal computation (no server needed) ──────────────────
  function computeLocalSignal(country) {
    const base = typeof country.baseScore === "number" ? country.baseScore : country.score;
    const adj  = country.coup ? -4 : base >= 70 ? 2 : base >= 50 ? 1 : 0;
    const coverageLabel = base >= 70 ? "Couverture nationale approfondie"
      : base >= 50 ? "Couverture régionale BCEAO / UMOA / UEMOA"
      : "Couverture annuaire pays UA";
    return {
      code: country.code,
      baseScore: base,
      aiAdjustment: adj,
      finalScore: Math.min(100, Math.max(0, base + adj)),
      legalReadiness: base >= 65 ? "Élevée" : base >= 45 ? "Moyenne" : "Limitée",
      summary: `Signal IA local — ${country.name}: score de base ${base}, ajustement ${adj >= 0 ? "+" : ""}${adj}.`,
      frameworks: [country.region || "UA", country.coup ? "Transition" : "Stabilité"],
      coverageLabel,
      officialSources: [],
    };
  }

  function isHostedShell() {
    return window.location.protocol === "file:" || /github\.io$/i.test(window.location.hostname);
  }

  function getOfflineStatusLabel(action = "Connexion") {
    return `${action} directe — WASI AI hors serveur (mode autonome)`;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getCountryByCode(code) {
    return Array.isArray(window.COUNTRIES) ? window.COUNTRIES.find((country) => country.code === code) || null : null;
  }

  function getCountrySignal(code) {
    return state.signals.get(code) || null;
  }

  function formatRefreshAge(source) {
    if (!source || typeof source.sourceAgeHours !== "number") {
      return "mise à jour inconnue";
    }
    if (source.sourceAgeHours < 1) {
      return "mise à jour il y a moins d'une heure";
    }
    if (source.sourceAgeHours < 24) {
      return `mise à jour il y a ${Math.round(source.sourceAgeHours)} h`;
    }
    return "actualisation requise";
  }

  function hasBackgroundRefresh(source) {
    if (!source) {
      return false;
    }

    if (source.refreshInProgress) {
      return true;
    }

    return Array.isArray(source.legalCodes)
      ? source.legalCodes.some((codeSource) => Boolean(codeSource?.refreshInProgress))
      : false;
  }

  function buildSourceStatusLabel(source) {
    return hasBackgroundRefresh(source)
      ? "WASI AI · actualisation en cours..."
      : `WASI AI · ${formatRefreshAge(source)}`;
  }

  function buildSourceStatusTone(source) {
    return source?.aiEnabled ? "ready" : "warn";
  }

  function ensureBaseScores() {
    if (!Array.isArray(window.COUNTRIES)) {
      return;
    }

    window.COUNTRIES.forEach((country) => {
      if (typeof country.baseScore !== "number") {
        country.baseScore = country.score;
      }
      if (typeof country.score !== "number") {
        country.score = country.baseScore;
      }
    });
  }

  function getCountryPayloads() {
    ensureBaseScores();
    return window.COUNTRIES.map((country) => ({
      code: country.code,
      name: country.name,
      baseScore: country.baseScore,
      coup: Boolean(country.coup),
      juridique: window.COUNTRY_DETAILS?.[country.code]?.indices?.juridique ?? 50,
      integration: window.COUNTRY_DETAILS?.[country.code]?.indices?.integration ?? 50,
      region: country.region,
    }));
  }


  function formatAssistantText(value) {
    return String(value || "")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/\*\*/g, "")
      .replace(/\s*\[(?:country|doc)-[^\]]+\]/g, "")
      .replace(/^\|.*\|$/gm, "")
      .replace(/^-{3,}$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function installHeaderUi() {
    // Header bar removed — status/refresh/clear buttons suppressed
  }

  function updateStatus(text, tone) {
    const status = document.getElementById("wasi-ai-status");
    if (!status) {
      return;
    }

    status.className = `wasi-ai-status ${tone || ""}`.trim();
    status.textContent = text;

    const refreshButton = document.getElementById("wasi-ai-refresh");
    if (refreshButton) {
      refreshButton.disabled = tone === "loading";
    }
  }

  function upgradeWelcomeCopy() {
    // Header bar hidden — skip title/focus updates

    const firstBotMessage = document.querySelector("#chat-messages .chat-msg.bot");
    if (firstBotMessage) {
      firstBotMessage.textContent =
        "WASI Intelligence — 54 pays africains · Base législative complète (constitutions, IS/TVA, OHADA, codes commerciaux) · Secteurs, corridors, WACC, verdicts investissement. Posez votre question.";
    }

    const suggestionTexts = [
      "Verdict investissement Côte d'Ivoire 2026",
      "Cadre légal et fiscal du Sénégal",
      "Droit des sociétés OHADA — SARL vs SAS",
      "Analyse du corridor Abidjan-Lagos",
      "Microfinance et fintech en Afrique de l'Ouest",
      "Comparer Ghana et Nigeria sur l'attractivité IDE",
      "Codes commerciaux Afrique — CAMA, Companies Act, AUDCG",
      "ZLECAf : opportunités sectorielles pour investisseurs",
    ];

    document.querySelectorAll(".chat-sugg").forEach((button, index) => {
      if (suggestionTexts[index]) {
        button.textContent = suggestionTexts[index];
      }
    });
  }

  function normalizeAppRoute(route) {
    if (!route) {
      return "";
    }
    if (/^https?:\/\//i.test(route)) {
      return route;
    }
    if (route === "/") {
      return "./index.html";
    }
    if (route.startsWith("./") || route.startsWith("../")) {
      return route;
    }
    if (route.startsWith("/")) {
      return `.${route}`;
    }
    return `./${route}`;
  }

  function getConnectorModules() {
    const fallbackModules = [
      {
        key: "core",
        title: "Noyau WASI",
        route: "/wasi-core-console.html",
        status: "active",
        summary: "Console coeur, audit et cartographie temps reel des modules WASI.",
      },
      {
        key: "dex",
        title: "WASI DEX",
        route: "/wasi-dex/wasi-app.html",
        status: "active",
        summary: "54 places AFEX, references export et modules de marche relies a l'IA.",
      },
      {
        key: "microfinance",
        title: "CIREX Microfinance",
        route: "/microfinance-app/index.html",
        status: "active",
        summary: "Credit, conformite terrain et pilotage microfinance relies a WASI.",
      },
      {
        key: "private-market",
        title: "WASI Private Market",
        route: "/microfinance-app/wasi-customer-portal.html",
        status: "active",
        summary: "Portail client, souscription privee et passerelles investissement.",
      },
      {
        key: "ecosystem",
        title: "WASI Ecosystem Hub",
        route: "/ecosystem-hub/index.html",
        status: "active",
        summary: "Navigation groupe entre intelligence, marche, microfinance et apps.",
      },
      {
        key: "cli",
        title: "WASI CLI",
        route: "",
        status: "synced",
        summary: "Terminal Bloomberg-style synchronise avec Excel, le web, les 4 codes francais et les connecteurs WASI.",
      },
    ];
    const sourceApps = Array.isArray(state.source?.apps) ? state.source.apps : [];
    const sourceAppsByKey = new Map(sourceApps.map((app) => [app.key, app]));

    return fallbackModules.map((fallback) => {
      const sourceApp = sourceAppsByKey.get(fallback.key) || {};
      return {
        ...fallback,
        ...sourceApp,
        route: normalizeAppRoute(sourceApp.route || fallback.route),
      };
    });
  }

  function formatModuleStatus(status) {
    if (!status) {
      return "actif";
    }
    return String(status).replace(/-/g, " ");
  }

  function buildConnectorGridHtml() {
    const modules = getConnectorModules();
    return `
      <div class="wasi-ai-connector-section">
        <div class="wasi-ai-connector-head">Connexions WASI</div>
        <div class="wasi-ai-connector-grid">
          ${modules
            .map(
              (module) => {
                const route = module.route ? escapeHtml(module.route) : "";
                const tag = route ? "a" : "div";
                const href = route ? ` href="${route}"` : "";
                const staticClass = route ? "" : " is-static";
                return `
                <${tag} class="wasi-ai-connector-card${staticClass}"${href}>
                  <div class="wasi-ai-connector-top">
                    <span class="wasi-ai-connector-name">${escapeHtml(module.title)}</span>
                    <span class="wasi-ai-connector-chip ${escapeHtml(module.status || "active")}">${escapeHtml(
                      formatModuleStatus(module.status),
                    )}</span>
                  </div>
                  <div class="wasi-ai-connector-copy">${escapeHtml(module.summary || "")}</div>
                </${tag}>
              `;
              },
            )
            .join("")}
        </div>
      </div>
    `;
  }

  function buildCompositeCard() {
    const host = document.getElementById("right-composite");
    if (!host) {
      return;
    }

    let card = document.getElementById("wasi-ai-composite-card");
    if (!card) {
      card = document.createElement("div");
      card.id = "wasi-ai-composite-card";
      card.className = "wasi-ai-comp-card";
      host.insertBefore(card, host.firstChild.nextSibling);
    }

    const averageAdjustment =
      window.COUNTRIES.reduce((sum, country) => sum + (country.aiAdjustment || 0), 0) / Math.max(window.COUNTRIES.length, 1);
    const coveredCountries = window.COUNTRIES.filter((country) => state.signals.has(country.code)).length;
    const legalCodes = Array.isArray(state.source?.legalCodes) ? state.source.legalCodes : [];
    const legalCodesReady = legalCodes.length ? legalCodes.filter((code) => code?.sourceReady).length : 0;
    const legalCodesCount = legalCodes.length || 4;
    const localBridgeLabel = state.source?.aiEnabled ? "active" : isHostedShell() ? "localhost:3000 requis" : "hors ligne";
    const sourceAgeLabel = state.source ? formatRefreshAge(state.source) : "moteur local requis";

    card.innerHTML = `
      <div class="wasi-ai-card-title">WASI AI Layer</div>
      <div class="wasi-ai-comp-row"><span>Signal moyen IA</span><strong>${averageAdjustment >= 0 ? "+" : ""}${averageAdjustment.toFixed(1)}</strong></div>
      <div class="wasi-ai-comp-row"><span>Pays enrichis</span><strong>${coveredCountries} / ${window.COUNTRIES.length}</strong></div>
      <div class="wasi-ai-comp-row"><span>Codes francais embarques</span><strong>${legalCodesReady} / ${legalCodesCount}</strong></div>
      <div class="wasi-ai-comp-row"><span>Surfaces synchronisees</span><strong>Excel · Web · CLI</strong></div>
      <div class="wasi-ai-comp-row"><span>Pont local IA</span><strong>${escapeHtml(localBridgeLabel)}</strong></div>
      <div class="wasi-ai-comp-row"><span>État des sources</span><strong>${escapeHtml(sourceAgeLabel)}</strong></div>
      ${buildConnectorGridHtml()}
    `;

    const scoreLabel = host.querySelector(".comp-score-big .label");
    if (scoreLabel) {
      scoreLabel.textContent = "Score moyen AFRIQUE + IA";
    }
  }

  function applySignalsToCountries() {
    ensureBaseScores();

    window.COUNTRIES.forEach((country) => {
      const signal = getCountrySignal(country.code);
      if (signal) {
        country.score = signal.finalScore;
        country.aiAdjustment = signal.aiAdjustment;
      } else {
        country.score = country.baseScore;
        country.aiAdjustment = 0;
      }
    });

    if (typeof window.renderCountries === "function") {
      window.renderCountries();
    }
    if (typeof window.renderComposite === "function") {
      window.renderComposite();
    }

    buildCompositeCard();

    if (window.currentCountry) {
      if (window.innerWidth <= 640 && typeof window.showMobileCountryDetail === "function") {
        window.showMobileCountryDetail(window.currentCountry);
      } else if (typeof window.renderDesktopCountryDetail === "function") {
        window.renderDesktopCountryDetail(window.currentCountry);
      }
    }
  }

  function sourceListHtml(signal) {
    const sources = Array.isArray(signal?.officialSources) ? signal.officialSources : [];
    if (!sources.length) {
      return '<div class="wasi-ai-summary" style="margin-bottom:0;">Aucune source officielle ciblée n’a encore été reliée à ce pays dans la base WASI AI.</div>';
    }

    return `
      <div class="wasi-ai-sources">
        ${sources
          .map(
            (source) =>
              `<a class="wasi-ai-source-link" href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(
                source.authority,
              )} · ${escapeHtml(source.title)}</a>`,
          )
          .join("")}
      </div>
    `;
  }

  function buildCountryAiCard(country, signal) {
    if (!country || !signal) {
      return "";
    }

    const adjustmentClass = signal.aiAdjustment > 0 ? "positive" : signal.aiAdjustment < 0 ? "negative" : "";
    return `
      <div class="wasi-ai-country-card" id="wasi-ai-country-card">
        <div class="wasi-ai-card-title">WASI AI Score</div>
        <div class="wasi-ai-score-grid">
          <div class="wasi-ai-score-box">
            <div class="label">Score final</div>
            <div class="value">${signal.finalScore}</div>
          </div>
          <div class="wasi-ai-score-box">
            <div class="label">Score de base</div>
            <div class="value">${signal.baseScore}</div>
          </div>
          <div class="wasi-ai-score-box">
            <div class="label">Ajustement IA</div>
            <div class="value ${adjustmentClass}">${signal.aiAdjustment >= 0 ? "+" : ""}${signal.aiAdjustment}</div>
          </div>
          <div class="wasi-ai-score-box">
            <div class="label">Lecture légale</div>
            <div class="value">${signal.legalReadiness}</div>
          </div>
        </div>
        <div class="wasi-ai-summary">${escapeHtml(signal.summary)}</div>
        <div class="wasi-ai-tags">
          ${(signal.frameworks || []).map((item) => `<span class="wasi-ai-tag">${escapeHtml(item)}</span>`).join("")}
          <span class="wasi-ai-tag">Couverture: ${escapeHtml(signal.coverageLabel)}</span>
        </div>
        ${sourceListHtml(signal)}
      </div>
    `;
  }

  function decorateDesktopCountryDetail(code) {
    const panel = document.getElementById("right-country-detail");
    const country = getCountryByCode(code);
    const signal = getCountrySignal(code);
    if (!panel || !country || !signal) {
      return;
    }

    const existing = panel.querySelector("#wasi-ai-country-card");
    if (existing) {
      existing.remove();
    }

    panel.insertAdjacentHTML("beforeend", buildCountryAiCard(country, signal));

    const scoreNode = panel.querySelector(".cd-score-label");
    if (scoreNode) {
      scoreNode.textContent = "WASI Score + IA";
    }
  }

  function decorateMobileCountryDetail(code) {
    const body = document.getElementById("mobile-panel-body");
    const country = getCountryByCode(code);
    const signal = getCountrySignal(code);
    if (!body || !country || !signal) {
      return;
    }

    const existing = body.querySelector("#wasi-ai-country-card");
    if (existing) {
      existing.remove();
    }

    const actions = body.querySelector(".cd-actions");
    if (actions) {
      actions.insertAdjacentHTML("beforebegin", buildCountryAiCard(country, signal));
    } else {
      body.insertAdjacentHTML("beforeend", buildCountryAiCard(country, signal));
    }
  }

  function citationsHtml(citations) {
    if (!Array.isArray(citations) || !citations.length) {
      return "";
    }

    return `
      <div class="wasi-ai-citations">
        ${citations
          .slice(0, 6)
          .map(
            (citation) => `
              <a class="wasi-ai-citation" href="${escapeHtml(citation.sourceUrl || "#")}" target="_blank" rel="noreferrer">
                <span>${escapeHtml(citation.id)}</span>
                <span>${escapeHtml(citation.title || citation.section || "Source officielle")}</span>
              </a>
            `,
          )
          .join("")}
      </div>
    `;
  }

  function buildChatSignalMeta(signal) {
    if (!signal) {
      return "";
    }

    const adjustmentClass = signal.aiAdjustment > 0 ? "positive" : signal.aiAdjustment < 0 ? "negative" : "";
    return `
      <div class="wasi-ai-chat-meta">
        <span class="wasi-ai-tag">Score final ${signal.finalScore}</span>
        <span class="wasi-ai-tag">Base ${signal.baseScore}</span>
        <span class="wasi-ai-tag ${adjustmentClass}">Ajustement ${signal.aiAdjustment >= 0 ? "+" : ""}${signal.aiAdjustment}</span>
        <span class="wasi-ai-tag">${escapeHtml(signal.coverageLabel)}</span>
      </div>
    `;
  }

  function appendRichBotMessage(text, citations, signal) {
    const container = document.getElementById("chat-messages");
    if (!container) {
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "chat-msg bot";
    wrapper.innerHTML = `
      <div>${escapeHtml(formatAssistantText(text)).replace(/\n/g, "<br>")}</div>
      ${buildChatSignalMeta(signal)}
      ${citationsHtml(citations)}
    `;
    container.appendChild(wrapper);
    if (typeof window.scrollChat === "function") {
      window.scrollChat();
    } else {
      container.scrollTop = container.scrollHeight;
    }
  }

  // ── Live World Bank data loader ───────────────────────────────────────────
  // Fetches data/country-macros.json (auto-refreshed weekly by GitHub Actions)
  // and merges real GDP, growth, inflation, scoreAdj into window.COUNTRIES.
  async function loadWorldBankData() {
    try {
      const base = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, "");
      const url  = base + "/data/country-macros.json";
      const res  = await fetch(url + "?v=" + Date.now());
      if (!res.ok) return null;
      const json = await res.json();
      return json;
    } catch (_) {
      return null;
    }
  }

  function mergeWorldBankData(wb) {
    if (!wb || !wb.countries || !Array.isArray(window.COUNTRIES)) return;

    window.COUNTRIES.forEach((country) => {
      const live = wb.countries[country.code];
      if (!live) return;

      // Update GDP display string if we have live data
      if (live.gdp_fmt) {
        country.gdp = live.gdp_fmt;
      }
      // Store macro data for AI context
      country.liveGrowth    = live.growth;
      country.liveInflation = live.inflation;
      country.liveDebt      = live.debt_gdp;
      country.liveGdpYear   = live.gdp_year;
      country.liveMacroAdj  = live.scoreAdj ?? 0;

      // Blend the macro adjustment into the base score (capped ±5)
      if (typeof live.scoreAdj === "number") {
        country.macroAdj = live.scoreAdj;
      }
    });

    const fetchDate = wb.fetchedAt ? new Date(wb.fetchedAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "N/A";
    state.worldBankFetchedAt = fetchDate;
    state.worldBankLoaded = true;
  }

  // Enhanced signal that incorporates live World Bank macro adjustment
  function computeLiveSignal(country) {
    const base    = typeof country.baseScore === "number" ? country.baseScore : country.score;
    const macroAdj = typeof country.macroAdj === "number" ? country.macroAdj : 0;
    const stabilityAdj = country.coup ? -4 : base >= 70 ? 2 : base >= 50 ? 1 : 0;
    const totalAdj = macroAdj + stabilityAdj;
    const finalScore = Math.min(100, Math.max(0, Math.round(base + totalAdj)));

    const growthStr   = country.liveGrowth    != null ? country.liveGrowth + "%" : "N/A";
    const inflStr     = country.liveInflation != null ? country.liveInflation + "%" : "N/A";
    const debtStr     = country.liveDebt      != null ? country.liveDebt + "% PIB" : "N/A";
    const gdpYear     = country.liveGdpYear || "2024";

    const coverageLabel = base >= 70 ? "Couverture nationale approfondie"
      : base >= 50 ? "Couverture régionale BCEAO / UMOA / UEMOA"
      : "Couverture annuaire pays UA";

    return {
      code: country.code,
      baseScore: base,
      macroAdj,
      stabilityAdj,
      aiAdjustment: totalAdj,
      finalScore,
      legalReadiness: finalScore >= 65 ? "Élevée" : finalScore >= 45 ? "Moyenne" : "Limitée",
      summary: `PIB ${country.gdp} (${gdpYear}) · Croissance ${growthStr} · Inflation ${inflStr} · Dette ${debtStr}.`,
      frameworks: [country.region || "UA", country.coup ? "Transition" : "Stabilité", state.worldBankLoaded ? "Données BM 2024" : "Données locales"],
      coverageLabel,
      officialSources: [],
    };
  }

  async function loadSourceStatus() {
    installHeaderUi();
    state.source = { aiEnabled: true, legalCodes: [], apps: [], sourceAgeHours: 0 };
    updateStatus("WASI AI · chargement données BM...", "loading");
    buildCompositeCard();
  }

  async function refreshAiSources() {
    installHeaderUi();
    updateStatus("Actualisation données World Bank...", "loading");
    await loadCountrySignals();
  }

  async function loadCountrySignals() {
    if (state.loadingSignals || !Array.isArray(window.COUNTRIES)) {
      return;
    }

    state.loadingSignals = true;
    updateStatus("Chargement données World Bank 2024...", "loading");

    try {
      ensureBaseScores();

      // 1. Fetch live World Bank data
      const wb = await loadWorldBankData();
      if (wb) {
        mergeWorldBankData(wb);
        updateStatus("Intégration données BM " + (state.worldBankFetchedAt || "") + "...", "loading");
      }

      // 2. Compute signals (live if WB loaded, local fallback otherwise)
      const signals = window.COUNTRIES.map((c) =>
        state.worldBankLoaded ? computeLiveSignal(c) : computeLocalSignal(c)
      );
      state.signals = new Map(signals.map((s) => [s.code, s]));
      state.source  = { aiEnabled: true, legalCodes: [], apps: [], sourceAgeHours: 0 };

      applySignalsToCountries();

      const label = state.worldBankLoaded
        ? `WASI AI · Données World Bank ${state.worldBankFetchedAt || "2024"}`
        : "WASI AI · signaux locaux actifs";
      updateStatus(label, "ready");

      // Show live data badge in topbar
      if (state.worldBankLoaded) {
        const badge = document.getElementById("wb-data-badge");
        if (badge) badge.style.display = "inline-block";
      }
    } catch (error) {
      updateStatus("Erreur calcul signaux", "error");
      buildCompositeCard();
    } finally {
      state.loadingSignals = false;
    }
  }

  async function sendChatWithWasiAi() {
    const input = document.getElementById("chat-input");
    const typing = document.getElementById("chat-typing");
    const message = input ? input.value.trim() : "";
    if (!input || !message || state.chatBusy) {
      return;
    }

    state.chatBusy = true;
    input.value = "";

    if (typeof window.appendChatMsg === "function") {
      window.appendChatMsg(message, "user");
    }

    if (typing) {
      typing.classList.add("show");
    }

    const focusedCountry = window.currentCountry ? getCountryByCode(window.currentCountry) : null;
    const focusedSignal = focusedCountry ? getCountrySignal(focusedCountry.code) : null;
    const det = focusedCountry ? (window.COUNTRY_DETAILS?.[focusedCountry.code] || {}) : {};
    const idx = det.indices || {};
    const countryProfile = focusedCountry
      ? {
          code: focusedCountry.code,
          name: focusedCountry.name,
          baseScore: focusedCountry.baseScore ?? focusedCountry.score,
          currentScore: focusedCountry.score,
          aiAdjustment: focusedSignal?.aiAdjustment ?? 0,
          coup: Boolean(focusedCountry.coup),
          region: focusedCountry.region,
          gdp: focusedCountry.gdp || "N/A",
          risk: focusedCountry.risk || "N/A",
          // Detail fields
          president: det.president || "N/A",
          capital: det.capital || "N/A",
          eco_center: det.eco_center || det.capital || "N/A",
          pop: det.pop || "N/A",
          currency: det.currency || "N/A",
          zone: det.zone || focusedCountry.region || "N/A",
          // Sub-indices
          politique: idx.politique ?? 50,
          economie: idx.economie ?? 50,
          infra: idx.infra ?? 50,
          juridique: idx.juridique ?? 50,
          humain: idx.humain ?? 50,
          integration: idx.integration ?? 50,
          // Micro-indices
          micro: idx.micro || null,
          // Macro
          growth: focusedCountry.liveGrowth != null ? focusedCountry.liveGrowth + "%" : (det.growth || "N/A"),
          inflation: focusedCountry.liveInflation != null ? focusedCountry.liveInflation + "%" : (det.inflation || "N/A"),
          debt_gdp: focusedCountry.liveDebt != null ? focusedCountry.liveDebt + "% PIB" : (det.dette_pib || "N/A"),
          gdp_year: focusedCountry.liveGdpYear || "2024",
          resources: (det.resources || []).join(", ") || "N/A",
          exports: (det.exports || []).join(", ") || "N/A",
          dataSource: state.worldBankLoaded ? "World Bank 2024 (live)" : "WASI base",
        }
      : null;

    // Pass history WITHOUT the current message — callClaude appends it itself
    const historySnapshot = window.chatHistory.slice(-10);

    try {
      const data = await callClaude(message, historySnapshot, countryProfile);

      if (typing) {
        typing.classList.remove("show");
      }

      const reply = data.reply || "Réponse indisponible.";
      appendRichBotMessage(reply, data.citations || [], data.countrySignal || focusedSignal);
      window.chatHistory.push({ role: "user", content: message });
      window.chatHistory.push({ role: "assistant", content: reply });
      saveChatHistory();
    } catch (error) {
      if (typing) typing.classList.remove("show");

      // Detect proxy cold-start (Render free tier sleeps after 15 min inactivity)
      const isColdStart = error.message === "proxy_sleep" || error.name === "AbortError";
      const isNoToken   = error.message === "no_key";

      // Fallback to local AI engine — always available, no token required
      let localReply;
      try {
        if (typeof window.generateLocalResponse === "function") {
          localReply = window.generateLocalResponse(message, window.currentCountry || "");
          if (isColdStart) {
            localReply += "\n\n⚡ Note : Le serveur IA redémarre (Render free tier). Relancez votre question dans 30 secondes pour la réponse enrichie.";
          } else if (isNoToken) {
            localReply += "\n\n🔑 Mode local actif — entrez un token WASI (?wasi_token=...) pour activer l'IA Claude complète.";
          }
        } else {
          localReply = "WASI Intelligence — moteur local non disponible.";
        }
      } catch(e2) {
        localReply = "WASI Intelligence — erreur inattendue. Reformulez votre question.";
      }
      try { appendRichBotMessage(localReply, [], focusedSignal); } catch(e3) {
        if (typeof window.appendChatMsg === "function") window.appendChatMsg(localReply, "bot");
      }
      try {
        window.chatHistory.push({ role: "user", content: message });
        window.chatHistory.push({ role: "assistant", content: localReply });
        saveChatHistory();
      } catch(_) {}
    } finally {
      state.chatBusy = false;
      if (typeof window.scrollChat === "function") {
        window.scrollChat();
      }
    }
  }

  function patchFunctions() {
    if (state.patched) {
      return;
    }

    const originalInitApp = window.initApp;
    window.initApp = function patchedInitApp() {
      if (typeof originalInitApp === "function") {
        originalInitApp();
      }
      bootWasiAi();
    };

    const originalDesktopDetail = window.renderDesktopCountryDetail;
    window.renderDesktopCountryDetail = function patchedDesktopDetail(code) {
      if (typeof originalDesktopDetail === "function") {
        originalDesktopDetail(code);
      }
      decorateDesktopCountryDetail(code);
    };

    const originalMobileDetail = window.showMobileCountryDetail;
    window.showMobileCountryDetail = function patchedMobileDetail(code) {
      if (typeof originalMobileDetail === "function") {
        originalMobileDetail(code);
      }
      decorateMobileCountryDetail(code);
    };

    window.sendChat = sendChatWithWasiAi;
    state.patched = true;
  }

  function bootWasiAi() {
    installHeaderUi();
    upgradeWelcomeCopy();

    if (!state.booted) {
      state.booted = true;
      loadSourceStatus();
      loadCountrySignals();
      // Restore chat history after a tick so the DOM is ready
      setTimeout(loadChatHistory, 200);
      return;
    }

    buildCompositeCard();
    if (window.currentCountry) {
      decorateDesktopCountryDetail(window.currentCountry);
      decorateMobileCountryDetail(window.currentCountry);
    }
  }

  patchFunctions();

  if (document.getElementById("app")?.style.display !== "none") {
    bootWasiAi();
  }
})();
