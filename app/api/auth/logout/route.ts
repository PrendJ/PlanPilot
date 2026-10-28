import { safeJson } from "@/lib/security";
import { rejectCrossOrigin } from "@/lib/security";
import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth";

export async function POST(request: Request) {
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  const body = await safeJson(request);
  await clearSession(body.all === true);
  return NextResponse.json({ ok: true }, { headers: { "Clear-Site-Data": '"cache", "storage"', "Cache-Control": "no-store" } });
}
