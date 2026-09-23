/**
 * AI routing policy: OpenRouter's standard endpoint, zero-retention providers only.
 * `zdr: true` makes OpenRouter refuse any endpoint that retains data and `data_collection: "deny"` excludes
 * providers that train on inputs. Fallbacks stay on: they can only land on other zero-retention endpoints.
 * OPENROUTER_BASE_URL can point to https://eu.openrouter.ai/api/v1 for EU in-region routing, which needs the
 * OpenRouter Business plan.
 */
export type ModelOption = { id: string; label: string; note: string; recommended?: boolean; reasoningEffort?: "minimal" | "low" };

export const PLANNING_MODELS: ModelOption[] = [
  {
    id: "google/gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash-Lite",
    note: "Consigliato: veloce, economico e affidabile nell'output strutturato.",
    recommended: true,
  },
  {
    id: "openai/gpt-5-nano",
    label: "GPT-5 nano",
    note: "Il più economico per token; ragionamento minimo, adatto ad aggiornamenti semplici.",
    reasoningEffort: "minimal",
  },
  {
    id: "mistralai/mistral-small-2603",
    label: "Mistral Small",
    note: "Buona comprensione dell'italiano, costo leggermente più alto.",
  },
  {
    id: "google/gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    note: "Massima comprensione per board grandi e aggiornamenti complessi; costo più alto.",
  },
];

export const TRANSCRIPTION_MODELS: ModelOption[] = [
  {
    id: "mistralai/voxtral-mini-transcribe",
    label: "Voxtral Mini Transcribe",
    note: "Trascrizione multilingua senza conservazione dei dati.",
    recommended: true,
  },
];

export const DEFAULT_PLANNING_MODEL = PLANNING_MODELS[0].id;
export const DEFAULT_TRANSCRIPTION_MODEL = TRANSCRIPTION_MODELS[0].id;

export function resolvePlanningModel(id?: string | null) {
  return PLANNING_MODELS.some(model => model.id === id) ? id! : DEFAULT_PLANNING_MODEL;
}

export function resolveTranscriptionModel(id?: string | null) {
  return TRANSCRIPTION_MODELS.some(model => model.id === id) ? id! : DEFAULT_TRANSCRIPTION_MODEL;
}

export const OPENROUTER_DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

export function planningModelOption(id: string) {
  return PLANNING_MODELS.find(model => model.id === id);
}

export function openRouterBaseUrl() {
  const configured = process.env.OPENROUTER_BASE_URL?.trim().replace(/\/+$/, "");
  return configured && /^https:\/\/([a-z]+\.)?openrouter\.ai\/api\/v1$/.test(configured) ? configured : OPENROUTER_DEFAULT_BASE_URL;
}

/** Optional provider allowlist (AI_PROVIDER_ONLY, comma separated OpenRouter slugs). Empty = any ZDR endpoint. */
export function providerAllowlist() {
  return (process.env.AI_PROVIDER_ONLY || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

export function providerPolicy(options: { requireParameters?: boolean } = {}) {
  const only = providerAllowlist();
  return {
    ...(only.length ? { only } : {}),
    zdr: true,
    data_collection: "deny" as const,
    allow_fallbacks: true,
    ...(options.requireParameters ? { require_parameters: true } : {}),
  };
}

export function openRouterHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.APP_URL || "https://boardcue.draftapps.it",
    "X-OpenRouter-Title": "BoardCue",
  };
}

/** Maximum dictation length accepted by the UI and the API. */
export const MAX_DICTATION_SECONDS = 120;
export const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
