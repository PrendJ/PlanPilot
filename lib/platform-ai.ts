import { prisma } from "@/lib/prisma";
import {
  DEFAULT_PLANNING_MODEL,
  DEFAULT_TRANSCRIPTION_MODEL,
  PLANNING_MODELS,
  resolvePlanningModel,
  resolveTranscriptionModel,
  TRANSCRIPTION_MODELS,
} from "@/lib/ai-config";

/**
 * AI models are a platform-wide choice made only by the superadmin: one row ("default") drives planning,
 * routing and dictation for every board. Workspace.planModel/transcriptionModel are legacy columns and are ignored.
 */
export const PLATFORM_AI_SETTING_ID = "default";
const CACHE_TTL_MS = 30_000;

export type PlatformModels = { planModel: string; transcriptionModel: string };

let cache: { value: PlatformModels; expiresAt: number } | null = null;

function normalize(row: { planModel?: string | null; transcriptionModel?: string | null } | null): PlatformModels {
  return {
    planModel: resolvePlanningModel(row?.planModel ?? DEFAULT_PLANNING_MODEL),
    transcriptionModel: resolveTranscriptionModel(row?.transcriptionModel ?? DEFAULT_TRANSCRIPTION_MODEL),
  };
}

/** Current platform models, cached in-process for 30s. Falls back to the defaults if the row is missing or unreadable. */
export async function platformModels(): Promise<PlatformModels> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.value;
  try {
    const row = await prisma.platformAiSetting.findUnique({ where: { id: PLATFORM_AI_SETTING_ID } });
    const value = normalize(row);
    cache = { value, expiresAt: now + CACHE_TTL_MS };
    return value;
  } catch (error) {
    // Never block AI features on the settings table: use the defaults and retry on the next call.
    console.error("Platform AI settings unavailable", error instanceof Error ? error.message : error);
    return normalize(null);
  }
}

export function invalidatePlatformModels() {
  cache = null;
}

export function isAllowedPlanningModel(id: string) {
  return PLANNING_MODELS.some(model => model.id === id);
}

export function isAllowedTranscriptionModel(id: string) {
  return TRANSCRIPTION_MODELS.some(model => model.id === id);
}

/**
 * Stores the platform models and writes the admin audit event in the same transaction.
 * Callers must already have checked the superadmin capability.
 */
export async function setPlatformModels(input: PlatformModels, actorId: string): Promise<PlatformModels> {
  if (!isAllowedPlanningModel(input.planModel)) throw new Error("Modello di pianificazione non consentito");
  if (!isAllowedTranscriptionModel(input.transcriptionModel)) throw new Error("Modello di dettatura non consentito");
  const saved = await prisma.$transaction(async tx => {
    const previous = await tx.platformAiSetting.findUnique({ where: { id: PLATFORM_AI_SETTING_ID } });
    const row = await tx.platformAiSetting.upsert({
      where: { id: PLATFORM_AI_SETTING_ID },
      create: { id: PLATFORM_AI_SETTING_ID, planModel: input.planModel, transcriptionModel: input.transcriptionModel, updatedById: actorId },
      update: { planModel: input.planModel, transcriptionModel: input.transcriptionModel, updatedById: actorId },
    });
    const before = normalize(previous);
    await tx.adminAuditEvent.create({
      data: {
        actorId,
        action: "PLATFORM_AI_MODELS_UPDATED",
        targetType: "PLATFORM",
        targetId: "ai-models",
        metadata: { before, after: { planModel: row.planModel, transcriptionModel: row.transcriptionModel } },
      },
    });
    return row;
  });
  invalidatePlatformModels();
  return normalize(saved);
}

/** Options shown to the superadmin; ids never leave the admin area. */
export function platformModelOptions() {
  const pick = ({ id, label, note, recommended }: (typeof PLANNING_MODELS)[number]) => ({ id, label, note, recommended: Boolean(recommended) });
  return { planning: PLANNING_MODELS.map(pick), transcription: TRANSCRIPTION_MODELS.map(pick) };
}
