import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { dispatchProjectPush } from "@/lib/push";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret || ""}`);
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  try { return NextResponse.json(await dispatchProjectPush(), { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ error: "Invio temporaneamente non disponibile." }, { status: 503 }); }
}
