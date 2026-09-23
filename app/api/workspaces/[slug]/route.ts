import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { organizationReadOnly } from "@/lib/plans";
import { canManageWorkspaceAction, workspaceLifecycleChange } from "@/lib/workspace-management";
import { getCurrentUser } from "@/lib/auth";
import { rejectCrossOrigin } from "@/lib/security";
import { apiError } from "@/lib/errors";
import { PLANNING_MODELS } from "@/lib/ai-config";
import { SUPPORTED_LOCALES } from "@/lib/workspace";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("rename"), name: z.string().trim().min(1).max(100) }),
  z.object({ action: z.literal("archive") }),
  z.object({ action: z.literal("restore") }),
  z.object({
    action: z.literal("settings"),
    name: z.string().trim().min(1).max(100).optional(),
    locale: z.enum(SUPPORTED_LOCALES).optional(),
    dictationEnabled: z.boolean().optional(),
    planModel: z.enum(PLANNING_MODELS.map(model => model.id) as [string, ...string[]]).optional(),
  }),
]);

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser();
  if (!user) return apiError(request, "UNAUTHORIZED", 401);
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError(request, "INVALID_INPUT", 400);
  const { slug } = await params;
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id, workspace: { slug } },
    include: { workspace: { include: { organization: true } } },
  });
  if (!membership) return apiError(request, "NOT_FOUND", 404);
  const action = parsed.data.action === "settings" ? "rename" : parsed.data.action;
  if (!canManageWorkspaceAction(membership.role, action)) return apiError(request, "FORBIDDEN", 403);
  if (organizationReadOnly(membership.workspace.organization)) return apiError(request, "READ_ONLY", 423);
  if (parsed.data.action === "restore" && membership.workspace.lifecycleStatus !== "ARCHIVED")
    return apiError(request, "INVALID_INPUT", 409);
  if (parsed.data.action !== "restore" && membership.workspace.lifecycleStatus !== "ACTIVE") return apiError(request, "READ_ONLY", 409);
  const before = {
    name: membership.workspace.name,
    lifecycleStatus: membership.workspace.lifecycleStatus,
    locale: membership.workspace.locale,
    dictationEnabled: membership.workspace.dictationEnabled,
    planModel: membership.workspace.planModel,
  };
  const data =
    parsed.data.action === "rename"
      ? { name: parsed.data.name }
      : parsed.data.action === "settings"
        ? {
            ...(parsed.data.name && { name: parsed.data.name }),
            ...(parsed.data.locale && { locale: parsed.data.locale }),
            ...(parsed.data.dictationEnabled !== undefined && { dictationEnabled: parsed.data.dictationEnabled }),
            ...(parsed.data.planModel && { planModel: parsed.data.planModel }),
          }
        : workspaceLifecycleChange(parsed.data.action);
  const workspace = await prisma.$transaction(async tx => {
    const updated = await tx.workspace.update({
      where: { id: membership.workspaceId },
      data: { ...data, revision: { increment: 1 } },
      select: { id: true, name: true, slug: true, lifecycleStatus: true, locale: true, dictationEnabled: true, planModel: true },
    });
    await tx.activityEvent.create({
      data: {
        organizationId: membership.workspace.organizationId,
        workspaceId: membership.workspaceId,
        userId: user.id,
        type: parsed.data.action === "settings" ? "WORKSPACE_SETTINGS_UPDATED" : `WORKSPACE_${parsed.data.action.toUpperCase()}D`,
        entityType: "WORKSPACE",
        entityId: membership.workspaceId,
        beforeState: before,
        afterState: {
          name: updated.name,
          lifecycleStatus: updated.lifecycleStatus,
          locale: updated.locale,
          dictationEnabled: updated.dictationEnabled,
          planModel: updated.planModel,
        },
        undoable: false,
      },
    });
    return updated;
  });
  return NextResponse.json({ workspace });
}
