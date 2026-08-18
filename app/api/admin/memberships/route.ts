import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

async function requireAdmin() {
  const user = await getCurrentUser();
  return user?.isAdmin ? user : null;
}

export async function POST(request: Request) {
  const actor = await requireAdmin(); if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = z.object({ userId: z.string().cuid(), workspaceId: z.string().cuid(), role: z.enum(["OWNER", "ADMIN", "MEMBER"]).default("MEMBER") }).safeParse(await request.json().catch(() => ({}))); if (!parsed.success) return NextResponse.json({ error: "Utente, workspace e ruolo validi sono richiesti" }, { status: 400 });
  const { userId, workspaceId, role } = parsed.data;
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { organizationId: true } }); if (!workspace || !(await prisma.user.findUnique({ where: { id: userId }, select: { id: true } }))) return NextResponse.json({ error: "Utente o workspace non trovato" }, { status: 404 });
  const membership = await prisma.$transaction(async (tx) => { await tx.organizationMember.upsert({ where: { organizationId_userId: { organizationId: workspace.organizationId, userId } }, create: { organizationId: workspace.organizationId, userId, role: role === "OWNER" ? "ADMIN" : role }, update: {} }); const result = await tx.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId, userId } },
    update: { role },
    create: { workspaceId, userId, role },
    include: { user: { select: { id: true, name: true, email: true } }, workspace: { select: { id: true, name: true, slug: true } } },
  }); await tx.adminAuditEvent.create({ data: { actorId: actor.id, action: "WORKSPACE_MEMBERSHIP_UPSERTED", targetType: "USER", targetId: userId, metadata: { workspaceId, role } } }); return result; });
  return NextResponse.json({ membership });
}

export async function DELETE(request: Request) {
  const actor = await requireAdmin(); if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = z.object({ userId: z.string().cuid(), workspaceId: z.string().cuid() }).safeParse(await request.json().catch(() => ({}))); if (!parsed.success) return NextResponse.json({ error: "Utente e workspace richiesti" }, { status: 400 }); const { userId, workspaceId } = parsed.data;
  const target = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } }); if (!target) return NextResponse.json({ ok: true });
  if (target.role === "OWNER" && await prisma.workspaceMember.count({ where: { workspaceId, role: "OWNER" } }) <= 1) return NextResponse.json({ error: "L'ultimo owner non può essere rimosso" }, { status: 400 });
  await prisma.$transaction([prisma.workspaceMember.delete({ where: { id: target.id } }), prisma.adminAuditEvent.create({ data: { actorId: actor.id, action: "WORKSPACE_MEMBERSHIP_REMOVED", targetType: "USER", targetId: userId, metadata: { workspaceId } } })]);
  return NextResponse.json({ ok: true });
}
