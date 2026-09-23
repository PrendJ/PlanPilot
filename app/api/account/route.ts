import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { clearSession, getCurrentUser } from "@/lib/auth";
import { rejectCrossOrigin } from "@/lib/security";
import { apiError } from "@/lib/errors";
import { deleteOwnAccount } from "@/lib/account";

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return apiError(request, "UNAUTHORIZED", 401);
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  const parsed = z.object({ password: z.string().min(1).max(200) }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError(request, "INVALID_INPUT", 400);
  if (!(await bcrypt.compare(parsed.data.password, user.passwordHash))) return apiError(request, "INVALID_CREDENTIALS", 400);
  const result = await deleteOwnAccount(user.id);
  await clearSession();
  return NextResponse.json({ ok: true, ...result });
}
