import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, rateLimit, rejectCrossOrigin } from "@/lib/security";
import { completeTwoFactor } from "@/lib/two-factor";
import { apiError } from "@/lib/errors";

export async function POST(request: Request) {
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  const limited = await rateLimit(`2fa:${clientIp(request)}`, 15, 15 * 60_000, request);
  if (limited) return limited;
  const parsed = z.object({ code: z.string().trim().min(6).max(20) }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError(request, "TWO_FACTOR_INVALID", 400);
  const result = await completeTwoFactor(parsed.data.code);
  if (!result.ok)
    return apiError(request, result.reason === "EXPIRED" ? "UNAUTHORIZED" : "TWO_FACTOR_INVALID", 401, {
      expired: result.reason === "EXPIRED",
    });
  return NextResponse.json({ ok: true });
}
