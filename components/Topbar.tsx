import Link from "next/link";
import { getCurrentUser, isVerified } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTranslator } from "@/lib/i18n/server";
import { Brand } from "./Brand";
import { InstallAppButton } from "./PwaProvider";
import { LanguageSwitch, NotificationsBell, SearchButton, TeamSwitcher, ThemeMenu, UserMenu, VerifyBanner } from "./TopbarClient";

/** Server component: resolves the session once and renders the public or the app header. */
export async function Topbar() {
  const user = await getCurrentUser();
  const { t } = await getTranslator(user?.locale);
  if (!user) {
    return (
      <header className="topbar">
        <Link href="/" className="topbar-brand" aria-label={t("nav.home")}>
          <Brand />
        </Link>
        <nav className="topbar-nav" aria-label={t("nav.main")}>
          <Link href="/#come-funziona">{t("nav.product")}</Link>
          <Link href="/demo">{t("nav.demo")}</Link>
          <Link href="/pricing">{t("nav.pricing")}</Link>
        </nav>
        <div className="topbar-actions">
          <span className="hide-mobile">
            <LanguageSwitch />
          </span>
          <ThemeMenu />
          <InstallAppButton />
          <Link className="btn ghost" href="/login">
            {t("nav.login")}
          </Link>
          <Link className="btn primary" href="/register">
            {t("nav.tryFree")}
          </Link>
        </div>
      </header>
    );
  }
  const organizations = await prisma.organizationMember.findMany({
    where: { userId: user.id, organization: { lifecycleStatus: { not: "ARCHIVED" } } },
    orderBy: { createdAt: "asc" },
    select: { role: true, organization: { select: { id: true, name: true, plan: true } } },
  });
  return (
    <>
      <header className="topbar">
        <Link href="/app" className="topbar-brand" aria-label={t("nav.home")}>
          <Brand />
        </Link>
        <TeamSwitcher
          current={user.defaultOrganizationId}
          teams={organizations.map(item => ({
            id: item.organization.id,
            name: item.organization.name,
            plan: item.organization.plan,
            role: item.role,
          }))}
        />
        <div className="topbar-actions">
          <SearchButton />
          <NotificationsBell />
          <span className="hide-mobile">
            <InstallAppButton />
          </span>
          <UserMenu name={user.name} email={user.email} isAdmin={user.isAdmin || user.platformRole !== "USER"} />
        </div>
      </header>
      {!isVerified(user) && <VerifyBanner email={user.email} />}
    </>
  );
}
