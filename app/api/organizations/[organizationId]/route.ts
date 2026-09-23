import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, getOrganizationAccess, isVerified } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rejectCrossOrigin } from "@/lib/security";
import { apiError } from "@/lib/errors";
import { getOrganizationLimits } from "@/lib/plans";

/** Team settings: name, and (plans with 2FA enforcement) require two-step verification for everyone. */
export async function PATCH(request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return apiError(request, "UNAUTHORIZED", 401);
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  const { organizationId } = await params;
  const access = await getOrganizationAccess(user.id, organizationId);
  if (!access || access.role !== "OWNER") return apiError(request, "OWNER_ONLY", 403);
  const parsed = z
    .object({ name: z.string().trim().min(2).max(100).optional(), require2fa: z.boolean().optional() })
    .safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError(request, "INVALID_INPUT", 400);
  if (parsed.data.require2fa !== undefined) {
    if (!getOrganizationLimits(access.organization).enforce2fa) return apiError(request, "FORBIDDEN", 403);
    // The owner must be protected before protecting everyone else.
    if (parsed.data.require2fa && !user.totpEnabledAt) return apiError(request, "TWO_FACTOR_SETUP_REQUIRED", 409);
  }
  const organization = await prisma.organization.update({
    where: { id: organizationId },
    data: parsed.data,
    select: { id: true, name: true, require2fa: true },
  });
  return NextResponse.json({ organization });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return apiError(request, "UNAUTHORIZED", 401);
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  if (!isVerified(user)) return apiError(request, "EMAIL_NOT_VERIFIED", 403);
  const { organizationId } = await params;
  const access = await getOrganizationAccess(user.id, organizationId);
  if (!access || access.role !== "OWNER") return apiError(request, "OWNER_ONLY", 403);
  const parsed = z.object({ password: z.string().min(1), confirmSlug: z.string() }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success || parsed.data.confirmSlug !== access.organization.slug) return apiError(request, "INVALID_INPUT", 400);
  if (!(await bcrypt.compare(parsed.data.password, user.passwordHash))) return apiError(request, "INVALID_CREDENTIALS", 403);
  if (user.defaultOrganizationId === organizationId) return apiError(request, "FORBIDDEN", 409);
  await prisma.organization.delete({ where: { id: organizationId } });
  return NextResponse.json({ ok: true });
}
