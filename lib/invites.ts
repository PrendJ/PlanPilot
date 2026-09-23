import { prisma } from "@/lib/prisma";
import { createOpaqueToken, hashToken } from "@/lib/auth";
import { appUrl, escapeHtml, renderEmail, sendEmail } from "@/lib/email";
import { getOrganizationLimits } from "@/lib/plans";

export const INVITE_DAYS = 7;
export const INVITE_ROLES = ["ADMIN", "MEMBER", "GUEST"] as const;

/** Seats are the paid places: guests (read + comment) never consume one. */
export async function usedSeats(organizationId: string) {
  return prisma.organizationMember.count({ where: { organizationId, role: { not: "GUEST" } } });
}

export async function seatAvailable(organization: Parameters<typeof getOrganizationLimits>[0] & { id: string }, userId?: string) {
  if (userId) {
    const existing = await prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: organization.id, userId } },
      select: { role: true },
    });
    if (existing && existing.role !== "GUEST") return true;
  }
  return (await usedSeats(organization.id)) < getOrganizationLimits(organization).memberLimit;
}

export async function sendInviteEmail(input: {
  request: Request;
  email: string;
  token: string;
  inviterName: string;
  workspaceName: string;
  role: string;
}) {
  const inviteUrl = appUrl(`/accept-invite?token=${encodeURIComponent(input.token)}`, input.request);
  const roleLine =
    input.role === "GUEST"
      ? "Potrai consultare la board e commentare le card."
      : "Potrai aggiornare la board a voce o per iscritto insieme al team.";
  await sendEmail({
    to: input.email,
    subject: `Invito a ${input.workspaceName} su BoardCue`,
    html: renderEmail({
      title: "Hai un invito su BoardCue",
      preheader: `${input.inviterName} ti ha invitato su BoardCue.`,
      paragraphs: [
        `${escapeHtml(input.inviterName)} ti ha invitato nella board <strong>${escapeHtml(input.workspaceName)}</strong>.`,
        roleLine,
      ],
      action: { label: "Accetta l’invito", href: inviteUrl },
      note: `Il link è valido per ${INVITE_DAYS} giorni.`,
    }),
  });
  return inviteUrl;
}

export function newInviteToken() {
  const token = createOpaqueToken();
  return { token, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + INVITE_DAYS * 86400000) };
}
