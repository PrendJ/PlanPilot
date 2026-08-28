import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, canManageWorkspace, createOpaqueToken, hashToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { workspaceForUser, workspaceReadOnly } from "@/lib/board";
import { getOrganizationLimits } from "@/lib/plans";
import { appUrl, escapeHtml, renderEmail, sendEmail } from "@/lib/email";
import { rateLimit, rejectCrossOrigin } from "@/lib/security";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Accedi per invitare un membro" }, { status: 401 });
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  const limited = rateLimit(`invite:${user.id}`, 20, 60 * 60_000);
  if (limited) return limited;
  const { slug } = await params;
  const workspace = await workspaceForUser(slug, user.id);
  if (!workspace || !(await canManageWorkspace(user.id, workspace.id, user.isAdmin))) return NextResponse.json({ error: "Non hai i permessi per invitare membri" }, { status: 403 });
  if (workspaceReadOnly(workspace)) return NextResponse.json({ error: "L’organizzazione è in sola lettura" }, { status: 423 });
  const parsed = z.object({ email: z.string().email(), role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER") }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Controlla l’indirizzo email" }, { status: 400 });
  const email = parsed.data.email.toLowerCase();
  const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  const alreadyInOrganization = existingUser ? await prisma.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: workspace.organizationId, userId: existingUser.id } }, select: { id: true } }) : null;
  const limit = getOrganizationLimits(workspace.organization).memberLimit;
  const members = await prisma.organizationMember.count({ where: { organizationId: workspace.organizationId } });
  if (!alreadyInOrganization && members >= limit) return NextResponse.json({ error: "Limite membri del piano raggiunto" }, { status: 402 });
  const token = createOpaqueToken();
  const invite = await prisma.workspaceInvite.create({ data: { organizationId: workspace.organizationId, workspaceId: workspace.id, invitedById: user.id, email, role: parsed.data.role, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 7 * 86400000) } });
  const inviteUrl = appUrl(`/accept-invite?token=${encodeURIComponent(token)}`, request);
  await sendEmail({ to: invite.email, subject: `Invito a ${workspace.name} su BoardCue`, html: renderEmail({ title: "Sei stato invitato", preheader: `${user.name} ti ha invitato su BoardCue.`, paragraphs: [`${escapeHtml(user.name)} ti ha invitato nel workspace <strong>${escapeHtml(workspace.name)}</strong>.`, "Accetta l’invito per entrare nel flusso di lavoro del team."], action: { label: "Accetta l’invito", href: inviteUrl }, note: "Il link è valido per 7 giorni." }) });
  return NextResponse.json({ invite: { id: invite.id, email: invite.email, role: invite.role, expiresAt: invite.expiresAt } }, { status: 201 });
}
