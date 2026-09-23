import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rejectCrossOrigin } from "@/lib/security";
import { apiError } from "@/lib/errors";

export async function DELETE(request: Request, { params }: { params: Promise<{ tokenId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return apiError(request, "UNAUTHORIZED", 401);
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  const { tokenId } = await params;
  const revoked = await prisma.apiToken.updateMany({
    where: { id: tokenId, userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (!revoked.count) return apiError(request, "NOT_FOUND", 404);
  return NextResponse.json({ ok: true });
}
