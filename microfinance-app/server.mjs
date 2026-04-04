import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import express from "express";

import {
  AFRICA_MICROFINANCE_URL,
  buildQuestionContext,
  ingestAfricaMicrofinanceIndex,
  loadAfricaMicrofinanceIndex,
} from "../archives-bf-ai/lib/africa-microfinance-repository.mjs";
import { formatContextChunks } from "../archives-bf-ai/lib/search-utils.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = __dirname;
const knowledgeRoot = path.resolve(projectRoot, "../archives-bf-ai");
const SOURCE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SOURCE_REFRESH_CHECK_MS = 60 * 60 * 1000;
const DEFAULT_INSTITUTION_COUNTRY = "Côte d’Ivoire";
const INTEREST_CEILING_POLICY = [
  { minimumClients: 0, ceiling: 6 },
  { minimumClients: 1000, ceiling: 9 },
  { minimumClients: 3000, ceiling: 12 },
];
const DEFAULT_INTEREST_RATE_CEILING = INTEREST_CEILING_POLICY[0].ceiling;
const MAX_INTEREST_RATE_CEILING = INTEREST_CEILING_POLICY[INTEREST_CEILING_POLICY.length - 1].ceiling;

dotenv.config({ path: path.join(projectRoot, ".env") });
if (!process.env.ANTHROPIC_API_KEY) {
  try {
    const fallbackText = readFileSync(path.join(knowledgeRoot, ".env"), "utf8");
    const fallback = dotenv.parse(fallbackText);
    if (fallback.ANTHROPIC_API_KEY) {
      process.env.ANTHROPIC_API_KEY = fallback.ANTHROPIC_API_KEY;
    }
    if (!process.env.ANTHROPIC_MODEL && fallback.ANTHROPIC_MODEL) {
      process.env.ANTHROPIC_MODEL = fallback.ANTHROPIC_MODEL;
    }
  } catch {
    // Fall through with local configuration only.
  }
}

function toConversationTranscript(history = []) {
  return history
    .slice(-6)
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n");
}

function toAnthropicMessages(history = []) {
  return history
    .slice(-6)
    .filter(
      (message) =>
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim(),
    )
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }));
}

function extractTextContent(message) {
  return (message.content || [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function parseJsonObject(text) {
  const normalized = String(text || "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(normalized);
  } catch {
    const start = normalized.indexOf("{");
    const end = normalized.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(normalized.slice(start, end + 1));
    }
    throw new Error("La réponse IA n'était pas un JSON valide.");
  }
}

function questionLooksOperational(question) {
  return /\b(portfolio|portefeuille|loan|loans|pret|prêt|prets|prêts|credit|crédit|credits|crédits|client|clients|branch|branches|agence|agences|officer|officers|agent|agents|repayment|repayments|remboursement|remboursements|collection|collections|encaissement|encaissements|follow-up|follow up|suivi|outstanding|encours|late|retard|watch|surveillance|arrears|impaye|impayé|impayes|impayés|borrower|emprunteur|emprunteurs)\b/i.test(
    question,
  );
}

function getSourceTimestamp(indexDocument) {
  if (!indexDocument?.ingestedAt) {
    return null;
  }

  const value = Date.parse(indexDocument.ingestedAt);
  return Number.isFinite(value) ? value : null;
}

function getSourceAgeHours(indexDocument) {
  const timestamp = getSourceTimestamp(indexDocument);
  if (!timestamp) {
    return null;
  }

  return Math.max(0, (Date.now() - timestamp) / (60 * 60 * 1000));
}

function sourceIsStale(indexDocument) {
  const timestamp = getSourceTimestamp(indexDocument);
  if (!timestamp) {
    return true;
  }

  return Date.now() - timestamp >= SOURCE_MAX_AGE_MS;
}

function getNextRefreshDueAt(indexDocument) {
  const timestamp = getSourceTimestamp(indexDocument);
  if (!timestamp) {
    return null;
  }

  return new Date(timestamp + SOURCE_MAX_AGE_MS).toISOString();
}

function normalizeDecision(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();

  if (normalized === "APPROVED" || normalized === "BLOCK") {
    return normalized;
  }

  return "REVIEW";
}

function normalizeStringArray(value, limit = 6) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => String(entry || "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

function dedupeById(chunks) {
  const unique = [];
  const seen = new Set();

  for (const chunk of chunks) {
    if (!chunk || seen.has(chunk.id)) {
      continue;
    }

    seen.add(chunk.id);
    unique.push(chunk);
  }

  return unique;
}

function buildMatchedCountrySummary(matchedCountries) {
  return (
    matchedCountries
      .map(
        (country) =>
          `- ${country.shortName} | région : ${country.region} | UMOA : ${country.isUmoaMember ? "oui" : "non"} | couverture : ${country.coverageLevel}`,
      )
      .join("\n") || "Aucun pays n'a été identifié explicitement."
  );
}

function buildMatchedDocumentSummary(matchedDocuments) {
  return (
    matchedDocuments
      .map((document) => `- ${document.title} | autorité : ${document.authority} | type : ${document.documentType}`)
      .join("\n") || "Aucun document officiel n'a été identifié explicitement."
  );
}

function translateKeySourceLabel(label) {
  switch (label) {
    case "African Union member states":
      return "États membres de l'Union africaine";
    case "Burkina Faso Ministry of Finance":
      return "Ministère des finances du Burkina Faso";
    case "BCEAO UMOA member states":
      return "États membres UMOA de la BCEAO";
    case "BCEAO SFD regulation":
      return "Réglementation BCEAO des SFD";
    default:
      return label;
  }
}

function describeInterestCeilingPolicy() {
  return "6% au départ, 9% dès 1 000 clients, puis 12% dès 3 000 clients. Tout palier atteint reste acquis pour la suite.";
}

function getInterestCeilingForCustomerCount(customerCount) {
  const safeCustomerCount = Number.isFinite(Number(customerCount)) ? Number(customerCount) : 0;

  return INTEREST_CEILING_POLICY.reduce(
    (selectedStage, stage) => (safeCustomerCount >= stage.minimumClients ? stage : selectedStage),
    INTEREST_CEILING_POLICY[0],
  ).ceiling;
}

function resolveInternalInterestRateCeiling(operationData = {}) {
  const explicitCeiling = Number(operationData.policyInterestCeiling);
  if (Number.isFinite(explicitCeiling)) {
    return Math.min(MAX_INTEREST_RATE_CEILING, Math.max(DEFAULT_INTEREST_RATE_CEILING, explicitCeiling));
  }

  const customerCount = Number(operationData.policyCustomerCount);
  if (Number.isFinite(customerCount)) {
    return getInterestCeilingForCustomerCount(customerCount);
  }

  return DEFAULT_INTEREST_RATE_CEILING;
}

function localComplianceGate(operationType, operationData) {
  if (operationType === "repayment") {
    const amount = Number(operationData.amount);
    const outstanding = Number(operationData.loanOutstandingBeforePayment);

    if (!Number.isFinite(amount) || amount <= 0) {
      return {
        decision: "BLOCK",
        summary: "Le remboursement a été bloqué car le montant est absent ou invalide dans l'enregistrement local CIREX.",
        risks: ["Le montant du remboursement n'est pas une valeur positive valide."],
        requiredActions: ["Saisissez un montant de remboursement valide avant de relancer l'opération."],
        scopeNote: "Ce blocage provient d'un contrôle de cohérence local avant l'analyse juridique.",
        citations: [],
      };
    }

    if (Number.isFinite(outstanding) && amount > outstanding) {
      return {
        decision: "BLOCK",
        summary: "Le remboursement a été bloqué car il dépasse l'encours restant dans CIREX.",
        risks: ["Le montant du remboursement est supérieur au solde restant du crédit."],
        requiredActions: [
          "Vérifiez le solde du crédit dans CIREX.",
          "Réduisez le montant ou rapprochez le dossier de crédit avant validation.",
        ],
        scopeNote: "Ce blocage provient d'un contrôle de cohérence local avant l'analyse juridique.",
        citations: [],
      };
    }
  }

  if (operationType === "loan") {
    const principal = Number(operationData.principal);
    const interestRate = Number(operationData.interestRate);
    const termMonths = Number(operationData.termMonths);
    const currentInterestCeiling = resolveInternalInterestRateCeiling(operationData);

    if (!Number.isFinite(principal) || principal <= 0) {
      return {
        decision: "BLOCK",
        summary: "Le crédit a été bloqué car le montant principal est absent ou invalide.",
        risks: ["Le montant proposé n'est pas une valeur positive valide."],
        requiredActions: ["Saisissez un montant principal valide avant de relancer l'opération."],
        scopeNote: "Ce blocage provient d'un contrôle de cohérence local avant l'analyse juridique.",
        citations: [],
      };
    }

    if (!Number.isFinite(interestRate) || interestRate < 0 || !Number.isFinite(termMonths) || termMonths <= 0) {
      return {
        decision: "BLOCK",
        summary: "Le crédit a été bloqué car les données de taux ou de durée sont incomplètes ou invalides.",
        risks: ["Le taux d'intérêt ou la durée du crédit est absent ou hors plage valide."],
        requiredActions: ["Revoyez le taux d'intérêt et la durée avant de relancer l'opération."],
        scopeNote: "Ce blocage provient d'un contrôle de cohérence local avant l'analyse juridique.",
        citations: [],
      };
    }

    if (interestRate > currentInterestCeiling) {
      return {
        decision: "BLOCK",
        summary: `Le crédit a été bloqué car le taux proposé dépasse le plafond interne CIREX actuellement fixé à ${currentInterestCeiling}%.`,
        risks: [
          `Le taux d'intérêt proposé (${interestRate}%) dépasse la politique interne de tarification.`,
          `Avec ${Number.isFinite(Number(operationData.policyCustomerCount)) ? Number(operationData.policyCustomerCount) : 0} clients retenus, le palier interne applicable reste ${currentInterestCeiling}%.`,
          "L'opération serait incohérente avec la règle maison appliquée aux nouveaux crédits.",
        ],
        requiredActions: [
          `Ramenez le taux à ${currentInterestCeiling}% ou moins avant de relancer l'opération.`,
          "Conservez une trace de la décision tarifaire dans le dossier de crédit.",
        ],
        scopeNote: `Règle interne CIREX : ${describeInterestCeilingPolicy()} Plafond applicable au dossier actuel : ${currentInterestCeiling}%.`,
        citations: [],
      };
    }
  }

  return null;
}

let sourceIndex = null;
let sourceIndexError = null;

try {
  sourceIndex = await loadAfricaMicrofinanceIndex(knowledgeRoot);
} catch (error) {
  sourceIndexError = error;
}

const sourceRefreshState = {
  inProgress: false,
  lastRefreshStartedAt: null,
  lastRefreshCompletedAt: sourceIndex?.ingestedAt || null,
  lastRefreshReason: sourceIndex ? "startup-load" : null,
  lastRefreshError: sourceIndexError ? sourceIndexError.message : null,
};

let refreshPromise = null;

async function refreshSourceIndex({ force = false, reason = "manual" } = {}) {
  if (refreshPromise) {
    return refreshPromise;
  }

  const needsRefresh = force || !sourceIndex || sourceIsStale(sourceIndex);
  if (!needsRefresh) {
    return { refreshed: false, sourceIndex };
  }

  sourceRefreshState.inProgress = true;
  sourceRefreshState.lastRefreshStartedAt = new Date().toISOString();
  sourceRefreshState.lastRefreshReason = reason;
  sourceRefreshState.lastRefreshError = null;

  refreshPromise = (async () => {
    try {
      const { document } = await ingestAfricaMicrofinanceIndex(knowledgeRoot);
      sourceIndex = document;
      sourceIndexError = null;
      sourceRefreshState.lastRefreshCompletedAt = document.ingestedAt || new Date().toISOString();
      return { refreshed: true, sourceIndex: document };
    } catch (error) {
      sourceIndexError = error;
      sourceRefreshState.lastRefreshError = error.message;
      throw error;
    } finally {
      sourceRefreshState.inProgress = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

function triggerRefreshIfStale(reason) {
  if (refreshPromise || (sourceIndex && !sourceIsStale(sourceIndex))) {
    return;
  }

  void refreshSourceIndex({
    force: !sourceIndex,
    reason,
  }).catch((error) => {
    console.error(`Source refresh failed (${reason})`, error);
  });
}

async function ensureSourceIndexAvailable(reason) {
  if (sourceIndex) {
    triggerRefreshIfStale(reason);
    return true;
  }

  try {
    await refreshSourceIndex({ force: true, reason });
  } catch {
    // The caller will receive the stored sourceIndexError message below.
  }

  return Boolean(sourceIndex);
}

triggerRefreshIfStale("startup");
const refreshTimer = setInterval(() => {
  triggerRefreshIfStale("interval");
}, SOURCE_REFRESH_CHECK_MS);
refreshTimer.unref?.();

const app = express();
const port = Number(process.env.PORT || 3100);
const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929";
const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

app.use((request, response, next) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }
  next();
});

app.use(express.json({ limit: "1mb" }));
app.use(express.static(projectRoot));

function buildSourcePayload() {
  return {
    title: sourceIndex?.title || "Africa Microfinance AI",
    sourceLabel: "Base réglementaire microfinance Afrique",
    archiveUrl: sourceIndex?.siteUrl || AFRICA_MICROFINANCE_URL,
    capturedAt: sourceIndex?.ingestedAt || sourceRefreshState.lastRefreshCompletedAt || null,
    countryCount: sourceIndex?.countryCount || 0,
    documentCount: sourceIndex?.documentCount || 0,
    keySources: (sourceIndex?.keySources || []).map((item) => ({
      ...item,
      label: translateKeySourceLabel(item.label),
    })),
    aiEnabled: Boolean(anthropic),
    model: anthropic ? model : null,
    sourceReady: Boolean(sourceIndex),
    sourceError: sourceIndexError ? sourceIndexError.message : null,
    sourceAgeHours: getSourceAgeHours(sourceIndex),
    refreshInProgress: sourceRefreshState.inProgress,
    lastRefreshAt: sourceRefreshState.lastRefreshCompletedAt || null,
    lastRefreshStartedAt: sourceRefreshState.lastRefreshStartedAt || null,
    lastRefreshReason: sourceRefreshState.lastRefreshReason || null,
    lastRefreshError: sourceRefreshState.lastRefreshError || null,
    nextRefreshDueAt: getNextRefreshDueAt(sourceIndex),
    refreshRequired: !sourceIndex || sourceIsStale(sourceIndex),
  };
}

app.get("/api/source", async (_request, response) => {
  await ensureSourceIndexAvailable("source-status");
  response.json({
    ...buildSourcePayload(),
    siteUrl: AFRICA_MICROFINANCE_URL,
  });
});

app.post("/api/source/refresh", async (_request, response) => {
  try {
    await refreshSourceIndex({ force: true, reason: "manual-api" });
    response.json({
      ok: true,
      ...buildSourcePayload(),
      siteUrl: AFRICA_MICROFINANCE_URL,
    });
  } catch (error) {
    response.status(500).json({
      ok: false,
      error: error.message,
      ...buildSourcePayload(),
      siteUrl: AFRICA_MICROFINANCE_URL,
    });
  }
});

app.post("/api/ask", async (request, response) => {
  const question = typeof request.body?.question === "string" ? request.body.question.trim() : "";
  const history = Array.isArray(request.body?.history) ? request.body.history : [];
  const portfolioContext =
    typeof request.body?.portfolioContext === "string" ? request.body.portfolioContext.trim() : "";

  if (!question) {
    response.status(400).json({ error: "A question is required." });
    return;
  }

  if (!(await ensureSourceIndexAvailable("chat-request"))) {
    response.status(503).json({
      error:
        sourceIndexError?.message ||
        "La base réglementaire microfinance Afrique n'est pas prête. Reconstruisez d'abord la base dans le projet lié.",
    });
    return;
  }

  const { contextChunks, matchedCountries, matchedDocuments } = await buildQuestionContext(
    knowledgeRoot,
    sourceIndex,
    question,
  );
  const useOfficialContext = !(portfolioContext && questionLooksOperational(question) && matchedCountries.length === 0);
  const promptContextChunks = useOfficialContext ? contextChunks : [];
  const promptMatchedDocuments = useOfficialContext ? matchedDocuments : [];

  if (!anthropic) {
    response.json({
      answer:
        "Ajoutez ANTHROPIC_API_KEY dans le fichier .env de CIREX, ou conservez la clé du projet lié, pour activer les réponses IA. Les passages issus des sources officielles restent affichés ci-dessous.",
      citations: promptContextChunks,
      groundedOnly: true,
      model: null,
      matchedCountries,
      matchedDocuments: promptMatchedDocuments,
    });
    return;
  }

  const instructions = [
    "Tu es le conseiller IA CIREX pour les opérations de microfinance et la recherche réglementaire africaine.",
    "Utilise le contexte officiel fourni pour les questions sur les pays, ministères, la BCEAO, l'UMOA, l'UEMOA et la réglementation microfinance.",
    "Utilise l'instantané local du portefeuille CIREX uniquement pour les questions opérationnelles portant sur le portefeuille en cours.",
    `Pour CIREX, la politique interne de taux est progressive et irréversible : ${describeInterestCeilingPolicy()} Si la question porte sur le taux à appliquer, mentionne le plafond actuellement applicable dans l'instantané fourni.`,
    "Ne présente jamais l'instantané local comme une source officielle.",
    "Si la réponse s'appuie sur des données locales du portefeuille, indique-le clairement.",
    "Si la réponse n'est pas contenue dans le contexte officiel ou dans l'instantané fourni, dis-le clairement.",
    "Réponds toujours en français dans un style net, professionnel et agréable à lire.",
    "Cite les affirmations factuelles issues des sources officielles avec les identifiants de chunks entre crochets, par exemple [country-burkina-faso-profile] ou [doc-bceao-sfd-recueil-2010-p005].",
    "N'invente ni dates, ni dispositions juridiques, ni institutions, ni règles pays au-delà des sources fournies.",
    "N'applique jamais les règles BCEAO ou UEMOA à un pays si le contexte fourni ne montre pas explicitement que ce pays est concerné.",
    "Ne présente pas la réponse comme un avis juridique définitif. Fais une synthèse fidèle.",
  ].join(" ");

  const sourcePrompt = [
    "Contexte officiel :",
    formatContextChunks(promptContextChunks) || "Aucun contexte officiel n'était nécessaire pour cette question.",
    "",
    "Pays repérés :",
    buildMatchedCountrySummary(matchedCountries),
    "",
    "Documents officiels repérés :",
    buildMatchedDocumentSummary(promptMatchedDocuments),
    "",
    "Instantané local du portefeuille CIREX :",
    portfolioContext || "Aucun instantané de portefeuille n'a été fourni.",
    "",
    "Conversation récente :",
    toConversationTranscript(history) || "Aucun échange préalable.",
    "",
    `Question utilisateur : ${question}`,
  ].join("\n");

  const messages = [
    ...toAnthropicMessages(history),
    {
      role: "user",
      content: sourcePrompt,
    },
  ];

  try {
    const aiResponse = await anthropic.messages.create({
      model,
      system: instructions,
      max_tokens: 900,
      messages,
    });

    const answer = extractTextContent(aiResponse) || "Je n'ai pas pu produire de réponse à partir des sources fournies.";

    response.json({
      answer,
      citations: promptContextChunks,
      groundedOnly: true,
      model,
      matchedCountries,
      matchedDocuments: promptMatchedDocuments,
    });
  } catch (error) {
    console.error(error);
    response.status(500).json({
      error: "La requête IA a échoué. Vérifiez la clé Anthropic puis réessayez.",
      citations: promptContextChunks,
    });
  }
});

app.post("/api/compliance/check", async (request, response) => {
  const operationType = typeof request.body?.operationType === "string" ? request.body.operationType.trim().toLowerCase() : "";
  const operationData =
    request.body?.operationData && typeof request.body.operationData === "object" ? request.body.operationData : {};
  const portfolioContext =
    typeof request.body?.portfolioContext === "string" ? request.body.portfolioContext.trim() : "";
  const institutionCountry =
    typeof request.body?.institutionCountry === "string" && request.body.institutionCountry.trim()
      ? request.body.institutionCountry.trim()
      : DEFAULT_INSTITUTION_COUNTRY;

  if (operationType !== "loan" && operationType !== "repayment") {
    response.status(400).json({ error: "operationType doit être `loan` ou `repayment`." });
    return;
  }

  const localDecision = localComplianceGate(operationType, operationData);
  if (localDecision) {
    response.json({
      ...localDecision,
      matchedCountries: [],
      matchedDocuments: [],
      checkedAt: new Date().toISOString(),
      sourceAgeHours: getSourceAgeHours(sourceIndex),
      model: null,
    });
    return;
  }

  if (!(await ensureSourceIndexAvailable("compliance-request"))) {
    response.status(503).json({
      error:
        sourceIndexError?.message ||
        "La base réglementaire microfinance Afrique n'est pas prête. Reconstruisez d'abord la base dans le projet lié.",
    });
    return;
  }

  const question = [
    `Revue de conformité microfinance pour ${institutionCountry}`,
    `Type d'opération : ${operationType}`,
    "Considère d'abord le cadre national, puis les textes BCEAO, UMOA et UEMOA seulement si le pays entre dans le périmètre.",
    JSON.stringify(operationData),
  ].join("\n");

  const { contextChunks, matchedCountries, matchedDocuments } = await buildQuestionContext(
    knowledgeRoot,
    sourceIndex,
    question,
  );
  const institutionCoverage =
    matchedCountries.find((country) => country.shortName === institutionCountry) || matchedCountries[0] || null;
  const hasCountrySpecificSource = matchedDocuments.some(
    (document) => document.countries.length === 1 && document.countries[0] === institutionCountry,
  );
  const allowAutoApproval = institutionCoverage?.coverageLevel === "deep" || hasCountrySpecificSource;

  if (!anthropic) {
    response.json({
      decision: "REVIEW",
      summary:
        "Claude n'est pas configuré dans CIREX. L'opération n'a donc pas été validée automatiquement. Vérifiez les sources officielles citées avant traitement.",
      risks: ["Le filtrage conformité par IA n'est pas disponible sur ce serveur."],
      requiredActions: [
        "Ajoutez ANTHROPIC_API_KEY à la configuration CIREX ou conservez la clé du projet lié.",
        "Examinez manuellement les sources officielles citées avant de valider l'opération.",
      ],
      scopeNote: `Pays de l'institution retenu pour ce contrôle : ${institutionCountry}.`,
      citations: contextChunks.slice(0, 4),
      matchedCountries,
      matchedDocuments,
      checkedAt: new Date().toISOString(),
      sourceAgeHours: getSourceAgeHours(sourceIndex),
      model: null,
    });
    return;
  }

  const complianceInstructions = [
    "Tu es le filtre de conformité juridique de CIREX pour les opérations quotidiennes de microfinance.",
    "Évalue l'opération proposée uniquement à partir du contexte officiel fourni et de l'instantané local du portefeuille.",
    "Commence toujours par le périmètre du pays de l'institution.",
    `Avant toute autre analyse, applique la politique interne CIREX : ${describeInterestCeilingPolicy()} Utilise le plafond actuellement applicable indiqué dans les données de l'opération ou, à défaut, le palier de départ de ${DEFAULT_INTEREST_RATE_CEILING}%.`,
    "N'applique les textes BCEAO, UMOA ou UEMOA que si le contexte montre que le pays concerné entre bien dans leur champ.",
    "N'invente ni dispositions juridiques, ni seuils, ni agréments, ni règles nationales au-delà des sources fournies.",
    "Utilise APPROVED seulement si le contexte officiel fourni est suffisant et ne révèle aucun conflit clair.",
    "Ne retourne jamais APPROVED quand le pays de l'institution n'a qu'une couverture régionale ou d'annuaire dans la base fournie.",
    "Utilise REVIEW lorsque la couverture des sources est incomplète, que les faits sont insuffisants ou qu'une revue humaine est nécessaire.",
    "Utilise BLOCK lorsqu'un conflit probable ressort du contexte fourni ou lorsque l'opération est incohérente au regard du dossier local.",
    "Rends uniquement du JSON strict avec ces clés : decision, summary, risks, requiredActions, scopeNote, citationIds.",
    "summary doit rester bref, en 2 à 4 phrases maximum.",
    "risks et requiredActions doivent être des tableaux de phrases courtes, avec 4 éléments maximum chacun.",
    "citationIds ne doit contenir que des identifiants de chunks présents dans le contexte officiel fourni.",
    "Le contenu de summary, risks, requiredActions et scopeNote doit être entièrement en français.",
    "N'ajoute ni balises markdown ni commentaire en dehors de l'objet JSON.",
  ].join(" ");

  const compliancePrompt = [
    "Contexte officiel :",
    formatContextChunks(contextChunks) || "Aucun contexte officiel n'est disponible.",
    "",
    "Pays repérés :",
    buildMatchedCountrySummary(matchedCountries),
    "",
    "Documents officiels repérés :",
    buildMatchedDocumentSummary(matchedDocuments),
    "",
    "Contexte institutionnel :",
    `Pays de l'institution : ${institutionCountry}`,
    `Niveau de couverture dans la base : ${institutionCoverage?.coverageLevel || "inconnu"}`,
    `Politique interne CIREX : ${describeInterestCeilingPolicy()}`,
    `Plafond interne applicable au dossier : ${resolveInternalInterestRateCeiling(operationData)}%`,
    `Type d'opération : ${operationType}`,
    "Données proposées pour l'opération :",
    JSON.stringify(operationData, null, 2),
    "",
    "Instantané local du portefeuille CIREX :",
    portfolioContext || "Aucun instantané de portefeuille n'a été fourni.",
  ].join("\n");

  try {
    const aiResponse = await anthropic.messages.create({
      model,
      system: complianceInstructions,
      max_tokens: 1200,
      messages: [
        {
          role: "user",
          content: compliancePrompt,
        },
      ],
    });

    const raw = extractTextContent(aiResponse);
    let parsed;

    try {
      parsed = parseJsonObject(raw);
    } catch {
      parsed = {
        decision: "REVIEW",
        summary: "L'analyse de conformité n'a pas pu être structurée proprement. Une revue humaine est nécessaire avant validation.",
        risks: ["La réponse IA n'a pas pu être convertie dans le format de conformité attendu."],
        requiredActions: ["Examinez manuellement les passages cités avant de traiter l'opération."],
        scopeNote: `Pays de l'institution retenu pour ce contrôle : ${institutionCountry}.`,
        citationIds: contextChunks.slice(0, 2).map((chunk) => chunk.id),
      };
    }

    const citations = dedupeById(
      normalizeStringArray(parsed.citationIds).map((citationId) => contextChunks.find((chunk) => chunk.id === citationId)),
    );

    let decision = normalizeDecision(parsed.decision);
    let summary =
      String(parsed.summary || "").trim() ||
      "L'opération doit être revue humainement car le résultat de conformité est incomplet.";
    const risks = normalizeStringArray(parsed.risks);
    const requiredActions = normalizeStringArray(parsed.requiredActions);
    let scopeNote =
      String(parsed.scopeNote || "").trim() || `Pays de l'institution retenu pour ce contrôle : ${institutionCountry}.`;

    if (decision === "APPROVED" && !allowAutoApproval) {
      decision = "REVIEW";
      summary = `L'opération n'a pas été validée automatiquement car la couverture juridique indexée pour ${institutionCountry} est actuellement ${
        institutionCoverage?.coverageLevel || "non spécifique au pays"
      }. CIREX ne peut donc pas l'autoriser de façon sûre sur la seule base des sources régionales. ${summary}`.trim();
      risks.unshift(
        `CIREX ne dispose pas encore d'une couverture nationale approfondie de la législation microfinance pour ${institutionCountry}.`,
      );
      requiredActions.unshift(
        `Vérifiez la loi nationale sur la microfinance ou l'instruction du régulateur de ${institutionCountry} avant validation.`,
      );
      scopeNote = `${scopeNote} Note de couverture : ${institutionCoverage?.coverageNote || "La couverture juridique nationale n'est pas encore approfondie dans la base."}`;
    }

    response.json({
      decision,
      summary,
      risks,
      requiredActions,
      scopeNote,
      citations: citations.length ? citations : contextChunks.slice(0, 4),
      matchedCountries,
      matchedDocuments,
      checkedAt: new Date().toISOString(),
      sourceAgeHours: getSourceAgeHours(sourceIndex),
      model,
    });
  } catch (error) {
    console.error(error);
    response.status(500).json({
      error: "Le contrôle de conformité a échoué. Vérifiez la clé Anthropic puis réessayez.",
      citations: contextChunks.slice(0, 4),
    });
  }
});

app.listen(port, () => {
  console.log(`CIREX IA disponible sur http://localhost:${port}`);
});
