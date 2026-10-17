import { type AudioFormat, logProviderFailure, networkCauseCode, openRouterBaseUrl, openRouterHeaders, providerPolicy } from "@/lib/ai-config";

const FALLBACK_MODEL = "openai/whisper-large-v3-turbo";

export class TranscriptionError extends Error {
  constructor(public readonly diagnosticId: string) {
    super("TRANSCRIPTION_FAILED");
  }
}

/** Both dictation and Telegram use the same provider contract and privacy policy. */
export async function transcribeAudio(input: {
  apiKey: string;
  model: string;
  audio: Buffer;
  format: AudioFormat;
  language: string;
  diagnosticId?: string;
}) {
  const diagnosticId = input.diagnosticId || crypto.randomUUID();
  const started = Date.now();
  // One shared deadline, including a possible fallback. Never retry auth, credit or invalid-audio errors.
  const signal = AbortSignal.timeout(60_000);
  const models = input.model === FALLBACK_MODEL ? [input.model] : [input.model, FALLBACK_MODEL];
  for (const model of models) {
    const details = (phase: "request" | "response", causeCode?: string, providerRequestId?: string) => ({
      diagnosticId, model, elapsedMs: Date.now() - started, phase, causeCode, providerRequestId,
    });
    console.info("OpenRouter transcription started", { diagnosticId, model });
    let response: Response;
    try {
      response = await fetch(`${openRouterBaseUrl()}/audio/transcriptions`, {
        method: "POST",
        signal,
        headers: openRouterHeaders(input.apiKey),
        body: JSON.stringify({
          model,
          input_audio: { data: input.audio.toString("base64"), format: input.format },
          language: input.language.split(/[-_]/)[0].toLowerCase(),
          provider: providerPolicy(),
        }),
      });
    } catch (error) {
      logProviderFailure("transcription", error instanceof Error ? error.name : "network", null, details("request", networkCauseCode(error)));
      throw new TranscriptionError(diagnosticId);
    }
    const raw = await response.json().catch(() => null);
    const requestId = typeof raw?.id === "string" ? raw.id : response.headers.get("x-generation-id") || undefined;
    if (!response.ok || typeof raw?.text !== "string" || !raw.text.trim() || raw?.error) {
      logProviderFailure("transcription", response.ok ? "invalid_transcript" : response.status, raw, details("response", undefined, requestId));
      if (response.status === 404 && model !== FALLBACK_MODEL) {
        console.info("OpenRouter transcription fallback", { diagnosticId, model, fallbackModel: FALLBACK_MODEL });
        continue;
      }
      throw new TranscriptionError(diagnosticId);
    }
    console.info("OpenRouter transcription completed", details("response", undefined, requestId));
    return { text: raw.text.trim() as string, model, requestId, usage: raw.usage as { cost?: number } | undefined };
  }
  throw new TranscriptionError(diagnosticId);
}
