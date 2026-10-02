import { NextResponse } from "next/server";
import { getUsageStatus, recordUsage } from "@/lib/plans";
import { rateLimit } from "@/lib/security";
import { getWorkspaceApiKey } from "@/lib/workspace";
import { boardContext, isResponse } from "@/lib/api-context";
import { apiError } from "@/lib/errors";
import { audioFormatFor, MAX_AUDIO_BYTES, openRouterBaseUrl, openRouterHeaders, providerPolicy } from "@/lib/ai-config";
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
    const response = await fetch(`${openRouterBaseUrl()}/audio/transcriptions`, {
      method: "POST",
      signal: AbortSignal.timeout(60_000),
      headers: openRouterHeaders(apiKey),
      body: JSON.stringify({
        model,
        input_audio: { data: buffer.toString("base64"), format: audioFormatFor(audio.type, audio.name) },
        language: workspace.locale,
        provider: providerPolicy(),
      }),
    });
    const raw = await response.json().catch(() => null);
    if (!response.ok || typeof raw?.text !== "string") {
      console.error("Transcription failed", response.status);
      return apiError(request, "TRANSCRIPTION_FAILED", 502);
    }
    await recordUsage({
      organizationId: workspace.organizationId,
      workspaceId: workspace.id,
      userId: user.id,
      providerRequestId: raw.id,
      category: "TRANSCRIPTION",
      model,
      costUsd: raw?.usage?.cost,
    });
    await trackEvent("dictation");
    return NextResponse.json({ text: raw.text.trim() });
  } catch {
    return apiError(request, "TRANSCRIPTION_FAILED", 502);
  }
}
