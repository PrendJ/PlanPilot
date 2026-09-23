import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { boardContext, isResponse } from "@/lib/api-context";
import { apiError } from "@/lib/errors";
import { seatAvailable } from "@/lib/invites";

/** Only board owners change roles or remove people. At least one owner always remains. */
export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string; userId: string }> }) {
  const { slug, userId } = await params;
  const ctx = await boardContext(request, slug, { manage: true });
  if (isResponse(ctx)) return ctx;
  if (ctx.role !== "OWNER") return apiError(request, "FORBIDDEN", 403);
  const parsed = z.object({ role: z.enum(["OWNER", "ADMIN", "MEMBER", "GUEST"]) }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError(request, "INVALID_INPUT", 400);
  const { workspace } = ctx;
  const target = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: workspace.id, userId } } });
  if (!target) return apiError(request, "NOT_FOUND", 404);
  if (
    target.role === "OWNER" &&
    parsed.data.role !== "OWNER" &&
    (await prisma.workspaceMember.count({ where: { workspaceId: workspace.id, role: "OWNER" } })) <= 1
  )
    return apiError(request, "LAST_OWNER", 400);
  // Promoting a guest takes a seat.
  if (target.role === "GUEST" && parsed.data.role !== "GUEST" && !(await seatAvailable(workspace.organization, userId)))
    return apiError(request, "MEMBER_LIMIT", 402);
  const membership = await prisma.$transaction(async tx => {
    const updated = await tx.workspaceMember.update({ where: { id: target.id }, data: { role: parsed.data.role } });
    if (parsed.data.role !== "GUEST")
      await tx.organizationMember.updateMany({
        where: { organizationId: workspace.organizationId, userId, role: "GUEST" },
        data: { role: "MEMBER" },
      });
    await tx.workspace.update({ where: { id: workspace.id }, data: { revision: { increment: 1 } } });
    return updated;
  });
  return NextResponse.json({ membership });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ slug: string; userId: string }> }) {
  const { slug, userId } = await params;
  // Owners remove people; anyone can leave a board by removing themselves.
  const ctx = await boardContext(request, slug, { mutation: true });
  if (isResponse(ctx)) return ctx;
  if (ctx.role !== "OWNER" && userId !== ctx.user.id) return apiError(request, "FORBIDDEN", 403);
  const { workspace } = ctx;
  const target = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: workspace.id, userId } } });
  if (!target) return apiError(request, "NOT_FOUND", 404);
  if (target.role === "OWNER" && (await prisma.workspaceMember.count({ where: { workspaceId: workspace.id, role: "OWNER" } })) <= 1)
    return apiError(request, "LAST_OWNER", 400);
  await prisma.$transaction(async tx => {
    await tx.workspaceMember.delete({ where: { id: target.id } });
    await tx.cardAssignee.deleteMany({ where: { userId, card: { workspaceId: workspace.id } } });
    // Leaving the last board of a team frees the seat (owners of the team are kept).
    const remaining = await tx.workspaceMember.count({ where: { userId, workspace: { organizationId: workspace.organizationId } } });
    if (!remaining)
      await tx.organizationMember.deleteMany({ where: { organizationId: workspace.organizationId, userId, role: { not: "OWNER" } } });
    await tx.workspace.update({ where: { id: workspace.id }, data: { revision: { increment: 1 } } });
  });
  return NextResponse.json({ ok: true });
}
