import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { classifyOwnedOrganizations, validInternalOwner } from "@/lib/lifecycle-policy";
import { appUrl, escapeHtml, renderEmail, sendEmail } from "@/lib/email";
import { issueVerificationEmail } from "@/lib/verification";
import { UNVERIFIED_GRACE_DAYS } from "@/lib/auth";

const THIRTY_DAYS = 30 * 86400000;
const TEN_YEARS = 3652 * 86400000;

type Subject = "user" | "organization" | "workspace";
type Action = "suspend" | "reactivate" | "archive";

function deletionDate() {
  return new Date(Date.now() + THIRTY_DAYS);
}
function retentionDate() {
  return new Date(Date.now() + TEN_YEARS);
}

async function audit(
  actorId: string,
  action: string,
  subjectType: string,
  subjectId: string,
  reason: string,
  metadata?: Prisma.InputJsonValue,
) {
  await prisma.adminAuditEvent.create({
    data: { actorId, action, targetType: subjectType, targetId: subjectId, metadata: { reason, metadata } },
  });
}

async function archiveOrganization(organizationId: string, now: Date) {
  await prisma.$transaction([
    prisma.organization.update({
      where: { id: organizationId },
      data: { lifecycleStatus: "ARCHIVED", archivedAt: now, deleteAfter: deletionDate(), readOnlyAt: now },
    }),
    prisma.workspace.updateMany({
      where: { organizationId },
      data: { lifecycleStatus: "ARCHIVED", archivedAt: now, deleteAfter: deletionDate() },
    }),
  ]);
}

async function restoreOrganization(organizationId: string) {
  await prisma.$transaction([
    prisma.organization.update({
      where: { id: organizationId },
      data: { lifecycleStatus: "ACTIVE", suspendedAt: null, archivedAt: null, deleteAfter: null, readOnlyAt: null },
    }),
    prisma.workspace.updateMany({
      where: { organizationId, lifecycleStatus: "ARCHIVED" },
      data: { lifecycleStatus: "ACTIVE", suspendedAt: null, archivedAt: null, deleteAfter: null },
    }),
  ]);
}

/** Lifecycle transitions deliberately operate on metadata only: no staff endpoint reads board content. */
export async function changeLifecycle(input: {
  subject: Subject;
  id: string;
  action: Action;
  reason: string;
  actorId: string;
  transferSupportUserId?: string;
}) {
  const now = new Date();
  if (input.action === "archive") {
    if (input.subject === "organization") {
      const organization = await prisma.organization.findUnique({ where: { id: input.id }, select: { id: true } });
      if (!organization) throw new Error("Organization not found");
      await archiveOrganization(input.id, now);
    } else if (input.subject === "workspace") {
      const workspace = await prisma.workspace.findUnique({ where: { id: input.id }, select: { id: true } });
      if (!workspace) throw new Error("Workspace not found");
      await prisma.workspace.update({
        where: { id: input.id },
        data: { lifecycleStatus: "ARCHIVED", archivedAt: now, deleteAfter: deletionDate() },
      });
    } else {
      const user = await prisma.user.findUnique({ where: { id: input.id }, select: { id: true, defaultOrganizationId: true } });
      if (!user) throw new Error("User not found");
      if (user.id === input.actorId) throw new Error("Non puoi eliminare il tuo account superadmin");
      const owned = await prisma.organization.findMany({
        where: { createdById: input.id, lifecycleStatus: "ACTIVE" },
        select: { id: true, name: true, legalType: true },
      });
      const { businessToTransfer: businessOwned, organizationsToArchive } = classifyOwnedOrganizations(user.defaultOrganizationId, owned);
      if (businessOwned.length && !input.transferSupportUserId)
        throw new Error("Seleziona un nuovo Owner interno per le organizzazioni business");
      if (businessOwned.length && input.transferSupportUserId) {
        const replacement = await prisma.user.findUnique({
          where: { id: input.transferSupportUserId },
          select: { id: true, platformRole: true, lifecycleStatus: true },
        });
        if (!replacement || !validInternalOwner(replacement, user.id))
          throw new Error("Il nuovo Owner deve essere un Support o Superadmin attivo");
        for (const organization of businessOwned) {
          await prisma.$transaction([
            prisma.organization.update({ where: { id: organization.id }, data: { createdById: replacement.id } }),
            prisma.organizationMember.upsert({
              where: { organizationId_userId: { organizationId: organization.id, userId: replacement.id } },
              create: { organizationId: organization.id, userId: replacement.id, role: "OWNER" },
              update: { role: "OWNER" },
            }),
            prisma.organizationMember.deleteMany({ where: { organizationId: organization.id, userId: user.id } }),
            prisma.workspaceMember.deleteMany({ where: { userId: user.id, workspace: { organizationId: organization.id } } }),
          ]);
          await audit(input.actorId, "OWNERSHIP_TRANSFERRED", "organization", organization.id, input.reason, {
            previousOwnerId: user.id,
            newOwnerId: replacement.id,
          });
        }
      }
      for (const organization of organizationsToArchive) await archiveOrganization(organization.id, now);
      await prisma.$transaction([
        prisma.user.update({
          where: { id: input.id },
          data: { lifecycleStatus: "ARCHIVED", archivedAt: now, deleteAfter: deletionDate() },
        }),
        prisma.session.deleteMany({ where: { userId: input.id } }),
      ]);
    }
  } else if (input.action === "reactivate") {
    if (input.subject === "organization") await restoreOrganization(input.id);
    if (input.subject === "workspace")
      await prisma.workspace.update({
        where: { id: input.id },
        data: { lifecycleStatus: "ACTIVE", suspendedAt: null, archivedAt: null, deleteAfter: null },
      });
    if (input.subject === "user") {
      const user = await prisma.user.findUnique({ where: { id: input.id }, select: { defaultOrganizationId: true } });
      if (!user) throw new Error("User not found");
      await prisma.user.update({
        where: { id: input.id },
        data: { lifecycleStatus: "ACTIVE", suspendedAt: null, archivedAt: null, deleteAfter: null },
      });
      if (user.defaultOrganizationId) {
        const organization = await prisma.organization.findUnique({
          where: { id: user.defaultOrganizationId },
          select: { lifecycleStatus: true },
        });
        if (organization?.lifecycleStatus === "ARCHIVED") await restoreOrganization(user.defaultOrganizationId);
      }
    }
  } else {
    const data = { lifecycleStatus: "SUSPENDED" as const, suspendedAt: now };
    if (input.subject === "organization") await prisma.organization.update({ where: { id: input.id }, data });
    if (input.subject === "workspace") await prisma.workspace.update({ where: { id: input.id }, data });
    if (input.subject === "user")
      await prisma.$transaction([
        prisma.user.update({ where: { id: input.id }, data }),
        prisma.session.deleteMany({ where: { userId: input.id } }),
      ]);
  }
  await audit(input.actorId, `LIFECYCLE_${input.action.toUpperCase()}`, input.subject, input.id, input.reason, {
    transferSupportUserId: input.transferSupportUserId,
  });
}

async function retain(subjectType: string, subjectId: string, kind: string, payload: Prisma.InputJsonValue) {
  await prisma.retainedRecord.create({ data: { subjectType, subjectId, kind, payload, expiresAt: retentionDate() } });
}

const DAY = 86400000;
const TRIAL_NUDGES = [
  {
    step: 1,
    afterStartDays: 3,
    subject: "Tre modi per sfruttare BoardCue",
    title: "Come stai usando BoardCue?",
    body: [
      "Il modo più veloce per tenere la board aggiornata è parlarle: premi il microfono e racconta cosa hai finito, cosa è bloccato e cosa viene dopo.",
      "Prima di applicare qualcosa vedi sempre l’anteprima delle modifiche, e puoi annullare con un clic.",
    ],
  },
  {
    step: 2,
    beforeEndDays: 2,
    subject: "La prova di BoardCue termina tra 2 giorni",
    title: "Mancano 2 giorni",
    body: [
      "La tua prova di BoardCue Pro termina tra due giorni.",
      "Scegli un piano per continuare a lavorare senza interruzioni. Se non lo fai, le board resteranno consultabili ed esportabili in sola lettura: non cancelliamo nulla.",
    ],
  },
] as const;

/** Runs from the protected cron endpoint. All send flags are claimed before delivery to avoid duplicate emails. */
export async function runAccountEmailLifecycle(request: Request) {
  const now = new Date();
  const graceMs = UNVERIFIED_GRACE_DAYS * DAY;
  const deletionCutoff = new Date(now.getTime() - graceMs);
  let verificationReminders = 0;
  let deletedUnverifiedAccounts = 0;
  let trialNudges = 0;
  let trialExpirationEmails = 0;

  // Reminders on day 1 and day 5 of the 7-day verification window.
  const pendingVerification = await prisma.user.findMany({
    where: {
      emailVerifiedAt: null,
      createdAt: { gt: deletionCutoff },
      OR: [
        { verificationReminderSentAt: null, createdAt: { lte: new Date(now.getTime() - DAY) } },
        { verificationReminderSentAt: { lte: new Date(now.getTime() - 3 * DAY) }, createdAt: { lte: new Date(now.getTime() - 5 * DAY) } },
      ],
    },
    select: { id: true, email: true, name: true, createdAt: true, verificationReminderSentAt: true },
  });
  for (const user of pendingVerification) {
    const secondReminder = Boolean(user.verificationReminderSentAt);
    if (secondReminder && user.verificationReminderSentAt!.getTime() > user.createdAt.getTime() + 2 * DAY) continue;
    const claimed = await prisma.user.updateMany({
      where: { id: user.id, emailVerifiedAt: null, verificationReminderSentAt: user.verificationReminderSentAt },
      data: { verificationReminderSentAt: now },
    });
    if (!claimed.count) continue;
    const delivery = await issueVerificationEmail(user, request, undefined, true);
    if (delivery === "retry")
      await prisma.user.updateMany({
        where: { id: user.id, emailVerifiedAt: null },
        data: { verificationReminderSentAt: user.verificationReminderSentAt },
      });
    else verificationReminders += 1;
  }

  const staleAccounts = await prisma.user.findMany({
    where: { emailVerifiedAt: null, createdAt: { lte: deletionCutoff } },
    select: { id: true },
  });
  for (const user of staleAccounts) {
    const deleted = await prisma.$transaction(async transaction => {
      const current = await transaction.user.findUnique({ where: { id: user.id }, select: { emailVerifiedAt: true, createdAt: true } });
      if (!current || current.emailVerifiedAt || current.createdAt > deletionCutoff) return false;
      // Only teams nobody else joined are removed with the unconfirmed account.
      const owned = await transaction.organization.findMany({
        where: { createdById: user.id },
        select: { id: true, _count: { select: { members: true } } },
      });
      await transaction.organization.deleteMany({ where: { id: { in: owned.filter(org => org._count.members <= 1).map(org => org.id) } } });
      if (owned.some(org => org._count.members > 1)) return false;
      await transaction.user.delete({ where: { id: user.id } });
      return true;
    });
    if (deleted) deletedUnverifiedAccounts += 1;
  }

  const trials = await prisma.organization.findMany({
    where: { plan: "TRIAL", lifecycleStatus: "ACTIVE", trialEndsAt: { not: null } },
    select: {
      id: true,
      name: true,
      createdAt: true,
      trialEndsAt: true,
      trialNudgesSent: true,
      readOnlyAt: true,
      trialExpirationEmailSentAt: true,
      createdBy: { select: { email: true, name: true, emailVerifiedAt: true } },
    },
  });
  for (const organization of trials) {
    const ends = organization.trialEndsAt!;
    if (ends > now) {
      for (const nudge of TRIAL_NUDGES) {
        if (organization.trialNudgesSent >= nudge.step || !organization.createdBy.emailVerifiedAt) continue;
        const due =
          "afterStartDays" in nudge
            ? now.getTime() >= organization.createdAt.getTime() + nudge.afterStartDays * DAY
            : now.getTime() >= ends.getTime() - nudge.beforeEndDays * DAY;
        if (!due) continue;
        const claimed = await prisma.organization.updateMany({
          where: { id: organization.id, trialNudgesSent: { lt: nudge.step } },
          data: { trialNudgesSent: nudge.step },
        });
        if (!claimed.count) continue;
        try {
          await sendEmail({
            to: organization.createdBy.email,
            subject: nudge.subject,
            html: renderEmail({
              title: nudge.title,
              preheader: nudge.body[0],
              paragraphs: [`Ciao ${escapeHtml(organization.createdBy.name)},`, ...nudge.body],
              action: {
                label: nudge.step === 2 ? "Scegli un piano" : "Apri BoardCue",
                href: appUrl(nudge.step === 2 ? "/pricing" : "/app", request),
              },
            }),
          });
          trialNudges += 1;
        } catch (error) {
          console.error("Trial nudge delivery failed", error);
        }
      }
      continue;
    }
    // Trial over: freeze (read-only), never delete. Boards stay readable and exportable.
    await prisma.organization.updateMany({
      where: { id: organization.id, readOnlyAt: null },
      data: { readOnlyAt: now, deleteAfter: null },
    });
    const claimed = await prisma.organization.updateMany({
      where: { id: organization.id, trialExpirationEmailSentAt: null },
      data: { trialExpirationEmailSentAt: now },
    });
    if (!claimed.count) continue;
    try {
      await sendEmail({
        to: organization.createdBy.email,
        subject: "La prova gratuita di BoardCue è terminata",
        html: renderEmail({
          title: "Le tue board sono al sicuro",
          preheader: "Scegli un piano per riprendere a modificare le board.",
          paragraphs: [
            `Ciao ${escapeHtml(organization.createdBy.name)},`,
            `La prova di <strong>${escapeHtml(organization.name)}</strong> è terminata. Le board sono ora in sola lettura: puoi consultarle ed esportarle quando vuoi, e non cancelliamo nulla.`,
            "Scegli un piano per riprendere a lavorare esattamente da dove avevi lasciato.",
          ],
          action: { label: "Scegli un piano", href: appUrl("/pricing", request) },
        }),
      });
      trialExpirationEmails += 1;
    } catch (error) {
      console.error("Trial expiration email delivery failed", error);
      await prisma.organization.updateMany({ where: { id: organization.id }, data: { trialExpirationEmailSentAt: null } });
    }
  }

  return { verificationReminders, deletedUnverifiedAccounts, trialNudges, trialExpirationEmails };
}

export async function runRetention() {
  const now = new Date();
  const workspaces = await prisma.workspace.findMany({
    where: { lifecycleStatus: "ARCHIVED", deleteAfter: { lte: now } },
    select: { id: true, slug: true, name: true, organizationId: true, createdAt: true, archivedAt: true },
  });
  for (const workspace of workspaces) {
    await retain("workspace", workspace.id, "OPERATIONS_DELETION", workspace as unknown as Prisma.InputJsonValue);
    await prisma.workspace.delete({ where: { id: workspace.id } });
  }
  const organizations = await prisma.organization.findMany({
    where: { lifecycleStatus: "ARCHIVED", deleteAfter: { lte: now } },
    select: { id: true, slug: true, name: true, plan: true, licenseSource: true, createdAt: true, archivedAt: true },
  });
  for (const organization of organizations) {
    await retain("organization", organization.id, "OPERATIONS_DELETION", organization as unknown as Prisma.InputJsonValue);
    await prisma.organization.delete({ where: { id: organization.id } });
  }
  const users = await prisma.user.findMany({
    where: { lifecycleStatus: "ARCHIVED", deleteAfter: { lte: now } },
    select: { id: true, email: true, name: true, createdAt: true },
  });
  for (const user of users) {
    await retain("user", user.id, "OPERATIONS_DELETION", user as unknown as Prisma.InputJsonValue);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        email: `deleted+${user.id}@invalid.boardcue`,
        name: "Deleted user",
        passwordHash: "PURGED",
        deleteAfter: null,
        defaultOrganizationId: null,
      },
    });
  }
  const expiredArchives = await prisma.retainedRecord.deleteMany({ where: { expiresAt: { lte: now } } });
  return {
    deletedWorkspaces: workspaces.length,
    deletedOrganizations: organizations.length,
    anonymizedUsers: users.length,
    deletedExpiredArchives: expiredArchives.count,
  };
}
