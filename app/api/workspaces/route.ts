import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, getOrganizationAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createWorkspace, SUPPORTED_LOCALES } from "@/lib/workspace";
import { getOrganizationLimits, organizationReadOnly } from "@/lib/plans";
import { canCreateWorkspaceInOrganization, ensureDefaultOrganization } from "@/lib/default-organization";
import { rejectCrossOrigin } from "@/lib/security";
import { apiError } from "@/lib/errors";

const schema = z.object({
  organizationId: z.string().cuid(),
  name: z.string().trim().min(1).max(100),
  presetKey: z.enum(["GENERAL", "SOFTWARE", "MARKETING", "PROJECT", "CONSULTING"]).default("GENERAL"),
  locale: z.enum(SUPPORTED_LOCALES).default("it"),
});

export async function GET(request: Request) {
  const user = await getCurrentUser();
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
  const user = await getCurrentUser();
  if (!user) return apiError(request, "UNAUTHORIZED", 401);
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
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
  if (count >= config.workspaceLimit) return apiError(request, "WORKSPACE_LIMIT", 402);
  try {
    const workspace = await createWorkspace({
      name: body.name,
      userId: user.id,
      organizationId: body.organizationId,
      presetKey: body.presetKey,
      locale: body.locale,
    });
    return NextResponse.json({ workspace }, { status: 201 });
  } catch (error) {
    console.error("Workspace creation failed", error);
    return apiError(request, "SERVER_ERROR", 500);
  }
}
