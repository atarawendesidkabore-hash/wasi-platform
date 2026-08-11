(function () {
  // ── Claude AI config ──────────────────────────────────────────────────────
  // Preferred path: WASI proxy (backend/server.js on Render) — users only need
  // their WASI access token, the Anthropic key stays server-side.
  // Fallback path: direct Anthropic API with a user-supplied key (BYOK).
  const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
  const CLAUDE_MODEL  = "claude-sonnet-4-6";

  function getProxyUrl() {
    if (typeof window.WASI_PROXY_URL === "string") return window.WASI_PROXY_URL.replace(/\/$/, "");
    try { return (localStorage.getItem("wasi_proxy_url") || "").replace(/\/$/, ""); } catch (_) { return ""; }
  }
  function setProxyUrl(url) {
    try {
      if (url) localStorage.setItem("wasi_proxy_url", url.trim());
      else localStorage.removeItem("wasi_proxy_url");
    } catch (_) {}
    window.WASI_PROXY_URL = url ? url.trim() : "";
  }
  window.wasiSetProxyUrl = setProxyUrl;
  window.wasiGetProxyUrl = getProxyUrl;

  // ── Anthropic API key management ─────────────────────────────────────────
  // Key is stored in localStorage under 'wasi_claude_key'.
  // Set it once via the Admin panel → it persists across sessions.
  function getClaudeKey() {
    if (window.WASI_CLAUDE_KEY) return window.WASI_CLAUDE_KEY;
    try { return localStorage.getItem("wasi_claude_key") || ""; } catch (_) { return ""; }
  }
  function setClaudeKey(key) {
    try {
      if (key) localStorage.setItem("wasi_claude_key", key.trim());
      else localStorage.removeItem("wasi_claude_key");
    } catch (_) {}
    window.WASI_CLAUDE_KEY = key ? key.trim() : "";
  }
  window.wasiSetClaudeKey = setClaudeKey;
  window.wasiGetClaudeKey = getClaudeKey;

  const state = {
    booted: false,
    source: null,
    signals: new Map(),
    loadingSignals: false,
    chatBusy: false,
    patched: false,
  };

  // ── WASI Access Token management ─────────────────────────────────────────
  // The WASI access token is the gate credential (e.g. "WASI-DEMO-2026").
  // It controls access to the platform — separate from the Anthropic API key.
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
    // No proxy — validate locally: any non-empty token opens the app.
    // To restrict access, set WASI_VALID_TOKENS = ["token1","token2"] before this script loads.
    if (!token) return false;
    if (Array.isArray(window.WASI_VALID_TOKENS)) {
      return window.WASI_VALID_TOKENS.includes(token.trim());
    }
    return token.trim().length > 0;
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

  // ── Claude API call — proxy first, direct BYOK fallback ──────────────────
  async function callClaude(userMessage, history, countryProfile) {
    const proxyUrl = getProxyUrl();
    const apiKey   = getClaudeKey();
    if (!proxyUrl && !apiKey) throw new Error("no_key"); // → local AI fallback

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
      "2. RÉPONDS DIRECTEMENT à la question posée — ne commence pas par reformuler la question ni par une introduction générique sur le pays. Va droit au but.\n" +
      "3. Pour toute question d'investissement sur un pays : donne d'abord le VERDICT (FAVORABLE ✅ / PRUDENCE ⚠️ / ÉVITER ❌), puis les 3 secteurs porteurs chiffrés, les 2 risques majeurs, et le WACC. Ne fais pas de profil générique.\n" +
      "4. Format : concis, structuré avec bullet points, chiffres précis. Maximum 300 mots par réponse. Évite les longs paragraphes narratifs.\n" +
      "5. Pour des comparaisons de pays : compare les scores WASI, PIB, croissance et WACC côte à côte en tableau ou liste structurée.\n" +
      "6. Pour les corridors commerciaux : cite les pays, les produits échangés, les volumes et les devises concernées.\n" +
      "7. Réponds TOUJOURS en français. Style : expert en intelligence économique — direct, chiffré, actionnable.\n" +
      "8. Si une donnée n'est pas dans ce prompt, dis-le en une phrase et continue avec ce que tu sais.\n" +
      "9. Ne remplace pas un avis juridique ou financier formel.\n" +
      "10. CONVERSATIONNEL : si l'utilisateur pose une question courte ou de suivi, réponds de façon courte et directe — pas besoin de tout répéter.";

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

    // ── 1. Preferred: WASI proxy (Anthropic key stays server-side) ────────
    if (proxyUrl) {
      try {
        const _pctrl = new AbortController();
        const _ptid  = setTimeout(function(){ _pctrl.abort(); }, 35000);
        const presp = await fetch(proxyUrl + "/api/chat", {
          method: "POST",
          signal: _pctrl.signal,
          headers: {
            "Content-Type": "application/json",
            "x-wasi-token": getWasiToken() || "WASI-DEMO-2026",
          },
          body: JSON.stringify({ messages: messages, system: systemPrompt, max_tokens: 1800 }),
        });
        clearTimeout(_ptid);
        if (presp.ok) {
          const pdata = await presp.json();
          if (pdata.reply) {
            return { reply: pdata.reply, citations: [], countrySignal: null, source: { aiEnabled: true } };
          }
        } else if (presp.status === 401) {
          throw new Error("Token WASI invalide — vérifiez votre code d'accès.");
        } else if (presp.status === 429) {
          throw new Error("Limite de requêtes atteinte. Attendez 1 minute.");
        }
        // Other proxy errors → fall through to direct API if a key exists
        if (!apiKey) {
          const perr = await presp.json().catch(function(){ return {}; });
          throw new Error(perr.error || ("Erreur proxy WASI " + presp.status));
        }
      } catch (proxyErr) {
        // Proxy unreachable or errored: only continue if BYOK fallback exists
        if (!apiKey) throw proxyErr;
      }
    }

    // ── 2. Fallback: direct Anthropic API with user-supplied key (BYOK) ───
    if (!apiKey) throw new Error("no_key");
    const _ctrl = new AbortController();
    const _tid  = setTimeout(function(){ _ctrl.abort(); }, 30000);
    const resp = await fetch(ANTHROPIC_URL, {
      method: "POST",
      signal: _ctrl.signal,
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model:      CLAUDE_MODEL,
        max_tokens: 1800,
        system:     systemPrompt,
        messages:   messages,
      }),
    });
    clearTimeout(_tid);

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      if (resp.status === 401) {
        throw new Error("Clé API Claude invalide. Vérifiez-la dans Admin → Clé API.");
      }
      if (resp.status === 429) throw new Error("Limite de requêtes Anthropic atteinte. Attendez 1 minute.");
      throw new Error(err?.error?.message || `Erreur API Claude ${resp.status}`);
    }

    const data = await resp.json();
    const reply = (data.content || [])
      .filter(function(b){ return b.type === "text"; })
      .map(function(b){ return b.text; })
      .join("\n").trim() || "Je n'ai pas pu produire une réponse exploitable.";
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


  // ── Markdown → HTML renderer for chat bubbles ────────────────────────────
  function renderMarkdownToHtml(raw) {
    const text = String(raw || "")
      .replace(/\s*\[(?:country|doc)-[^\]]+\]/g, "") // strip internal markers
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    // Inline formatter: escape HTML first, then apply markdown patterns
    function inline(s) {
      let h = s
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      // Bold
      h = h.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
           .replace(/__(.+?)__/g, "<strong>$1</strong>");
      // Italic
      h = h.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
      // Inline code
      h = h.replace(/`([^`]+)`/g, '<code style="background:rgba(200,146,42,.13);padding:1px 5px;border-radius:3px;font-size:.82em;font-family:monospace;">$1</code>');
      // VERDICT keywords
      h = h.replace(/\b(FAVORABLE|PRUDENCE|ÉVITER|EVITER)\b/g, function(m) {
        const color = m === "FAVORABLE" ? "#3fb950" : m === "PRUDENCE" ? "#f0c14b" : "#f85149";
        return '<strong style="color:' + color + ';">' + m + '</strong>';
      });
      return h;
    }

    const lines  = text.split("\n");
    const out    = [];
    let inList   = false;

    for (let i = 0; i < lines.length; i++) {
      const line    = lines[i];
      const trimmed = line.trim();

      // Horizontal rule ---
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        if (inList) { out.push("</ul>"); inList = false; }
        out.push('<hr style="border:none;border-top:1px solid rgba(255,255,255,.09);margin:8px 0;">');
        continue;
      }

      // Headers ## / ###
      const hm = trimmed.match(/^(#{1,3})\s+(.+)/);
      if (hm) {
        if (inList) { out.push("</ul>"); inList = false; }
        const sz = hm[1].length === 1 ? ".87rem" : hm[1].length === 2 ? ".82rem" : ".79rem";
        out.push('<div style="font-weight:700;font-size:' + sz + ';color:var(--text-primary);margin:10px 0 3px;">' + inline(hm[2]) + '</div>');
        continue;
      }

      // Bullet: - / • / *
      const bm = trimmed.match(/^[-•*]\s+(.+)/);
      if (bm) {
        if (!inList) { out.push('<ul style="margin:4px 0;padding:0;list-style:none;">'); inList = true; }
        out.push('<li style="display:flex;gap:6px;margin:2px 0;"><span style="color:var(--gold);flex-shrink:0;">▸</span><span>' + inline(bm[1]) + '</span></li>');
        continue;
      }

      // Close list on non-bullet content
      if (inList && trimmed !== "") { out.push("</ul>"); inList = false; }

      // Empty line
      if (trimmed === "") {
        if (inList) { out.push("</ul>"); inList = false; }
        out.push('<div style="height:5px;"></div>');
        continue;
      }

      // Regular line
      out.push('<div style="line-height:1.58;">' + inline(trimmed) + '</div>');
    }

    if (inList) out.push("</ul>");
    return out.join("");
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
    if (!host || !Array.isArray(window.COUNTRIES)) {
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
        ${adjustmentBreakdownHtml(signal)}
        ${legalNewsHtml(signal)}
        <div class="wasi-ai-tags">
          ${(signal.frameworks || []).map((item) => `<span class="wasi-ai-tag">${escapeHtml(item)}</span>`).join("")}
          <span class="wasi-ai-tag">Couverture: ${escapeHtml(signal.coverageLabel)}</span>
        </div>
        ${sourceListHtml(signal)}
      </div>
    `;
  }

  /* Shows what the ±adjustment is actually made of, so a score movement can
     always be traced to a component rather than appearing as a black box. */
  function adjustmentBreakdownHtml(signal) {
    const row = function (label, value, note) {
      const col = value > 0 ? "var(--green)" : value < 0 ? "var(--red)" : "var(--text-dim)";
      return '<div style="display:flex;justify-content:space-between;gap:8px;font-size:.7rem;padding:2px 0;">' +
        '<span style="color:var(--text-dim);">' + label + (note ? ' <span style="opacity:.7;">' + note + '</span>' : '') + '</span>' +
        '<span style="font-family:var(--font-mono);color:' + col + ';">' + (value >= 0 ? "+" : "") + value + '</span></div>';
    };
    const classLabel = { tres_concentre: "très concentré", concentre: "concentré", diversifie: "diversifié" };
    const exportNote = signal.exportHhi != null
      ? '±3 · HHI ' + signal.exportHhi + (signal.exportClass ? ' ' + (classLabel[signal.exportClass] || "") : "")
      : '±3 · données absentes';

    return '<div style="margin:8px 0;padding:8px 10px;background:rgba(0,0,0,.18);border-radius:6px;">' +
      '<div style="font-size:.62rem;letter-spacing:1px;text-transform:uppercase;color:var(--text-dim);margin-bottom:4px;">Décomposition de l\'ajustement</div>' +
      row('Macro (Banque mondiale)', signal.macroAdj || 0, '±5') +
      row('Stabilité institutionnelle', signal.stabilityAdj || 0) +
      row('Veille législative', signal.legalAdj || 0, '±2') +
      row('Diversification export', signal.exportAdj || 0, exportNote) +
      (signal.exportLead
        ? '<div style="font-size:.62rem;color:var(--text-dim);margin-top:3px;">Premier poste&nbsp;: ' +
          escapeHtml(signal.exportLead.name) + ' — ' + signal.exportTop1 + '% des exports' +
          (signal.afexCode ? ' · indice ' + escapeHtml(signal.afexCode) : '') + '</div>'
        : '') +
      '</div>';
  }

  /* The headlines behind the legislative adjustment. Without these the ±2 is
     an assertion; with them the user can check it. */
  function legalNewsHtml(signal) {
    const items = signal.legalEvidence || [];
    if (!items.length) return "";
    const adj = signal.legalAdj || 0;
    const badge = adj > 0
      ? '<span style="color:var(--green);">+' + adj + '</span>'
      : adj < 0 ? '<span style="color:var(--red);">' + adj + '</span>'
      : '<span style="color:var(--text-dim);">0 · non corroboré</span>';

    return '<div style="margin:8px 0;padding:8px 10px;background:rgba(0,0,0,.18);border-radius:6px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px;">' +
        '<span style="font-size:.62rem;letter-spacing:1px;text-transform:uppercase;color:var(--text-dim);">Veille législative</span>' +
        '<span style="font-family:var(--font-mono);font-size:.7rem;">' + badge + '</span>' +
      '</div>' +
      items.slice(0, 4).map(function (it) {
        const col = it.polarity === "positive" ? "var(--green)" : "var(--red)";
        const dot = it.polarity === "positive" ? "▲" : "▼";
        return '<div style="font-size:.68rem;line-height:1.45;margin-bottom:4px;">' +
          '<span style="color:' + col + ';">' + dot + '</span> ' +
          (it.url ? '<a href="' + escapeHtml(it.url) + '" target="_blank" rel="noopener" style="color:var(--text-secondary);">' + escapeHtml(it.title) + '</a>'
                  : '<span style="color:var(--text-secondary);">' + escapeHtml(it.title) + '</span>') +
          '<span style="color:var(--text-dim);"> · ' + escapeHtml(it.source || "") + ' · ' + escapeHtml(it.date || "") + '</span>' +
          '</div>';
      }).join("") +
      '<div style="font-size:.6rem;color:var(--text-dim);margin-top:4px;">Classement par mots-clés (lexicon v1) · deux titres concordants minimum · voir M&eacute;thodologie</div>' +
      '</div>';
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
    wrapper.innerHTML =
      '<div class="chat-msg-body">' + renderMarkdownToHtml(text) + '</div>' +
      buildChatSignalMeta(signal) +
      citationsHtml(citations);
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

  // ── Export concentration (AFEX) ──────────────────────────────────────────
  // data/afex-profiles.json is the same file the DEX reads, so the two
  // surfaces cannot disagree about a country's export basket.
  async function loadAfexProfiles() {
    try {
      const base = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, "");
      const res = await fetch(base + "/data/afex-profiles.json?v=" + Date.now());
      if (!res.ok) return null;
      return await res.json();
    } catch (_) {
      return null;
    }
  }

  /**
   * HHI → score points, calibrated on the observed African distribution
   * (n=47: min 764, p25 1145, median 2226, p75 4629, max 9243) rather than
   * antitrust thresholds. Absolute thresholds would mark nearly every
   * African basket "highly concentrated" and simply subtract points from the
   * whole continent; this measures diversification RELATIVE TO PEERS, which
   * is what an investor comparing African markets actually wants.
   */
  function computeExportAdj(hhi) {
    if (typeof hhi !== "number" || !isFinite(hhi)) return 0;
    if (hhi < 1000) return 3;
    if (hhi < 1600) return 2;
    if (hhi < 2400) return 1;
    if (hhi < 3600) return 0;
    if (hhi < 5500) return -1;
    if (hhi < 7500) return -2;
    return -3;
  }

  /**
   * Joins AFEX profiles (keyed by fund code, carrying iso3) onto COUNTRIES
   * (keyed by iso2). The iso3 → iso2 map is derived from the World Bank
   * payload, which already pairs both codes, so no separate lookup table can
   * drift. Returns a diagnostic so a broken join is loud, not silent.
   */
  function mergeAfexExport(afex, wb) {
    if (!afex || !afex.countries || !Array.isArray(window.COUNTRIES)) return null;

    const iso3ToIso2 = {};
    if (wb && wb.countries) {
      Object.keys(wb.countries).forEach(function (iso2) {
        const iso3 = wb.countries[iso2] && wb.countries[iso2].iso3;
        if (iso3) iso3ToIso2[iso3] = iso2;
      });
    }

    const byIso2 = {};
    window.COUNTRIES.forEach(function (c) { byIso2[c.code] = c; });

    const matched = [];
    const unmatched = [];

    Object.keys(afex.countries).forEach(function (fundCode) {
      const p = afex.countries[fundCode];
      const iso2 = iso3ToIso2[p.iso3];
      const country = iso2 ? byIso2[iso2] : null;
      if (!country) { unmatched.push(fundCode + "/" + p.iso3); return; }

      const hhi = p.concentration ? p.concentration.hhi : null;
      country.afexCode = fundCode;
      country.exportHhi = hhi;
      country.exportTop1 = p.concentration ? p.concentration.top1_pct : null;
      country.exportClass = p.concentration ? p.concentration.classification : null;
      country.exportLead = p.constituents && p.constituents[0] ? p.constituents[0] : null;
      country.exportYears = p.years_count;
      country.exportAdj = computeExportAdj(hhi);
      matched.push(iso2);
    });

    state.afexLoaded = true;
    state.afexMatched = matched.length;
    state.afexUnmatched = unmatched;
    if (unmatched.length) {
      // Loud on purpose: a silent join failure would quietly zero a score
      // component for those countries.
      console.warn("AFEX join: no COUNTRIES entry for " + unmatched.join(", "));
    }
    return { matched: matched.length, unmatched: unmatched };
  }

  // ── Cartographie des risques ─────────────────────────────────────────────
  // 20 countries carry an expert-written risk matrix; the other 33 rendered
  // "Données de risques en cours de mise à jour". Rather than invent matrices
  // for them, each risk below is DERIVED from an indicator we already hold
  // (World Bank macros, AFEX export concentration, the legislative watch,
  // the coup flag, currency regime), and carries the figure that triggered
  // it. Probability and impact are on the platform's existing 1–5 scale.
  //
  // Because it is derived, it refreshes with the data every day.

  function num(v) {
    if (typeof v === "number") return v;
    if (typeof v !== "string") return null;
    const m = v.replace(",", ".").match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  }

  // XOF and XAF are pegged to the euro; that materially lowers FX risk.
  const PEGGED = /XOF|XAF|Franc CFA/i;

  function deriveRiskCartography(country) {
    const d = (window.COUNTRY_DETAILS || {})[country.code] || {};
    const out = [];
    const add = function (nom, cat, prob, impact, source) {
      out.push({ nom: nom, cat: cat, prob: prob, impact: impact, source: source, derived: true });
    };

    // ── Macro: inflation ──────────────────────────────────────────────────
    const infl = country.liveInflation != null ? country.liveInflation : num(d.inflation);
    if (infl != null) {
      if (infl >= 30)      add("Inflation hors de contrôle (" + infl + "%)", "Macro", 5, 4, "Banque mondiale");
      else if (infl >= 15) add("Inflation élevée (" + infl + "%)", "Macro", 4, 3, "Banque mondiale");
      else if (infl >= 10) add("Pression inflationniste (" + infl + "%)", "Macro", 3, 3, "Banque mondiale");
    }

    // ── Macro: sovereign debt ─────────────────────────────────────────────
    const debt = country.liveDebt != null ? country.liveDebt : num(d.dette_pib);
    if (debt != null) {
      if (debt >= 90)      add("Dette souveraine critique (" + debt + "% PIB)", "Macro", 4, 5, "Banque mondiale");
      else if (debt >= 70) add("Dette souveraine élevée (" + debt + "% PIB)", "Macro", 3, 4, "Banque mondiale");
      else if (debt >= 55) add("Dette à surveiller (" + debt + "% PIB)", "Macro", 2, 3, "Banque mondiale");
    }

    // ── Macro: contraction ────────────────────────────────────────────────
    const growth = country.liveGrowth != null ? country.liveGrowth : num(d.growth);
    if (growth != null) {
      if (growth < 0)      add("Récession (croissance " + growth + "%)", "Macro", 4, 4, "Banque mondiale");
      else if (growth < 2) add("Croissance atone (" + growth + "%)", "Macro", 3, 3, "Banque mondiale");
    }

    // ── Macro: currency regime ────────────────────────────────────────────
    const cur = d.currency || "";
    if (!PEGGED.test(cur)) {
      const fxProb = infl != null && infl >= 15 ? 4 : infl != null && infl >= 8 ? 3 : 2;
      add("Risque de change — devise flottante" + (cur ? " (" + cur.replace(/\s*\([^)]*\)/, "") + ")" : ""),
          "Macro", fxProb, 4, "Régime monétaire");
    }

    // ── Marché: export concentration (AFEX) ───────────────────────────────
    if (typeof country.exportHhi === "number") {
      const lead = country.exportLead ? country.exportLead.name : "un seul poste";
      const top1 = country.exportTop1;
      if (country.exportHhi >= 7500) {
        add("Mono-exportateur : " + lead + " = " + top1 + "% des exports", "Marché", 5, 5, "UN Comtrade (HHI " + country.exportHhi + ")");
        add("Choc de prix sur " + lead, "Marché", 4, 5, "UN Comtrade");
      } else if (country.exportHhi >= 5500) {
        add("Panier d'exportation très concentré (" + lead + " " + top1 + "%)", "Marché", 4, 4, "UN Comtrade (HHI " + country.exportHhi + ")");
      } else if (country.exportHhi >= 3600) {
        add("Concentration des exportations (" + lead + " " + top1 + "%)", "Marché", 3, 4, "UN Comtrade (HHI " + country.exportHhi + ")");
      } else if (country.exportHhi >= 2400) {
        add("Concentration modérée (" + lead + " " + top1 + "%)", "Marché", 3, 3, "UN Comtrade (HHI " + country.exportHhi + ")");
      } else {
        // Even a diversified basket carries world-price exposure: no African
        // exporter is insulated. Stated at low severity so the matrix is
        // never empty for a well-performing country.
        add("Exposition aux cours mondiaux (premier poste : " + lead + " " + top1 + "%)",
            "Marché", 2, 3, "UN Comtrade (HHI " + country.exportHhi + " — diversifié)");
      }
    } else {
      add("Statistiques douanières non déclarées à l'ONU", "Conformité", 3, 3, "UN Comtrade — pays non déclarant");
    }

    // ── Politique: constitutional order ───────────────────────────────────
    if (country.coup) {
      add("Régime de transition non constitutionnel", "Politique", 5, 4, "Statut institutionnel WASI");
      add("Risque de sanctions ou suspension d'aide", "Politique", 3, 4, "Statut institutionnel WASI");
    }

    // ── Conformité: legislative watch ─────────────────────────────────────
    if (typeof country.legalAdj === "number" && country.legalAdj < 0) {
      const ev = (country.legalEvidence || []).find(function (e) { return e.polarity === "negative"; });
      add("Environnement réglementaire dégradé" + (ev ? " — " + ev.title.slice(0, 60) : ""),
          "Conformité", country.legalAdj <= -2 ? 4 : 3, 3, "Veille législative du jour");
    }

    // ── Conformité: accounting framework ──────────────────────────────────
    const zone = (d.zone || "").toUpperCase();
    const isOhada = /UEMOA|CEMAC|OHADA/.test(zone);
    if (!isOhada) {
      add("Cadre comptable hors OHADA — due diligence locale requise", "Conformité", 3, 2, "Zone " + (zone || "UA"));
    }

    // ── Sécurité: institutional weakness proxy ────────────────────────────
    const pol = (d.indices || {}).politique;
    if (typeof pol === "number" && pol <= 30 && !country.coup) {
      add("Fragilité institutionnelle (indice politique " + pol + "/100)", "Sécurité", 3, 4, "Indice WASI");
    }

    return out;
  }

  /** Ensures every country has a risk cartography, expert or derived. */
  function applyRiskCartography() {
    if (!Array.isArray(window.COUNTRIES)) return null;
    window.COUNTRY_RISKS = window.COUNTRY_RISKS || {};
    let filled = 0, enriched = 0;

    window.COUNTRIES.forEach(function (country) {
      const derived = deriveRiskCartography(country);
      const existing = window.COUNTRY_RISKS[country.code];

      if (existing) {
        // Keep the expert matrix — it holds local knowledge a formula cannot
        // reach ("insécurité Nord-Est", "réforme des subventions") — and add
        // the derived indicator risks alongside it. Re-running must not
        // duplicate, so anything already present by name is skipped.
        const curated = (Array.isArray(existing.curatedRisques) ? existing.curatedRisques
          : Array.isArray(existing.risques) ? existing.risques : []).filter(function (r) { return !r.derived; });
        existing.curatedRisques = curated; // remembered so repeat calls stay idempotent
        const names = curated.map(function (r) { return String(r.nom).toLowerCase().trim(); });
        const additions = derived.filter(function (r) {
          return names.indexOf(String(r.nom).toLowerCase().trim()) === -1;
        });
        existing.risques = curated.concat(additions);
        existing.riskSource = curated.length ? "expert_plus_derive" : "derive";
        enriched++;
      } else {
        // Same credit/WACC fallback logic the app already uses, plus the
        // derived matrix so the panel is never empty.
        const s = country.score || 50;
        window.COUNTRY_RISKS[country.code] = {
          credit: s >= 85 ? "AA" : s >= 75 ? "A" : s >= 65 ? "BBB" : s >= 55 ? "BB" : s >= 45 ? "B" : s >= 35 ? "B-" : s >= 25 ? "CCC" : "CC",
          fxRisk: country.coup ? "Élevé" : s >= 65 ? "Faible" : s >= 45 ? "Modéré" : "Élevé",
          fxNote: PEGGED.test(((window.COUNTRY_DETAILS || {})[country.code] || {}).currency || "") ? "Parité fixe EUR (BCEAO/BEAC)" : "Devise flottante",
          wacc: Math.max(9, Math.min(40, country.coup ? Math.round(28 + (100 - s) * 0.15) : Math.round(9 + (100 - s) * 0.15))),
          waccNote: "Rf 4.5% + CRP estimé",
          risques: derived,
          riskSource: "derive",
          electionYear: null,
        };
        filled++;
      }
    });

    state.riskCartographyFilled = filled;
    state.riskCartographyEnriched = enriched;
    return { filled: filled, enriched: enriched };
  }

  // ── Legislative & regulatory news watch ──────────────────────────────────
  // data/legal-news.json is refreshed daily by CI. Each country carries a
  // bounded legalAdj (−2..+2) derived from law-making and regulatory
  // headlines, plus the headlines themselves as evidence.
  async function loadLegalNews() {
    try {
      const base = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, "");
      const res = await fetch(base + "/data/legal-news.json?v=" + Date.now());
      if (!res.ok) return null;
      return await res.json();
    } catch (_) {
      return null;
    }
  }

  function mergeLegalNews(news) {
    if (!news || !news.countries || !Array.isArray(window.COUNTRIES)) return;
    window.COUNTRIES.forEach(function (country) {
      const n = news.countries[country.code];
      if (!n) return;
      country.legalAdj = typeof n.legalAdj === "number" ? n.legalAdj : 0;
      country.legalEvidence = n.evidence || [];
      country.legalNetSignal = n.net_signal;
    });
    state.legalNewsLoaded = true;
    state.legalNewsFetchedAt = news.generatedAt
      ? new Date(news.generatedAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
      : null;
  }

  // ── Score history loader — drives the ↑ ↓ → trend arrows ─────────────────
  // data/country-history.json is rebuilt by CI from the git history of the
  // weekly World Bank snapshots.
  async function loadScoreHistory() {
    try {
      const base = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, "");
      const res  = await fetch(base + "/data/country-history.json?v=" + Date.now());
      if (!res.ok) return null;
      return await res.json();
    } catch (_) {
      return null;
    }
  }

  function applyHistoryTrends(hist) {
    if (!hist || !hist.countries || !Array.isArray(window.COUNTRIES)) return;
    window.COUNTRIES.forEach(function (country) {
      const series = hist.countries[country.code];
      if (!series || !Array.isArray(series.scoreAdj)) return;
      const vals = series.scoreAdj.filter(function (v) { return v != null; });
      if (vals.length < 2) return;
      const last = vals[vals.length - 1];
      // Compare against the most recent *different* prior value, so long flat
      // stretches don't hide the direction of the last real move.
      let prev = null;
      for (let i = vals.length - 2; i >= 0; i--) {
        if (vals[i] !== last) { prev = vals[i]; break; }
      }
      country.trend = prev == null ? "→" : last > prev ? "↑" : "↓";
      country.scoreAdjHistory = series.scoreAdj;
      country.historyDates = hist.dates;
    });
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
    state.worldBankAgeDays = wb.fetchedAt
      ? Math.floor((Date.now() - new Date(wb.fetchedAt).getTime()) / 86400000)
      : null;
    state.worldBankLoaded = true;
  }

  // Enhanced signal: base score + World Bank macro (±5) + stability
  // + legislative/regulatory news watch (±2) + export diversification (±3)
  function computeLiveSignal(country) {
    const base    = typeof country.baseScore === "number" ? country.baseScore : country.score;
    const macroAdj = typeof country.macroAdj === "number" ? country.macroAdj : 0;
    const stabilityAdj = country.coup ? -4 : base >= 70 ? 2 : base >= 50 ? 1 : 0;
    const legalAdj = typeof country.legalAdj === "number" ? country.legalAdj : 0;
    const exportAdj = typeof country.exportAdj === "number" ? country.exportAdj : 0;
    const totalAdj = macroAdj + stabilityAdj + legalAdj + exportAdj;
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
      legalAdj,
      exportAdj,
      exportHhi: country.exportHhi ?? null,
      exportTop1: country.exportTop1 ?? null,
      exportLead: country.exportLead || null,
      exportClass: country.exportClass || null,
      afexCode: country.afexCode || null,
      legalEvidence: country.legalEvidence || [],
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

      // 1. Fetch every score input in parallel: World Bank macro, score
      //    history, the legislative news watch and the AFEX export profiles
      const [wb, hist, legal, afex] = await Promise.all([
        loadWorldBankData(), loadScoreHistory(), loadLegalNews(), loadAfexProfiles(),
      ]);
      if (wb) {
        mergeWorldBankData(wb);
        updateStatus("Intégration données BM " + (state.worldBankFetchedAt || "") + "...", "loading");
      }
      if (hist) {
        applyHistoryTrends(hist);
      }
      if (legal) {
        mergeLegalNews(legal);
      }
      // Needs wb for the iso3 → iso2 join, so it runs after the merge above.
      if (afex) {
        mergeAfexExport(afex, wb);
      }
      // Runs last: the risk cartography is derived from everything above.
      applyRiskCartography();

      // 2. Compute signals (live if WB loaded, local fallback otherwise)
      const signals = window.COUNTRIES.map((c) =>
        state.worldBankLoaded ? computeLiveSignal(c) : computeLocalSignal(c)
      );
      state.signals = new Map(signals.map((s) => [s.code, s]));
      state.source  = { aiEnabled: true, legalCodes: [], apps: [], sourceAgeHours: 0 };

      applySignalsToCountries();
      state.lastSignalsLoadAt = Date.now();

      const label = state.worldBankLoaded
        ? `WASI AI · Données World Bank ${state.worldBankFetchedAt || "2024"}`
        : "WASI AI · signaux locaux actifs";
      updateStatus(label, "ready");

      // Show data-health badge in topbar: green when fresh, orange when stale
      if (state.worldBankLoaded) {
        const badge = document.getElementById("wb-data-badge");
        if (badge) {
          badge.style.display = "inline-block";
          const stale = state.worldBankAgeDays != null && state.worldBankAgeDays > 10;
          if (stale) {
            badge.textContent = "⚠ BM " + (state.worldBankFetchedAt || "?") + " · données anciennes";
            badge.style.color = "#F39C12";
            badge.style.background = "rgba(243,156,18,.08)";
            badge.style.borderColor = "rgba(243,156,18,.4)";
          } else {
            badge.textContent = "● LIVE · BM " + (state.worldBankFetchedAt || "");
          }
          badge.title = "Données Banque mondiale récupérées le " + (state.worldBankFetchedAt || "?") +
            " · actualisation automatique lundi & jeudi 06:00 UTC · voir Méthodologie";
        }
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

      const isNoKey     = error.message === "no_key";
      const isTimeout   = error.name === "AbortError";
      const isInvalidKey = error.message && error.message.includes("invalide");

      // Fallback to local AI engine — always available, no key required
      let localReply;
      try {
        if (typeof window.generateLocalResponse === "function") {
          localReply = window.generateLocalResponse(message, window.currentCountry || "");
          if (isNoKey) {
            localReply += "\n\n🔑 Mode local actif — configurez votre clé API Claude dans Admin → Clé API pour activer l'IA complète.";
          } else if (isInvalidKey) {
            localReply += "\n\n⚠️ Clé API Claude invalide — vérifiez-la dans Admin → Clé API.";
          } else if (isTimeout) {
            localReply += "\n\n⏱️ Délai dépassé — vérifiez votre connexion et réessayez.";
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
      // A failure inside the app's own init must never block the WASI AI /
      // live-data boot — that would freeze scores on their hardcoded values.
      try {
        if (typeof originalInitApp === "function") {
          originalInitApp();
        }
      } catch (err) {
        console.error("initApp error (continuing with WASI AI boot):", err);
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

  // ── In-session auto-refresh ───────────────────────────────────────────────
  // The data files change on the server twice a week (GitHub Actions), but a
  // long-lived tab would never re-fetch them. Refresh every 6h, and instantly
  // when the user returns to a tab whose data is older than 6h — background
  // tabs throttle timers, so the visibility listener is the reliable path.
  const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

  function isDataStale() {
    return !state.lastSignalsLoadAt || (Date.now() - state.lastSignalsLoadAt) >= REFRESH_INTERVAL_MS;
  }

  function installAutoRefresh() {
    if (state.autoRefreshInstalled) return;
    state.autoRefreshInstalled = true;

    setInterval(function () {
      if (isDataStale()) loadCountrySignals();
    }, 60 * 60 * 1000); // hourly check against the 6h threshold

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible" && isDataStale()) {
        loadCountrySignals();
      }
    });
  }

  function bootWasiAi() {
    installHeaderUi();
    upgradeWelcomeCopy();

    if (!state.booted) {
      state.booted = true;
      loadSourceStatus();
      loadCountrySignals();
      installAutoRefresh();
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
