import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  legalType: z.enum(["PERSONAL", "BUSINESS"]).optional(),
  readOnly: z.boolean().optional(),
  memberLimitOverride: z.number().int().min(1).max(100000).nullable().optional(),
  workspaceLimitOverride: z.number().int().min(1).max(100000).nullable().optional(),
  aiBudgetUsdOverride: z.number().min(0).max(1000000).nullable().optional(),
}).refine(value => Object.keys(value).length > 0);

export async function PATCH(request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const actor = await getCurrentUser(); if (!actor?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { organizationId } = await params; const parsed = schema.safeParse(await request.json().catch(() => ({}))); if (!parsed.success) return NextResponse.json({ error: "Aggiornamento non valido" }, { status: 400 });
  const before = await prisma.organization.findUnique({ where: { id: organizationId }, select: { plan: true, legalType: true, readOnlyAt: true, memberLimitOverride: true, workspaceLimitOverride: true, aiBudgetUsdOverride: true } }); if (!before) return NextResponse.json({ error: "Organizzazione non trovata" }, { status: 404 });
  const changesEntitlements = parsed.data.memberLimitOverride !== undefined || parsed.data.workspaceLimitOverride !== undefined || parsed.data.aiBudgetUsdOverride !== undefined;
  if (changesEntitlements && before.plan !== "ENTERPRISE") return NextResponse.json({ error: "I limiti personalizzati sono disponibili solo per Enterprise" }, { status: 400 });
  const organization = await prisma.$transaction(async (tx) => {
    const updated = await tx.organization.update({ where: { id: organizationId }, data: { legalType: parsed.data.legalType, ...(parsed.data.readOnly !== undefined && { readOnlyAt: parsed.data.readOnly ? new Date() : null, deleteAfter: parsed.data.readOnly ? undefined : null }), ...(parsed.data.memberLimitOverride !== undefined && { memberLimitOverride: parsed.data.memberLimitOverride }), ...(parsed.data.workspaceLimitOverride !== undefined && { workspaceLimitOverride: parsed.data.workspaceLimitOverride }), ...(parsed.data.aiBudgetUsdOverride !== undefined && { aiBudgetUsdOverride: parsed.data.aiBudgetUsdOverride }) } });
    await tx.adminAuditEvent.create({ data: { actorId: actor.id, action: "ORGANIZATION_UPDATED", targetType: "ORGANIZATION", targetId: organizationId, metadata: { before, changes: parsed.data } } });
    return updated;
  });
  return NextResponse.json({ organization });
}
