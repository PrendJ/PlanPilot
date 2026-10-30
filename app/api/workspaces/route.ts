import { lockSpaceOrganization } from "@/lib/spaces";
import { spaceError } from "@/lib/space-errors";
import { safeJson } from "@/lib/security";
import { after, NextResponse } from "next/server";
import { notifyBoardSoftLimit } from "@/lib/board-soft-limit";
import { z } from "zod";
import { getApiUser, getOrganizationAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createWorkspace, SUPPORTED_LOCALES } from "@/lib/workspace";
import { getOrganizationLimits, organizationReadOnly } from "@/lib/plans";
import { canCreateWorkspaceInOrganization, ensureDefaultOrganization } from "@/lib/default-organization";
import { rejectCrossOrigin } from "@/lib/security";
import { apiError } from "@/lib/errors";

const schema = z.object({
  organizationId: z.string().cuid(),
  spaceId: z.string().cuid().optional(),
  name: z.string().trim().min(1).max(100),
  presetKey: z.enum(["GENERAL", "PERSONAL", "SOFTWARE", "MARKETING", "PROJECT", "CONSULTING"]).default("GENERAL"),
  locale: z.enum(SUPPORTED_LOCALES).default("it"),
});

export async function GET(request: Request) {
  const user = await getApiUser();
  if (!user) return apiError(request, "UNAUTHORIZED", 401);
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: user.id, workspace: { lifecycleStatus: "ACTIVE" } },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({
    workspaces: memberships.map(m => ({
      id: m.workspace.id,
      name: m.workspace.name,
      slug: m.workspace.slug,
      organizationId: m.workspace.organizationId,
      role: m.role,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getApiUser();
  if (!user) return apiError(request, "UNAUTHORIZED", 401);
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  const parsed = schema.safeParse(await safeJson(request));
  if (!parsed.success) return apiError(request, "INVALID_INPUT", 400);
  const body = parsed.data;
  const defaultOrganization = user.defaultOrganizationId ? null : await ensureDefaultOrganization(user.id);
  const membership = await getOrganizationAccess(user.id, body.organizationId);
  const defaultOrganizationId = user.defaultOrganizationId || defaultOrganization?.id || null;
  if (
    !membership ||
    membership.role === "GUEST" ||
    !canCreateWorkspaceInOrganization(defaultOrganizationId, body.organizationId, membership.role)
  )
    return apiError(request, "FORBIDDEN", 403);
  if (organizationReadOnly(membership.organization)) return apiError(request, "READ_ONLY", 423);
  const config = getOrganizationLimits(membership.organization);
  const count = await prisma.workspace.count({ where: { organizationId: body.organizationId, lifecycleStatus: "ACTIVE" } });
  if (count >= config.workspaceLimit)
    return apiError(request, "WORKSPACE_LIMIT", 402, { limit: config.workspaceLimit }, { limit: config.workspaceLimit });
  try {
    const input = { name: body.name, userId: user.id, organizationId: body.organizationId, presetKey: body.presetKey, locale: body.locale, spaceId: body.spaceId };
    const workspace = body.spaceId ? await prisma.$transaction(async tx => {
      await lockSpaceOrganization(tx, body.organizationId, user.id);
      if (!await tx.space.findFirst({ where: { id: body.spaceId, organizationId: body.organizationId } })) throw new Error("NOT_FOUND");
      return createWorkspace(input, tx);
    }) : await createWorkspace(input);
    const { boardSoftLimit } = config;
    if (boardSoftLimit !== null && count + 1 > boardSoftLimit)
      after(() =>
        notifyBoardSoftLimit({ organization: membership.organization, userId: user.id, activeBoards: count + 1, softLimit: boardSoftLimit }),
      );
    // Only what the client needs: model ids and key references stay on the server.
    return NextResponse.json(
      { workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug, organizationId: workspace.organizationId } },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Error && ["FORBIDDEN", "READ_ONLY", "NOT_FOUND"].includes(error.message)) return spaceError(request, error);
    console.error("Workspace creation failed", error);
    return apiError(request, "SERVER_ERROR", 500);
  }
}
