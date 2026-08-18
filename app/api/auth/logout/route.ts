import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  await clearSession(body.all === true);
  return NextResponse.json({ ok: true });
}
