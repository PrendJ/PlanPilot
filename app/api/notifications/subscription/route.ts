import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/auth";
import { pushConfig, pushSubscriptionSchema } from "@/lib/push-config";
import { rateLimit, rejectCrossOrigin, safeJson } from "@/lib/security";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Accedi per gestire le notifiche." }, { status: 401 });
  const config = pushConfig();
  const subscribed = config
    ? Boolean(await prisma.pushSubscription.findFirst({ where: { sessionId: session.id }, select: { id: true } }))
    : false;
  return NextResponse.json(
    { enabled: Boolean(config), publicKey: config?.publicKey || null, subscribed },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const origin = rejectCrossOrigin(request);
  if (origin) return origin;
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Accedi per attivare le notifiche." }, { status: 401 });
  if (!pushConfig()) return NextResponse.json({ error: "Notifiche non ancora configurate." }, { status: 503 });
  const limited = await rateLimit(`push:${session.id}`, 10, 60000, request);
  if (limited) return limited;
  const parsed = pushSubscriptionSchema.safeParse(await safeJson(request));
  if (!parsed.success) return NextResponse.json({ error: "Iscrizione non valida." }, { status: 400 });
  try {
    await prisma.$transaction(async tx => {
      // One subscription per browser session; endpoint ownership cannot cross accounts.
      await tx.$queryRaw`SELECT "id" FROM "Session" WHERE "id" = ${session.id} FOR UPDATE`;
      const existing = await tx.pushSubscription.findFirst({
        where: { endpoint: parsed.data.endpoint, session: { userId: session.userId } },
      });
      if (existing?.sessionId === session.id && existing.p256dh === parsed.data.keys.p256dh && existing.auth === parsed.data.keys.auth)
        return;
      await tx.pushSubscription.deleteMany({ where: { sessionId: session.id, ...(existing ? { id: { not: existing.id } } : {}) } });
      if (existing) await tx.pushSubscription.update({ where: { id: existing.id }, data: { sessionId: session.id, ...parsed.data.keys } });
      else await tx.pushSubscription.create({ data: { sessionId: session.id, endpoint: parsed.data.endpoint, ...parsed.data.keys } });
    });
    return NextResponse.json({ subscribed: true });
  } catch {
    return NextResponse.json({ error: "Impossibile attivare le notifiche. Disattivale nel browser e riprova." }, { status: 409 });
  }
}

export async function DELETE(request: Request) {
  const origin = rejectCrossOrigin(request);
  if (origin) return origin;
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Accedi per gestire le notifiche." }, { status: 401 });
  await prisma.pushSubscription.deleteMany({ where: { sessionId: session.id } });
  return NextResponse.json({ subscribed: false });
}
