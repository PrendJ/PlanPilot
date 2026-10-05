import { PLANNING_MODELS, TRANSCRIPTION_MODELS } from "@/lib/ai-config";

export type ModelPricing = { inputUsdPerMillion: number | null; outputUsdPerMillion: number | null };

let cached: { expiresAt: number; prices: Record<string, ModelPricing> } | null = null;

function perMillion(value: unknown): number | null {
  if ((typeof value !== "string" && typeof value !== "number") || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Number((parsed * 1_000_000).toFixed(6)) : null;
}

/** Public catalogue prices; failure affects only the admin comparison, never model selection. */
export async function publicModelPricing(): Promise<Record<string, ModelPricing>> {
  if (cached && cached.expiresAt > Date.now()) return cached.prices;
  const ids = new Set([...PLANNING_MODELS, ...TRANSCRIPTION_MODELS].map(model => model.id));
  const prices: Record<string, ModelPricing> = {};
  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(4_000) });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    const raw: unknown = await response.json();
    const models = (raw as { data?: unknown })?.data;
    if (!Array.isArray(models)) throw new Error("INVALID_CATALOG");
    for (const model of models) {
      if (!model || typeof model !== "object" || !ids.has(model.id)) continue;
      prices[model.id] = {
        inputUsdPerMillion: perMillion(model.pricing?.prompt),
        outputUsdPerMillion: perMillion(model.pricing?.completion),
      };
    }
    cached = { expiresAt: Date.now() + 60 * 60_000, prices };
  } catch (error) {
    console.warn("OpenRouter public model prices unavailable", error instanceof Error ? error.name : "unknown");
    if (cached) return cached.prices;
    cached = { expiresAt: Date.now() + 60_000, prices };
  }
  return prices;
}
