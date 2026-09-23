import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { dispatchProjectPush } from "@/lib/push";
import { dispatchWebhooks } from "@/lib/webhooks";

/** Every minute: push notifications and outgoing webhooks (both leased outboxes). */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret || ""}`);
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  try {
    const [push, webhooks] = await Promise.all([dispatchProjectPush(), dispatchWebhooks()]);
    return NextResponse.json({ ...push, webhooks }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Invio temporaneamente non disponibile." }, { status: 503 });
  }
}
