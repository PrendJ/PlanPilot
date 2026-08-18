import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enableAutomaticUsdToEurRate, getUsdToEurRate, refreshUsdToEurRate, setManualUsdToEurRate } from "@/lib/exchange-rate";

const schema = z.object({ mode: z.enum(["AUTO", "MANUAL"]), usdToEur: z.number().finite().optional(), refresh: z.boolean().optional() });

async function requireAdmin() {
  const user = await getCurrentUser();
  return user?.isAdmin ? user : null;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await getUsdToEurRate());
}

export async function PATCH(request: Request) {
  const actor = await requireAdmin();
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success || (parsed.data.mode === "MANUAL" && parsed.data.usdToEur === undefined)) return NextResponse.json({ error: "Indica una modalità e, per il manuale, un cambio valido." }, { status: 400 });
  try {
    const status = parsed.data.mode === "MANUAL"
      ? await setManualUsdToEurRate(parsed.data.usdToEur!, actor.id)
      : parsed.data.refresh ? await enableAutomaticUsdToEurRate() : await enableAutomaticUsdToEurRate();
    await prisma.adminAuditEvent.create({ data: { actorId: actor.id, action: parsed.data.mode === "MANUAL" ? "EXCHANGE_RATE_MANUAL_SET" : "EXCHANGE_RATE_AUTO_ENABLED", targetType: "ECONOMICS", targetId: "usd-eur", metadata: { usdToEur: status.usdToEur, source: status.source } } });
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Aggiornamento non riuscito" }, { status: 400 });
  }
}

export async function POST() {
  const actor = await requireAdmin();
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const status = await refreshUsdToEurRate();
  await prisma.adminAuditEvent.create({ data: { actorId: actor.id, action: "EXCHANGE_RATE_REFRESHED", targetType: "ECONOMICS", targetId: "usd-eur", metadata: { usdToEur: status.usdToEur, source: status.source } } });
  return NextResponse.json(status);
}
