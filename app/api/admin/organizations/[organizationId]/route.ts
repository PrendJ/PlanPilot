import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({ plan: z.enum(["TRIAL", "SOLO", "TEAM", "STUDIO", "LIFETIME", "ENTERPRISE"]).optional(), legalType: z.enum(["PERSONAL", "BUSINESS"]).optional(), readOnly: z.boolean().optional() });

export async function PATCH(request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const actor = await getCurrentUser(); if (!actor?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { organizationId } = await params; const parsed = schema.safeParse(await request.json().catch(() => ({}))); if (!parsed.success) return NextResponse.json({ error: "Aggiornamento non valido" }, { status: 400 });
  const before = await prisma.organization.findUnique({ where: { id: organizationId }, select: { plan: true, legalType: true, readOnlyAt: true } }); if (!before) return NextResponse.json({ error: "Organizzazione non trovata" }, { status: 404 });
  const organization = await prisma.$transaction(async (tx) => {
    const updated = await tx.organization.update({ where: { id: organizationId }, data: { plan: parsed.data.plan, legalType: parsed.data.legalType, ...(parsed.data.readOnly !== undefined && { readOnlyAt: parsed.data.readOnly ? new Date() : null, deleteAfter: parsed.data.readOnly ? undefined : null }), ...(parsed.data.plan === "LIFETIME" && { trialEndsAt: null, readOnlyAt: null, deleteAfter: null }) } });
    await tx.adminAuditEvent.create({ data: { actorId: actor.id, action: "ORGANIZATION_UPDATED", targetType: "ORGANIZATION", targetId: organizationId, metadata: { before, changes: parsed.data } } });
    return updated;
  });
  return NextResponse.json({ organization });
}
