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
  /** Unit of pricing.prompt in the STT catalogue (never infer it from the price). */
  audioPriceUnit?: "second";
};

/**
 * Only models with a zero-retention endpoint on the standard OpenRouter URL (GET /api/v1/endpoints/zdr).
 * A stored id that leaves this list resolves to the default. Gemini 2.5 lost its ZDR (Vertex) endpoints in
 * October 2026, and every call answered 404 "No endpoints found matching your data policy".
 */
export const PLANNING_MODELS: ModelOption[] = [
  {
    id: "openai/gpt-5-nano",
    label: "GPT-5 nano",
    note: "Il più economico per token; ragionamento minimo, adatto ad aggiornamenti semplici.",
    recommended: true,
    reasoningEffort: "minimal",
    temperature: false,
  },
  {
    id: "openai/gpt-5-mini",
    label: "GPT-5 mini",
    note: "Consigliato per aggiornamenti lunghi o con molte modifiche; ragionamento leggero.",
    reasoningEffort: "low",
    temperature: false,
  },
  {
    id: "mistralai/mistral-small-2603",
    label: "Mistral Small",
    note: "Buona comprensione dell'italiano, costo leggermente più alto.",
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

/** Voxtral Mini Transcribe (first release) is zero-retention only on mistral/eu, which the standard URL never reaches. */
export const TRANSCRIPTION_MODELS: ModelOption[] = [
  {
    id: "openai/whisper-large-v3-turbo",
    label: "Whisper Large V3 Turbo",
    note: "Consigliato: trascrizione multilingua economica su endpoint a zero conservazione.",
    recommended: true,
    audioPriceUnit: "second",
  },
  {
    id: "openai/whisper-large-v3",
    label: "Whisper Large V3",
    note: "Alternativa multilingua a Whisper Turbo su endpoint a zero conservazione.",
    audioPriceUnit: "second",
  },
  {
    id: "mistralai/voxtral-mini-transcribe-3-0",
    label: "Voxtral Mini Transcribe 3",
    note: "Alternativa Mistral a zero conservazione, costo più alto; ripiega su Whisper se non disponibile (404).",
    audioPriceUnit: "second",
  },
  {
    id: "mistralai/voxtral-small-transcribe-3-0",
    label: "Voxtral Small Transcribe 3",
    note: "Modello Mistral più grande; ripiega su Whisper se non disponibile (404).",
    audioPriceUnit: "second",
  },
];

export const DEFAULT_PLANNING_MODEL = PLANNING_MODELS[0].id;
export const DEFAULT_COMPLEX_PLANNING_MODEL = "openai/gpt-5-mini";
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
  validationIssues?: Array<{ path: string; code: string; validation?: string }>;
};

/** Server log line for a failed provider call. */
export function logProviderFailure(scope: string, status: number | string, raw: unknown, diagnostic?: ProviderDiagnostic) {
  const error = (raw as { error?: { message?: unknown; code?: unknown; metadata?: Record<string, unknown> } } | null)?.error;
  const message = typeof error?.message === "string" ? error.message.slice(0, 300) : "";
  const metadata = error?.metadata;
  let upstream: { error?: { message?: unknown; code?: unknown; status?: unknown } } | null = null;
  try {
    upstream = typeof metadata?.raw === "string" ? JSON.parse(metadata.raw) : null;
  } catch { /* Never print raw provider bodies: they may contain user data. */ }
  const upstreamMessage = typeof upstream?.error?.message === "string" ? upstream.error.message : "";
  const reason = /enum/i.test(upstreamMessage) ? "invalid_enum_schema"
    : /schema|response_format|responseSchema/i.test(upstreamMessage) ? "invalid_response_schema"
    : /no endpoints/i.test(message + upstreamMessage) ? "no_matching_endpoints"
    : /model.*(not found|does not exist|invalid)/i.test(message + upstreamMessage) ? "model_not_found"
    : /audio.*format|unsupported.*format/i.test(upstreamMessage) ? "unsupported_audio_format"
    // Vertex answers an unsupported response schema with a bare "Request contains an invalid argument."
    : upstream?.error?.status === "INVALID_ARGUMENT" ? "invalid_argument"
    : undefined;
  const safeToken = (value: unknown) => typeof value === "string" && /^[a-zA-Z0-9 _./-]{1,80}$/.test(value) ? value : undefined;
  console.error(`OpenRouter ${scope} failed`, {
    ...diagnostic, status, code: error?.code, message,
    provider: safeToken(metadata?.provider_name),
    upstreamCode: typeof upstream?.error?.code === "number" ? upstream.error.code : safeToken(metadata?.provider_error_code),
    upstreamStatus: safeToken(upstream?.error?.status),
    reason,
  });
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
