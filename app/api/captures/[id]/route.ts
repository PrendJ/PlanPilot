import { NextResponse } from "next/server";
import { getCurrentUser, twoFactorRequiredButMissing } from "@/lib/auth";
import { apiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { rejectCrossOrigin } from "@/lib/security";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return apiError(request, "UNAUTHORIZED", 401);
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  if (await twoFactorRequiredButMissing(user)) return apiError(request, "TWO_FACTOR_SETUP_REQUIRED", 403);
  const { id } = await params;
  await prisma.externalCapture.deleteMany({ where: { id, userId: user.id } });
  return NextResponse.json({ ok: true });
}
