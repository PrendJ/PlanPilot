import { NextResponse } from "next/server";
import { boardContext, isResponse } from "@/lib/api-context";
import { apiError } from "@/lib/errors";
import { discardProposal, getProposal } from "@/lib/ai-proposals";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string; proposalId: string }> }) {
  const { slug, proposalId } = await params;
  const ctx = await boardContext(request, slug);
  if (isResponse(ctx)) return ctx;
  const proposal = await getProposal(proposalId, ctx.workspace.id, ctx.user.id);
  if (!proposal) return apiError(request, "NOT_FOUND", 404);
  return NextResponse.json({ proposal });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ slug: string; proposalId: string }> }) {
  const { slug, proposalId } = await params;
  const ctx = await boardContext(request, slug, { mutation: true });
  if (isResponse(ctx)) return ctx;
  await discardProposal({ proposalId, workspaceId: ctx.workspace.id, userId: ctx.user.id });
  return NextResponse.json({ ok: true });
}
