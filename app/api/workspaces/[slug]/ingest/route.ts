import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/security";
import { boardContext, isResponse } from "@/lib/api-context";
import { apiError } from "@/lib/errors";
import { InvalidAiPatchError } from "@/lib/ai-patch";
import { AiProviderError } from "@/lib/openrouter";
import { QuotaExceededError } from "@/lib/plans";
import { applyProposal, createProposal, ProposalError } from "@/lib/ai-proposals";
import { isBoardConflict } from "@/lib/board";
import { trackEvent } from "@/lib/product-events";

const schema = z.object({
  text: z.string().trim().min(1).max(12000),
  source: z.enum(["text", "voice"]).default("text"),
  timeZone: z.string().max(64).optional(),
  autoApply: z.boolean().optional(),
});

function validTimeZone(value?: string) {
  if (!value) return "Europe/Rome";
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return value;
  } catch {
    return "Europe/Rome";
  }
}

/**
 * Step 1 of the AI loop: returns a proposal (diff preview) without touching the board.
 * People who opted into auto-apply get it applied immediately, unless the model asks a clarification.
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await boardContext(request, slug, { write: true });
  if (isResponse(ctx)) return ctx;
  const limited = await rateLimit(`ai:${ctx.user.id}`, 20, 60_000, request);
  if (limited) return limited;
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError(request, "INVALID_INPUT", 400);
  const { text, source } = parsed.data;
  try {
    const proposal = await createProposal({
      workspace: ctx.workspace,
      userId: ctx.user.id,
      text,
      source,
      timeZone: validTimeZone(parsed.data.timeZone),
    });
    const autoApply = (parsed.data.autoApply ?? ctx.user.autoApplyAi) && proposal.actions.length > 0 && !proposal.clarification;
    if (!autoApply) return NextResponse.json({ proposal });
    const { receipt } = await applyProposal({ proposalId: proposal.id, workspace: ctx.workspace, userId: ctx.user.id });
    await trackEvent("ai_update_applied");
    return NextResponse.json({ proposal: { ...proposal, status: "APPLIED" }, receipt });
  } catch (error) {
    if (error instanceof QuotaExceededError) return apiError(request, "QUOTA_EXHAUSTED", 402);
    if (error instanceof InvalidAiPatchError || (error instanceof AiProviderError && error.message === "AI_INVALID_PATCH"))
      return apiError(request, "AI_INVALID_PATCH", 422);
    if (error instanceof AiProviderError) return apiError(request, "AI_UNAVAILABLE", 502);
    if (error instanceof ProposalError)
      return apiError(
        request,
        error.message === "AI_NOT_CONFIGURED"
          ? "AI_NOT_CONFIGURED"
          : error.message === "PROPOSAL_STALE"
            ? "PROPOSAL_STALE"
            : "PROPOSAL_EXPIRED",
        error.message === "AI_NOT_CONFIGURED" ? 503 : 409,
      );
    if (isBoardConflict(error)) return apiError(request, "BOARD_CONFLICT", 409);
    console.error("AI update failed", error);
    return apiError(request, "AI_UNAVAILABLE", 502);
  }
}
