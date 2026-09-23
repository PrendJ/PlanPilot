import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsageStatus } from "@/lib/plans";
import { boardContext, isResponse } from "@/lib/api-context";
import { canManageRole, canWriteCards, cardInclude } from "@/lib/board";
import { resolvePlanningModel } from "@/lib/ai-config";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await boardContext(request, slug);
  if (isResponse(ctx)) return ctx;
  const archived = new URL(request.url).searchParams.get("archived") === "1";
  const [columns, members, usage, pending] = await Promise.all([
    prisma.boardColumn.findMany({
      where: { workspaceId: ctx.workspace.id },
      orderBy: { position: "asc" },
      include: { cards: { where: { archived }, orderBy: [{ position: "asc" }, { updatedAt: "desc" }], include: cardInclude } },
    }),
    prisma.workspaceMember.findMany({
      where: { workspaceId: ctx.workspace.id },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    getUsageStatus(ctx.workspace.organizationId),
    prisma.aiProposal.findFirst({
      where: { workspaceId: ctx.workspace.id, userId: ctx.user.id, status: "PENDING", expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }),
  ]);
  return NextResponse.json({
    workspace: {
      id: ctx.workspace.id,
      name: ctx.workspace.name,
      slug: ctx.workspace.slug,
      locale: ctx.workspace.locale,
      dictationEnabled: ctx.workspace.dictationEnabled,
      planModel: resolvePlanningModel(ctx.workspace.planModel),
      revision: ctx.workspace.revision,
      role: ctx.role,
      canManage: canManageRole(ctx.role),
      canWrite: canWriteCards(ctx.role) && !ctx.readOnly,
      readOnly: ctx.readOnly,
      organizationId: ctx.workspace.organizationId,
      organizationName: ctx.workspace.organization.name,
      plan: ctx.workspace.organization.plan,
    },
    columns: columns.map(column => ({
      id: column.id,
      title: column.title,
      description: column.description,
      position: column.position,
      cards: column.cards.map(({ _count, ...card }) => ({ ...card, commentCount: _count.comments })),
    })),
    members: members.map(member => ({ ...member.user, role: member.role })),
    quota: usage
      ? {
          used: usage.used,
          included: usage.included,
          credits: usage.credits,
          remaining: Number.isFinite(usage.remaining) ? usage.remaining : null,
          percent: usage.percent,
          status: usage.status,
          resetsAt: usage.resetsAt,
        }
      : null,
    me: {
      id: ctx.user.id,
      name: ctx.user.name,
      autoApplyAi: ctx.user.autoApplyAi,
      autoSendDictation: ctx.user.autoSendDictation,
      verified: Boolean(ctx.user.emailVerifiedAt),
    },
    pendingProposalId: pending?.id || null,
  });
}
