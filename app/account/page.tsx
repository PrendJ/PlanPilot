import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/Topbar";
import { AccountCenter } from "@/components/AccountCenter";
import { getOrganizationLimits, getUsageStatus, monthlyPrice } from "@/lib/plans";
import { ensureDefaultOrganization } from "@/lib/default-organization";
import { getTranslator } from "@/lib/i18n/server";
import { usedSeats } from "@/lib/invites";
import { billingConfigured } from "@/lib/stripe";

export const metadata: Metadata = { title: "Account", robots: { index: false } };

export default async function AccountPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");
  const query = await searchParams;
  const { t } = await getTranslator(user.locale);
  const defaultOrganization = await ensureDefaultOrganization(user.id);
  const memberships = await prisma.organizationMember.findMany({
    where: { userId: user.id, organization: { lifecycleStatus: { not: "ARCHIVED" } } },
    include: {
      organization: { include: { subscription: true, _count: { select: { workspaces: { where: { lifecycleStatus: "ACTIVE" } } } } } },
    },
    orderBy: { createdAt: "asc" },
  });
  const teams = await Promise.all(
    memberships.map(async ({ role, organization }) => {
      const limits = getOrganizationLimits(organization);
      const usage = await getUsageStatus(organization.id);
      return {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        role,
        isDefault: organization.id === defaultOrganization.id,
        plan: limits.key,
        seatBased: limits.seatBased,
        seats: await usedSeats(organization.id),
        seatLimit: Number.isFinite(limits.memberLimit) ? limits.memberLimit : null,
        boards: organization._count.workspaces,
        price: monthlyPrice(organization),
        interval: organization.billingInterval,
        readOnly: Boolean(usage?.readOnly),
        trialEndsAt: organization.plan === "TRIAL" ? (organization.trialEndsAt?.toISOString() ?? null) : null,
        renewsAt: organization.subscription?.currentPeriodEnd?.toISOString() ?? null,
        cancelAtPeriodEnd: Boolean(organization.subscription?.cancelAtPeriodEnd),
        subscriptionStatus: organization.subscription?.status ?? null,
        hasBillingAccount: Boolean(organization.subscription?.stripeCustomerId),
        usage: usage
          ? {
              used: usage.used,
              included: Number.isFinite(usage.included) ? usage.included : null,
              credits: usage.credits,
              percent: usage.percent,
            }
          : null,
        require2fa: organization.require2fa,
        canEnforce2fa: limits.enforce2fa,
        fiscal: {
          billingName: organization.billingName,
          vatNumber: organization.vatNumber,
          fiscalCode: organization.fiscalCode,
          sdiCode: organization.sdiCode,
          pecEmail: organization.pecEmail,
        },
      };
    }),
  );
  const flag = (key: string) => (Array.isArray(query[key]) ? query[key]![0] : query[key]);
  return (
    <div className="shell">
      <Topbar />
      <main id="main" className="grid-page wide">
        <div className="page-head">
          <div>
            <h1>{t("account.title")}</h1>
            <p>{t("account.subtitle")}</p>
          </div>
        </div>
        <AccountCenter
          user={{
            name: user.name,
            email: user.email,
            locale: user.locale === "en" ? "en" : "it",
            verified: Boolean(user.emailVerifiedAt),
            twoFactor: Boolean(user.totpEnabledAt),
            autoApplyAi: user.autoApplyAi,
            autoSendDictation: user.autoSendDictation,
            emailDigest: user.emailDigest,
            referralCode: user.referralCode,
          }}
          teams={teams}
          billingEnabled={billingConfigured()}
          notices={{ require2fa: flag("require2fa") === "1", credits: flag("credits") || null }}
        />
      </main>
    </div>
  );
}
