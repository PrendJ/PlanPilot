import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUsageStatus } from "@/lib/plans";

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { slug } = await params;
  const url = new URL(_.url);
  const archived = url.searchParams.get("archived") === "1";
  const workspace = await prisma.workspace.findFirst({ where: { slug, members: { some: { userId: user.id } } }, include: { organization: true, members: { include: { user: { select: { id: true, name: true, email: true } } } }, columns: { orderBy: { position: "asc" }, include: { cards: { where: { archived }, orderBy: [{ position: "asc" }, { updatedAt: "desc" }], include: { assignees: { include: { user: { select: { id: true, name: true, email: true } } } } } } } }, updateLogs: { orderBy: { createdAt: "desc" }, take: 12 } } });
  if (!workspace) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const membership = workspace.members.find((member) => member.userId === user.id)!;
  const usage = await getUsageStatus(workspace.organizationId);
  return NextResponse.json({
    workspace: {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      dictationEnabled: workspace.dictationEnabled,
      revision: workspace.revision,
      locale: workspace.locale,
      role: membership.role,
      canManage: user.isAdmin || membership.role === "OWNER" || membership.role === "ADMIN",
      readOnly: Boolean(workspace.organization.readOnlyAt) || (workspace.organization.plan === "TRIAL" && Boolean(workspace.organization.trialEndsAt && workspace.organization.trialEndsAt < new Date())),
    },
    columns: workspace.columns,
    members: workspace.members.map((member) => member.user),
    logs: workspace.updateLogs.map(({ cost: _cost, model: _model, ...log }) => log),
    quota: usage ? { percent: usage.percent, status: usage.status, resetsAt: usage.resetsAt } : null,
  });
}
