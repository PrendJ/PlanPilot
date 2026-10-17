import { NextResponse } from "next/server";
import { getUsageStatus, recordUsage } from "@/lib/plans";
import { rateLimit } from "@/lib/security";
import { getWorkspaceApiKey } from "@/lib/workspace";
import { boardContext, isResponse } from "@/lib/api-context";
import { apiError } from "@/lib/errors";
import { audioFormatFor, MAX_AUDIO_BYTES } from "@/lib/ai-config";
import { transcribeAudio, TranscriptionError } from "@/lib/transcription";
import { platformModels } from "@/lib/platform-ai";
import { trackEvent } from "@/lib/product-events";

/** Dictation is included in every plan; the transcript comes back as editable text and is never stored. */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await boardContext(request, slug, { write: true });
  if (isResponse(ctx)) return ctx;
  const limited = await rateLimit(`transcribe:${ctx.user.id}`, 20, 60_000, request);
  if (limited) return limited;
  const { workspace, user } = ctx;
  if (!workspace.dictationEnabled) return apiError(request, "DICTATION_DISABLED", 403);
  const quota = await getUsageStatus(workspace.organizationId);
  if (!quota || quota.status === "PAUSED") return apiError(request, "QUOTA_EXHAUSTED", 402);
  const apiKey = getWorkspaceApiKey(workspace);
  if (!apiKey) return apiError(request, "AI_NOT_CONFIGURED", 503);
  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof File) || audio.size === 0) return apiError(request, "AUDIO_REQUIRED", 400);
  if (audio.size > MAX_AUDIO_BYTES) return apiError(request, "AUDIO_TOO_LARGE", 413);
  const { transcriptionModel: model } = await platformModels();
  const buffer = Buffer.from(await audio.arrayBuffer());
  try {
    const result = await transcribeAudio({
      apiKey, model, audio: buffer, format: audioFormatFor(audio.type, audio.name), language: workspace.locale,
    });
    await recordUsage({
      organizationId: workspace.organizationId,
      workspaceId: workspace.id,
      userId: user.id,
      providerRequestId: result.requestId,
      category: "TRANSCRIPTION",
      model: result.model,
      costUsd: result.usage?.cost,
    });
    await trackEvent("dictation");
    return NextResponse.json({ text: result.text });
  } catch (error) {
    return apiError(request, "TRANSCRIPTION_FAILED", 502, error instanceof TranscriptionError ? { diagnosticId: error.diagnosticId } : undefined);
  }
}
