import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { appUrl, escapeHtml, renderEmail, sendEmail } from "@/lib/email";

export const NOTIFICATION_TYPES = ["ASSIGNED", "MENTIONED", "COMMENTED", "DUE_SOON", "OVERDUE"] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Created inside the same transaction as the change that caused it; never notifies the author. */
export async function notify(
  tx: Prisma.TransactionClient,
  input: {
    userIds: string[];
    type: NotificationType;
    workspaceId: string;
    cardId?: string;
    actorId?: string;
    payload: Prisma.InputJsonValue;
  },
) {
  const recipients = [...new Set(input.userIds)].filter(id => id && id !== input.actorId);
  if (!recipients.length) return;
  // Only people who can still open the board receive it.
  const members = await tx.workspaceMember.findMany({
    where: { workspaceId: input.workspaceId, userId: { in: recipients } },
    select: { userId: true },
  });
  if (!members.length) return;
  await tx.notification.createMany({
    data: members.map(member => ({
      userId: member.userId,
      type: input.type,
      workspaceId: input.workspaceId,
      cardId: input.cardId,
      actorId: input.actorId,
      payload: input.payload,
    })),
  });
}

/** Daily reminders for assigned cards due within 24 hours or overdue (once per card). */
export async function queueDueReminders(now = new Date()) {
  const soon = new Date(now.getTime() + 24 * 3600_000);
  const cards = await prisma.card.findMany({
    where: {
      archived: false,
      dueReminderSentAt: null,
      dueDate: { lte: soon, gte: new Date(now.getTime() - 7 * 86400000) },
      assignees: { some: {} },
      workspace: { lifecycleStatus: "ACTIVE" },
    },
    select: {
      id: true,
      title: true,
      dueDate: true,
      workspaceId: true,
      assignees: { select: { userId: true } },
      workspace: { select: { slug: true, name: true } },
    },
    take: 500,
  });
  let created = 0;
  for (const card of cards) {
    const claimed = await prisma.card.updateMany({ where: { id: card.id, dueReminderSentAt: null }, data: { dueReminderSentAt: now } });
    if (!claimed.count) continue;
    const type: NotificationType = card.dueDate && card.dueDate < now ? "OVERDUE" : "DUE_SOON";
    await prisma.notification.createMany({
      data: card.assignees.map(({ userId }) => ({
        userId,
        type,
        workspaceId: card.workspaceId,
        cardId: card.id,
        payload: {
          cardTitle: card.title,
          boardName: card.workspace.name,
          boardSlug: card.workspace.slug,
          dueDate: card.dueDate?.toISOString() ?? null,
        },
      })),
    });
    created += card.assignees.length;
  }
  return { created };
}

const LABELS: Record<NotificationType, string> = {
  ASSIGNED: "ti ha assegnato",
  MENTIONED: "ti ha menzionato in",
  COMMENTED: "ha commentato",
  DUE_SOON: "In scadenza",
  OVERDUE: "Scaduta",
};

export function notificationLine(type: string, payload: Record<string, unknown>, actorName?: string | null) {
  const title = String(payload.cardTitle || "");
  const board = String(payload.boardName || "");
  if (type === "DUE_SOON" || type === "OVERDUE") return `${LABELS[type as NotificationType]}: “${title}” · ${board}`;
  return `${actorName || "Qualcuno"} ${LABELS[type as NotificationType] || ""} “${title}” · ${board}`;
}

/** Daily digest: one email per person with unread notifications not yet emailed. Opt-out in account settings. */
export async function sendDigests(request: Request, now = new Date()) {
  const since = new Date(now.getTime() - 20 * 3600_000);
  const users = await prisma.user.findMany({
    where: {
      emailDigest: true,
      lifecycleStatus: "ACTIVE",
      emailVerifiedAt: { not: null },
      OR: [{ lastDigestAt: null }, { lastDigestAt: { lt: since } }],
      notifications: { some: { readAt: null, emailedAt: null } },
    },
    select: { id: true, email: true, name: true },
    take: 200,
  });
  let sent = 0;
  for (const user of users) {
    const claimed = await prisma.user.updateMany({
      where: { id: user.id, OR: [{ lastDigestAt: null }, { lastDigestAt: { lt: since } }] },
      data: { lastDigestAt: now },
    });
    if (!claimed.count) continue;
    const items = await prisma.notification.findMany({
      where: { userId: user.id, readAt: null, emailedAt: null },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    if (!items.length) continue;
    const actors = await prisma.user.findMany({
      where: { id: { in: items.map(item => item.actorId).filter((id): id is string => Boolean(id)) } },
      select: { id: true, name: true },
    });
    const names = new Map(actors.map(actor => [actor.id, actor.name]));
    const lines = items.map(
      item =>
        `• ${escapeHtml(notificationLine(item.type, item.payload as Record<string, unknown>, item.actorId ? names.get(item.actorId) : null))}`,
    );
    try {
      await sendEmail({
        to: user.email,
        subject: `BoardCue: ${items.length} novità per te`,
        html: renderEmail({
          title: "Le novità di oggi",
          preheader: `${items.length} aggiornamenti dalle tue board`,
          paragraphs: [`Ciao ${escapeHtml(user.name)},`, lines.join("<br>")],
          action: { label: "Apri BoardCue", href: appUrl("/app", request) },
          note: "Puoi disattivare il riepilogo giornaliero dalle impostazioni dell’account.",
        }),
      });
      await prisma.notification.updateMany({ where: { id: { in: items.map(item => item.id) } }, data: { emailedAt: now } });
      sent += 1;
    } catch (error) {
      console.error("Digest delivery failed", error);
      await prisma.user.update({ where: { id: user.id }, data: { lastDigestAt: null } });
    }
  }
  return { sent };
}
