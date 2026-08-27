import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, hashToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rejectCrossOrigin } from "@/lib/security";

export async function POST(request: Request) {
  const originError = rejectCrossOrigin(request); if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Accedi con l’indirizzo che ha ricevuto l’invito." }, { status: 401 });
  const parsed = z.object({ token: z.string().min(20) }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invito non valido." }, { status: 400 });
  const invite = await prisma.workspaceInvite.findUnique({ where: { tokenHash: hashToken(parsed.data.token) }, include: { workspace: { select: { slug: true } } } });
  if (!invite || invite.revokedAt || invite.acceptedAt || invite.expiresAt < new Date()) return NextResponse.json({ error: "Questo invito è scaduto o è già stato usato. Chiedine uno nuovo." }, { status: 400 });
  if (invite.email !== user.email.toLowerCase()) return NextResponse.json({ error: `Questo invito è destinato a un altro indirizzo. Sei connesso come ${user.email}.` }, { status: 403 });
  await prisma.$transaction(async transaction => {
    await transaction.organizationMember.upsert({ where: { organizationId_userId: { organizationId: invite.organizationId, userId: user.id } }, create: { organizationId: invite.organizationId, userId: user.id, role: "MEMBER" }, update: {} });
    if (invite.workspaceId) await transaction.workspaceMember.upsert({ where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId: user.id } }, create: { workspaceId: invite.workspaceId, userId: user.id, role: invite.role }, update: { role: invite.role } });
    await transaction.workspaceInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
  });
  return NextResponse.json({ ok: true, destination: invite.workspace ? `/app/${invite.workspace.slug}` : "/app" });
}
