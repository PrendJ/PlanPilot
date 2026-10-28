import { safeJson } from "@/lib/security";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiUser, isVerified, newApiToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rejectCrossOrigin } from "@/lib/security";
import { apiError } from "@/lib/errors";

export async function GET(request: Request) {
  const user = await getApiUser();
  if (!user) return apiError(request, "UNAUTHORIZED", 401);
  const tokens = await prisma.apiToken.findMany({
    where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, prefix: true, lastUsedAt: true, expiresAt: true, access: true, createdAt: true },
  });
  return NextResponse.json({ tokens });
}

/** The full token is returned once; only its hash is stored. */
export async function POST(request: Request) {
  const user = await getApiUser();
  if (!user) return apiError(request, "UNAUTHORIZED", 401);
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  if (!isVerified(user)) return apiError(request, "EMAIL_NOT_VERIFIED", 403);
  const parsed = z.object({ name: z.string().trim().min(1).max(60), access: z.enum(["read", "write"]).default("write") }).safeParse(await safeJson(request));
  if (!parsed.success) return apiError(request, "INVALID_INPUT", 400);
  if ((await prisma.apiToken.count({ where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } } })) >= 10) return apiError(request, "INVALID_INPUT", 400);
  const { token, prefix, tokenHash } = newApiToken();
  const created = await prisma.apiToken.create({
    data: { userId: user.id, name: parsed.data.name, access: parsed.data.access, prefix, tokenHash },
    select: { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true, expiresAt: true, access: true },
  });
  return NextResponse.json({ token: created, secret: token }, { status: 201 });
}
