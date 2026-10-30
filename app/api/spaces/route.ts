import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiUser, twoFactorRequiredButMissing } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeJson, rejectCrossOrigin } from "@/lib/security";
import { apiError } from "@/lib/errors";
import { organizationReadOnly } from "@/lib/plans";
import { spaceError } from "@/lib/space-errors";
import { canManageSpaces, canUseSpaces, lockSpaceOrganization } from "@/lib/spaces";

export async function GET(request: Request) {
  const user = await getApiUser();
  if (!user) return apiError(request, "UNAUTHORIZED", 401);
  if (await twoFactorRequiredButMissing(user)) return apiError(request, "TWO_FACTOR_SETUP_REQUIRED", 403);
  const organizationId = new URL(request.url).searchParams.get("organizationId") || "";
  const access = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId: user.id } },
    include: { organization: true },
  });
  if (!access) return apiError(request, "FORBIDDEN", 403);
  const manager = canManageSpaces(access.role);
  const spaces = await prisma.space.findMany({
    where: { organizationId, ...(!manager && { members: { some: { userId: user.id } } }) },
    orderBy: { createdAt: "asc" },
    include: {
      members: { include: { user: { select: { name: true, email: true } } } },
      boards: { where: { lifecycleStatus: { not: "ARCHIVED" } }, select: { id: true, name: true, slug: true } },
    },
  });
  const members = manager
    ? await prisma.organizationMember.findMany({
        where: { organizationId, user: { lifecycleStatus: "ACTIVE" } },
        include: { user: { select: { name: true, email: true } } },
      })
    : [];
  const boards = manager
    ? await prisma.workspace.findMany({
        where: { organizationId, lifecycleStatus: "ACTIVE" },
        select: { id: true, name: true, spaceId: true },
      })
    : [];
  return NextResponse.json({
    spaces,
    members,
    boards,
    canManage: manager && canUseSpaces(access.organization.plan) && !organizationReadOnly(access.organization),
    enabled: canUseSpaces(access.organization.plan),
  });
}

export async function POST(request: Request) {
  const origin = rejectCrossOrigin(request);
  if (origin) return origin;
  const user = await getApiUser();
  if (!user) return apiError(request, "UNAUTHORIZED", 401);
  const parsed = z
    .object({ organizationId: z.string().cuid(), name: z.string().trim().min(1).max(100) })
    .safeParse(await safeJson(request));
  if (!parsed.success) return apiError(request, "INVALID_INPUT", 400);
  try {
    const space = await prisma.$transaction(async tx => {
      await lockSpaceOrganization(tx, parsed.data.organizationId, user.id);
      return tx.space.create({ data: { ...parsed.data, members: { create: { userId: user.id, role: "ADMIN" } } } });
    });
    return NextResponse.json({ space }, { status: 201 });
  } catch (error) {
    return spaceError(request, error);
  }
}
