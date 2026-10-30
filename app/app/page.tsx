import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, twoFactorRequiredButMissing } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/Topbar";
import { HomeBoards } from "@/components/HomeBoards";
import { HomeAssistant } from "@/components/HomeAssistant";
import { canWriteCards, workspaceReadOnly } from "@/lib/board";
import { canUseSpaces } from "@/lib/spaces";
import { canCreateWorkspaceInOrganization, ensureActiveOrganization } from "@/lib/default-organization";
import { getOrganizationLimits, getUsageStatus } from "@/lib/plans";
import { getTranslator } from "@/lib/i18n/server";
import { Icon } from "@/components/Icon";
import { isPersonalBoard, PERSONAL_BOARD_NAMES } from "@/lib/onboarding";

export const metadata: Metadata = { title: "Home", robots: { index: false } };

export default async function AppPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const flag = (key: string) => (Array.isArray(query[key]) ? query[key]![0] : query[key]);
  const user = await getCurrentUser();
  // A cookie without a valid session (expired or revoked) lands here: send it to sign-in, never to "/",
  // so a misrouted root page can never redirect to itself.
  if (!user) redirect(flag("shared") === "1" ? "/login?next=%2Fapp%3Fshared%3D1" : "/login");
  if (await twoFactorRequiredButMissing(user)) redirect("/account?require2fa=1#security");
  const { t, locale } = await getTranslator(user.locale);
  const team = await ensureActiveOrganization(user.id);
  const [membership, memberships, usage] = await Promise.all([
    prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: team.id, userId: user.id } },
      select: { role: true },
    }),
    prisma.workspaceMember.findMany({
      where: { userId: user.id, workspace: { organizationId: team.id } },
      include: {
        workspace: {
          include: {
            organization: {
              select: {
                id: true,
                name: true,
                plan: true,
                trialEndsAt: true,
                accessExpiresAt: true,
                readOnlyAt: true,
                lifecycleStatus: true,
              },
            },
            _count: { select: { cards: { where: { archived: false } }, members: true } },
            columns: { orderBy: { position: "asc" }, select: { _count: { select: { cards: { where: { archived: false } } } } } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    getUsageStatus(team.id),
  ]);
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: team.id } });
  const limits = getOrganizationLimits(organization);
  const canCreate = Boolean(membership && canCreateWorkspaceInOrganization(user.defaultOrganizationId, team.id, membership.role) && membership.role !== "GUEST" && !usage?.readOnly);
  const spaces = await prisma.space.findMany({ where: { organizationId: team.id, ...(!["OWNER", "ADMIN"].includes(membership?.role || "") && { members: { some: { userId: user.id } } }) }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
  const boards = memberships.map(({ role, workspace }) => ({
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    role,
    spaceId: workspace.spaceId,
    organizationId: workspace.organization.id,
    organizationName: workspace.organization.name,
    lifecycleStatus: workspace.lifecycleStatus,
    cards: workspace._count.cards,
    members: workspace._count.members,
    lanes: workspace.columns.map(column => column._count.cards),
    updatedAt: workspace.updatedAt.toISOString(),
  }));
  const captureBoards = memberships
    .filter(({ role, workspace }) => canWriteCards(role) && !workspaceReadOnly(workspace))
    .map(({ workspace }) => ({
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      dictationEnabled: workspace.dictationEnabled,
    }));
  const steps = [
    { done: Boolean(organization.firstBoardAt), label: t("home.checklist.board") },
    { done: Boolean(organization.firstAiUpdateAt), label: t("home.checklist.ai") },
    { done: Boolean(organization.firstVoiceAt), label: t("home.checklist.voice") },
    { done: Boolean(organization.firstInviteAt), label: t("home.checklist.invite") },
    { done: Boolean(organization.firstCardMovedAt), label: t("home.checklist.move") },
  ];
  const completed = steps.filter(step => step.done).length;
  const activeBoards = boards.filter(board => board.organizationId === organization.id && board.lifecycleStatus === "ACTIVE").length;
  const atBoardLimit = activeBoards >= limits.workspaceLimit;
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
        <HomeAssistant
          key={organization.id}
          userId={user.id}
          initialBoards={captureBoards}
          paused={!captureBoards.length}
          quick={flag("quick") === "1"}
          shared={flag("shared") === "1"}
          shareError={flag("shareError") === "1"}
          personalBoardOffer={
            memberships.some(({ workspace }) => isPersonalBoard(workspace) && workspace.lifecycleStatus === "ACTIVE") ||
            !canCreate ||
            usage?.readOnly ||
            atBoardLimit
              ? null
              : { organizationId: organization.id, locale: user.locale, name: PERSONAL_BOARD_NAMES[locale === "it" ? "it" : "en"] }
          }
          newBoardTarget={
            canCreate && !atBoardLimit
              ? { organizationId: organization.id, locale: locale === "en" ? "en" : organization.locale }
              : null
          }
          boardList={
            <HomeBoards
              boards={boards}
              spaces={spaces}
              selectedSpace={flag("space")}
              canManageSpaces={canUseSpaces(organization.plan) && ["OWNER", "ADMIN"].includes(membership?.role || "")}
              teams={[
                {
                  id: organization.id,
                  name: organization.name,
                  locale: organization.locale,
                  canCreate,
                  boardLimit: atBoardLimit ? limits.workspaceLimit : null,
                },
              ]}
              defaultTeamId={organization.id}
              defaultLocale={locale === "en" ? "en" : organization.locale}
            />
          }
          sidebar={
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
            </aside>
          }
        />
      </main>
    </div>
  );
}
