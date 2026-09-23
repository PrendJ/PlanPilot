import { NextResponse } from "next/server";
import { z } from "zod";
import { v1Board, v1Error } from "@/lib/api-v1";
import { applyProposal, createProposal, ProposalError } from "@/lib/ai-proposals";
import { QuotaExceededError } from "@/lib/plans";
import { AiProviderError } from "@/lib/openrouter";
import { InvalidAiPatchError } from "@/lib/ai-patch";

/**
 * Natural-language update via API (e.g. from a form, an email automation or a chat bot).
 * By default returns the proposal; with "apply": true applies it (unless the model asks a clarification).
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await v1Board(request, slug, true);
  if (ctx instanceof NextResponse) return ctx;
  const parsed = z
    .object({ text: z.string().trim().min(1).max(12000), apply: z.boolean().default(false) })
    .safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return v1Error(400, "INVALID_INPUT", "Provide a non-empty text");
  try {
    const proposal = await createProposal({ workspace: ctx.workspace, userId: ctx.user.id, text: parsed.data.text, source: "text" });
    if (!parsed.data.apply || proposal.clarification || !proposal.actions.length) return NextResponse.json({ data: { proposal } });
    const { receipt } = await applyProposal({ proposalId: proposal.id, workspace: ctx.workspace, userId: ctx.user.id });
    return NextResponse.json({ data: { proposal: { ...proposal, status: "APPLIED" }, receipt } });
  } catch (error) {
    if (error instanceof QuotaExceededError) return v1Error(402, "QUOTA_EXHAUSTED", "No AI updates left");
    if (error instanceof InvalidAiPatchError || error instanceof AiProviderError)
      return v1Error(502, "AI_UNAVAILABLE", "The AI service could not process this update");
    if (error instanceof ProposalError) return v1Error(409, error.message, "Proposal could not be applied");
    throw error;
  }
}
