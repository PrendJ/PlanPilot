import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, getOrganizationAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rejectCrossOrigin } from "@/lib/security";
import { apiError } from "@/lib/errors";
import { LOCALE_COOKIE } from "@/lib/i18n/core";

const schema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  locale: z.enum(["it", "en"]).optional(),
  autoApplyAi: z.boolean().optional(),
  autoSendDictation: z.boolean().optional(),
  emailDigest: z.boolean().optional(),
  defaultOrganizationId: z.string().cuid().optional(),
});

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return apiError(request, "UNAUTHORIZED", 401);
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError(request, "INVALID_INPUT", 400);
  const { defaultOrganizationId, ...rest } = parsed.data;
  if (defaultOrganizationId && !(await getOrganizationAccess(user.id, defaultOrganizationId))) return apiError(request, "FORBIDDEN", 403);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { ...rest, ...(defaultOrganizationId && { defaultOrganizationId }) },
    select: { name: true, locale: true, autoApplyAi: true, autoSendDictation: true, emailDigest: true, defaultOrganizationId: true },
  });
  const response = NextResponse.json({ user: updated });
  if (rest.locale) response.cookies.set(LOCALE_COOKIE, rest.locale, { path: "/", sameSite: "lax", maxAge: 365 * 86400 });
  return response;
}
