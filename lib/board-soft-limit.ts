import { appUrl, escapeHtml, renderEmail, sendEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";

export const BOARD_SOFT_LIMIT_ACTION = "BOARD_SOFT_LIMIT_EXCEEDED";
/** While an organization stays above its soft cap, admins hear about it at most once in this window. */
const REMINDER_DAYS = 30;

/**
 * Family/Team (50 per purchased seat) and Business (200) have soft thresholds. Exceeding them leaves an
 * entry in the back-office audit and emails BoardCue's superadmins, so unusual growth or abuse can be looked at.
 * Never throws: an alert must not turn a created board into an error.
 */
export async function notifyBoardSoftLimit(input: {
  organization: { id: string; name: string; plan: string };
  userId: string;
  activeBoards: number;
  softLimit: number;
}) {
  try {
    if (input.activeBoards <= input.softLimit) return false;
    const since = new Date(Date.now() - REMINDER_DAYS * 86_400_000);
    const recent = await prisma.adminAuditEvent.findFirst({
      where: { action: BOARD_SOFT_LIMIT_ACTION, targetType: "organization", targetId: input.organization.id, createdAt: { gte: since } },
      select: { id: true },
    });
    if (recent) return false;
    await prisma.adminAuditEvent.create({
      data: {
        actorId: input.userId,
        action: BOARD_SOFT_LIMIT_ACTION,
        targetType: "organization",
        targetId: input.organization.id,
        metadata: { plan: input.organization.plan, activeBoards: input.activeBoards, softLimit: input.softLimit },
      },
    });
    const admins = await prisma.user.findMany({
      where: { lifecycleStatus: "ACTIVE", OR: [{ platformRole: "SUPERADMIN" }, { isAdmin: true }] },
      select: { email: true },
    });
    const name = escapeHtml(input.organization.name);
    await Promise.all(
      admins.map(admin =>
        sendEmail({
          to: admin.email,
          subject: `Soglia board superata · ${input.organization.name}`,
          html: renderEmail({
            title: "Soglia di board superata",
            preheader: `${input.organization.name} ha ${input.activeBoards} board attive.`,
            paragraphs: [
              `<strong>${name}</strong> (piano ${escapeHtml(input.organization.plan)}) ha <strong>${input.activeBoards}</strong> board attive, oltre la soglia di ${input.softLimit} (quota condivisa sui posti del piano).`,
              "Non è stato bloccato nulla: è un avviso per verificare crescita anomala o abusi. Non riceverai altri avvisi per questa organizzazione nei prossimi 30 giorni.",
            ],
            action: { href: appUrl("/admin"), label: "Apri il back office" },
          }),
        }).catch(error => console.error("Board soft limit email failed", { organizationId: input.organization.id, reason: String(error) })),
      ),
    );
    return true;
  } catch (error) {
    console.error("Board soft limit alert failed", { organizationId: input.organization.id, reason: error instanceof Error ? error.name : "unknown" });
    return false;
  }
}
