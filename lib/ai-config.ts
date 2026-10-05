/**
 * AI routing policy: OpenRouter's standard endpoint, zero-retention providers only.
 * `zdr: true` makes OpenRouter refuse any endpoint that retains data and `data_collection: "deny"` excludes
 * providers that train on inputs. Fallbacks stay on: they can only land on other zero-retention endpoints.
 * OPENROUTER_BASE_URL can point to https://eu.openrouter.ai/api/v1 for EU in-region routing, which needs the
 * OpenRouter Business plan.
 */
export type ModelOption = {
  id: string;
  label: string;
  note: string;
  recommended?: boolean;
  reasoningEffort?: "minimal" | "low";
  /** False when the model's zero-retention endpoints reject `temperature` (see samplingParams). */
  temperature?: false;
};

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
    temperature: false,
  },
  {
    id: "openai/gpt-5-mini",
    label: "GPT-5 mini",
    note: "Alternativa OpenAI con output strutturato; disponibile su endpoint ZDR.",
    reasoningEffort: "minimal",
    temperature: false,
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
  {
    id: "google/gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    note: "Alternativa Google per contesti complessi; verifica costi e latenza prima di selezionarla.",
  },
  {
    id: "anthropic/claude-haiku-4.5",
    label: "Claude Haiku 4.5",
    note: "Alternativa Anthropic con output strutturato su endpoint ZDR.",
  },
  {
    id: "qwen/qwen3-235b-a22b-2507",
    label: "Qwen3 235B Instruct",
    note: "Alternativa open-weight con output strutturato su endpoint ZDR.",
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

/**
 * Sampling and reasoning fields for a planning model. Requests use provider.require_parameters, so a field the
 * model does not accept (temperature on GPT-5 nano) leaves OpenRouter with no eligible endpoint and every
 * call fails as "AI unavailable".
 */
export function samplingParams(id: string, temperature: number) {
  const option = planningModelOption(id);
  return {
    ...(option?.temperature === false ? {} : { temperature }),
    ...(option?.reasoningEffort ? { reasoning: { effort: option.reasoningEffort, exclude: true } } : {}),
  };
}

/** Message content as JSON. Some models wrap structured output in a ```json fence despite response_format. */
export function parseJsonContent(content: unknown): unknown {
  if (typeof content !== "string") return content;
  const fenced = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i.exec(content);
  return JSON.parse(fenced ? fenced[1] : content);
}

/** Diagnostic fields exclude prompts, board data, audio and credentials. */
export type ProviderDiagnostic = {
  diagnosticId: string;
  model: string;
  elapsedMs: number;
  phase: "request" | "response" | "parse" | "schema";
  causeCode?: string;
  providerRequestId?: string;
};

/** Server log line for a failed provider call. */
export function logProviderFailure(scope: string, status: number | string, raw: unknown, diagnostic?: ProviderDiagnostic) {
  const error = (raw as { error?: { message?: unknown; code?: unknown } } | null)?.error;
  const message = typeof error?.message === "string" ? error.message.slice(0, 300) : "";
  console.error(`OpenRouter ${scope} failed`, { ...diagnostic, status, code: error?.code, message });
}

export function networkCauseCode(error: unknown): string | undefined {
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause;
  return typeof cause?.code === "string" && /^[A-Z0-9_]{1,64}$/.test(cause.code) ? cause.code : undefined;
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

export type AudioFormat = "webm" | "ogg" | "m4a" | "mp3" | "wav";

const AUDIO_EXTENSIONS: Record<string, AudioFormat> = {
  opus: "ogg",
  ogg: "ogg",
  oga: "ogg",
  m4a: "m4a",
  mp4: "m4a",
  aac: "m4a",
  mp3: "mp3",
  wav: "wav",
  webm: "webm",
};

/**
 * Audio container for the transcription API. The MIME type wins; files shared from other apps (e.g. WhatsApp .opus
 * through the PWA share target) often arrive with an empty type, so the file name extension is the fallback.
 */
export function audioFormatFor(mime?: string | null, fileName?: string | null): AudioFormat {
  const type = (mime || "").toLowerCase();
  if (type.includes("webm")) return "webm";
  if (type.includes("ogg") || type.includes("opus")) return "ogg";
  if (type.includes("mp4") || type.includes("m4a") || type.includes("aac")) return "m4a";
  if (type.includes("mpeg") || type.includes("mp3")) return "mp3";
  if (type.includes("wav")) return "wav";
  const extension = /\.([a-z0-9]+)$/i.exec((fileName || "").trim())?.[1]?.toLowerCase();
  return (extension && AUDIO_EXTENSIONS[extension]) || "webm";
}

/** Maximum dictation length accepted by the UI and the API. */
export const MAX_DICTATION_SECONDS = 120;
export const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
