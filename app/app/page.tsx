import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, twoFactorRequiredButMissing } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/Topbar";
import { HomeBoards } from "@/components/HomeBoards";
import { ensureDefaultOrganization } from "@/lib/default-organization";
import { getOrganizationLimits, getUsageStatus, monthlyPrice } from "@/lib/plans";
import { getTranslator } from "@/lib/i18n/server";
import { usedSeats } from "@/lib/invites";
import { Icon } from "@/components/Icon";

export const metadata: Metadata = { title: "Home", robots: { index: false } };

export default async function AppPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (await twoFactorRequiredButMissing(user)) redirect("/account?require2fa=1#security");
  const query = await searchParams;
  const flag = (key: string) => (Array.isArray(query[key]) ? query[key]![0] : query[key]);
  const { t, locale } = await getTranslator(user.locale);
  const team = await ensureDefaultOrganization(user.id);
  const [membership, memberships, seats, usage] = await Promise.all([
    prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: team.id, userId: user.id } },
      select: { role: true },
    }),
    prisma.workspaceMember.findMany({
      where: { userId: user.id },
      include: {
        workspace: {
          include: {
            organization: { select: { id: true, name: true } },
            _count: { select: { cards: { where: { archived: false } }, members: true } },
            columns: { orderBy: { position: "asc" }, select: { _count: { select: { cards: { where: { archived: false } } } } } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    usedSeats(team.id),
    getUsageStatus(team.id),
  ]);
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: team.id } });
  const limits = getOrganizationLimits(organization);
  const price = monthlyPrice(organization);
  const boards = memberships.map(({ role, workspace }) => ({
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    role,
    organizationId: workspace.organization.id,
    organizationName: workspace.organization.name,
    lifecycleStatus: workspace.lifecycleStatus,
    cards: workspace._count.cards,
    members: workspace._count.members,
    lanes: workspace.columns.map(column => column._count.cards),
    updatedAt: workspace.updatedAt.toISOString(),
  }));
  const steps = [
    { done: Boolean(organization.firstBoardAt), label: t("home.checklist.board") },
    { done: Boolean(organization.firstAiUpdateAt), label: t("home.checklist.ai") },
    { done: Boolean(organization.firstVoiceAt), label: t("home.checklist.voice") },
    { done: Boolean(organization.firstInviteAt), label: t("home.checklist.invite") },
    { done: Boolean(organization.firstCardMovedAt), label: t("home.checklist.move") },
  ];
  const completed = steps.filter(step => step.done).length;
  const renewal = organization.trialEndsAt && organization.plan === "TRIAL" ? organization.trialEndsAt : null;
  const trialDaysLeft = renewal ? Math.max(0, Math.ceil((renewal.getTime() - Date.now()) / 86400000)) : null;
  return (
    <div className="shell">
      <Topbar />
      <main id="main" className="grid-page wide">
        <div className="page-head">
          <div>
            <span className="eyebrow">{organization.name}</span>
            <h1>{t("home.greeting", { name: user.name.split(" ")[0] })}</h1>
            <p>{t("home.subtitle")}</p>
          </div>
        </div>
        {flag("checkout") === "success" && (
          <div className="notice" role="status" style={{ marginBottom: 16 }}>
            <Icon name="checkCircle" />
            <div className="notice-body">{t("home.checkoutSuccess")}</div>
          </div>
        )}
        {flag("verified") === "1" && (
          <div className="notice" role="status" style={{ marginBottom: 16 }}>
            <Icon name="checkCircle" />
            <div className="notice-body">{t("home.verified")}</div>
          </div>
        )}
        {usage?.readOnly && (
          <div className="notice warning" style={{ marginBottom: 16 }}>
            <Icon name="lock" />
            <div className="notice-body">
              <strong>{t("board.readOnly.title")}</strong> {t("home.frozen")}
            </div>
            <Link className="btn sm primary" href="/pricing">
              {t("board.readOnly.cta")}
            </Link>
          </div>
        )}
        <div className="home-grid">
          <HomeBoards
            boards={boards}
            teams={[
              {
                id: organization.id,
                name: organization.name,
                locale: organization.locale,
                canCreate: membership?.role !== "GUEST" && !usage?.readOnly,
              },
            ]}
            defaultTeamId={organization.id}
            defaultLocale={locale === "en" ? "en" : organization.locale}
          />
          <aside className="stack">
            {completed < steps.length && (
              <section className="panel checklist-card" aria-labelledby="checklist-title">
                <div className="row">
                  <h2 id="checklist-title" style={{ fontSize: 16 }}>
                    {t("home.checklist.title")}
                  </h2>
                  <span className="spacer" />
                  <span className="subtle">
                    {completed}/{steps.length}
                  </span>
                </div>
                <div className="meter" style={{ marginTop: 10 }}>
                  <i style={{ width: `${(completed / steps.length) * 100}%` }} />
                </div>
                <ol>
                  {steps.map(step => (
                    <li key={step.label} className={step.done ? "done" : ""}>
                      <span className="check-dot">
                        <Icon name="check" size={12} strokeWidth={3} />
                      </span>
                      <span>{step.label}</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}
            <section className="panel" aria-labelledby="plan-title">
              <div className="row">
                <h2 id="plan-title" style={{ fontSize: 16 }}>
                  {t("home.plan.title")}
                </h2>
                <span className="spacer" />
                <span className={`plan-badge plan-${limits.key}`}>{t(`plans.${limits.key}`)}</span>
              </div>
              {trialDaysLeft !== null && (
                <p className="subtle" style={{ marginTop: 6 }}>
                  {trialDaysLeft > 0 ? t("home.plan.trialLeft", { days: trialDaysLeft }) : t("home.plan.trialOver")}
                </p>
              )}
              {usage && (
                <div style={{ marginTop: 14 }}>
                  <div className="row">
                    <span className="subtle">{t("home.plan.aiUpdates")}</span>
                    <span className="spacer" />
                    <strong>{Number.isFinite(usage.included) ? `${usage.used} / ${usage.included}` : "∞"}</strong>
                  </div>
                  <div className={`meter ${usage.percent >= 90 ? "crit" : usage.percent >= 75 ? "warn" : ""}`} style={{ marginTop: 6 }}>
                    <i style={{ width: `${usage.percent}%` }} />
                  </div>
                  {usage.credits > 0 && (
                    <p className="subtle" style={{ marginTop: 6 }}>
                      {t("home.plan.credits", { count: usage.credits })}
                    </p>
                  )}
                </div>
              )}
              <div className="stat-list">
                <div>
                  <span>{t("home.plan.seats")}</span>
                  <strong>
                    {seats} / {Number.isFinite(limits.memberLimit) ? limits.memberLimit : "∞"}
                  </strong>
                </div>
                <div>
                  <span>{t("home.plan.boards")}</span>
                  <strong>
                    {boards.filter(board => board.organizationId === organization.id && board.lifecycleStatus === "ACTIVE").length}
                  </strong>
                </div>
                {price !== null && price > 0 && (
                  <div>
                    <span>{t("home.plan.price")}</span>
                    <strong>
                      €{price.toFixed(2).replace(".00", "")} {t("pricing.perMonth")}
                    </strong>
                  </div>
                )}
              </div>
              <div className="row" style={{ marginTop: 16 }}>
                <Link className="btn sm" href="/account#teams">
                  {t("home.plan.manage")}
                </Link>
                {(limits.key === "TRIAL" || usage?.readOnly) && (
                  <Link className="btn sm primary" href="/pricing">
                    {t("home.plan.choose")}
                  </Link>
                )}
              </div>
            </section>
            <section className="panel">
              <h2 style={{ fontSize: 16 }}>{t("home.tips.title")}</h2>
              <ul className="subtle" style={{ paddingLeft: 18, margin: "10px 0 0", display: "grid", gap: 6 }}>
                <li>{t("home.tips.voice")}</li>
                <li>{t("home.tips.shortcuts")}</li>
                <li>{t("home.tips.guests")}</li>
              </ul>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
