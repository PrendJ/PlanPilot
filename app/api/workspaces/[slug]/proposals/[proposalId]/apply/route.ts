import { NextResponse } from "next/server";
import { z } from "zod";
import { boardContext, isResponse } from "@/lib/api-context";
import { apiError } from "@/lib/errors";
import { applyProposal, ProposalError } from "@/lib/ai-proposals";
import { isBoardConflict } from "@/lib/board";
import { trackEvent } from "@/lib/product-events";

/** Step 2 of the AI loop: apply all or some of the proposed actions. Safe to retry (idempotent receipt). */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string; proposalId: string }> }) {
  const { slug, proposalId } = await params;
  const ctx = await boardContext(request, slug, { write: true });
  if (isResponse(ctx)) return ctx;
  const parsed = z
    .object({ actionIndexes: z.array(z.number().int().min(0).max(29)).max(30).optional() })
    .safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError(request, "INVALID_INPUT", 400);
  try {
    const { receipt, replayed } = await applyProposal({
      proposalId,
      workspace: ctx.workspace,
      userId: ctx.user.id,
      actionIndexes: parsed.data.actionIndexes,
    });
    if (!replayed) await trackEvent("ai_update_applied");
    return NextResponse.json({ receipt, replayed });
  } catch (error) {
    if (error instanceof ProposalError) {
      if (error.message === "NOT_FOUND") return apiError(request, "NOT_FOUND", 404);
      return apiError(request, error.message === "PROPOSAL_STALE" ? "PROPOSAL_STALE" : "PROPOSAL_EXPIRED", 409);
    }
    if (isBoardConflict(error)) return apiError(request, "BOARD_CONFLICT", 409);
    throw error;
  }
}
