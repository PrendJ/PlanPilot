import { PLANNING_MODELS, TRANSCRIPTION_MODELS } from "@/lib/ai-config";

export type ModelPricing = { inputUsdPerMillion: number | null; outputUsdPerMillion: number | null; audioUsdPerMinute: number | null };

let cached: { expiresAt: number; prices: Record<string, ModelPricing> } | null = null;

function scaledPrice(value: unknown, multiplier: number): number | null {
  if ((typeof value !== "string" && typeof value !== "number") || (typeof value === "string" && !value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Number((parsed * multiplier).toFixed(8)) : null;
}

/** Public catalogue prices; failure affects only the admin comparison, never model selection. */
export async function publicModelPricing(): Promise<Record<string, ModelPricing>> {
  if (cached && cached.expiresAt > Date.now()) return cached.prices;
  const prices: Record<string, ModelPricing> = {};
  let failures = 0;
  // The default catalogue omits STT models; the transcription filter is required.
  await Promise.all(
    [
      { url: "https://openrouter.ai/api/v1/models", options: PLANNING_MODELS },
      { url: "https://openrouter.ai/api/v1/models?output_modalities=transcription", options: TRANSCRIPTION_MODELS },
    ].map(async ({ url, options }) => {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(4_000) });
        if (!response.ok) throw new Error(`HTTP_${response.status}`);
        const raw: unknown = await response.json();
        const models = (raw as { data?: unknown })?.data;
        if (!Array.isArray(models)) throw new Error("INVALID_CATALOG");
        for (const model of models) {
          if (!model || typeof model !== "object") continue;
          const option = options.find(item => item.id === model.id);
          if (!option) continue;
          const durationBased = option.audioPriceUnit === "second";
          prices[model.id] = {
            inputUsdPerMillion: durationBased ? null : scaledPrice(model.pricing?.prompt, 1_000_000),
            outputUsdPerMillion: durationBased ? null : scaledPrice(model.pricing?.completion, 1_000_000),
            audioUsdPerMinute: durationBased ? scaledPrice(model.pricing?.prompt, 60) : null,
          };
        }
      } catch (error) {
        failures++;
        console.warn("OpenRouter public model prices unavailable", error instanceof Error ? error.name : "unknown");
        for (const option of options) {
          if (cached?.prices[option.id]) prices[option.id] = cached.prices[option.id];
        }
      }
    }),
  );
  cached = { expiresAt: Date.now() + (failures ? 60_000 : 60 * 60_000), prices };
  return prices;
}
