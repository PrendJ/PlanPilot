import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { canManageWorkspace, getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/Topbar";
import { BoardSettings } from "@/components/BoardSettings";
import { getOrganizationLimits } from "@/lib/plans";
import { PLANNING_MODELS, resolvePlanningModel } from "@/lib/ai-config";
import { getTranslator } from "@/lib/i18n/server";
import { Icon } from "@/components/Icon";

export const metadata: Metadata = { title: "Impostazioni board", robots: { index: false } };

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { slug } = await params;
  const workspace = await prisma.workspace.findUnique({
    where: { slug },
    include: {
      organization: true,
      columns: { orderBy: { position: "asc" }, include: { _count: { select: { cards: true } } } },
      members: { include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!workspace || !(await canManageWorkspace(user.id, workspace.id))) notFound();
  const { t } = await getTranslator(user.locale);
  const actor = workspace.members.find(member => member.userId === user.id);
  const limits = getOrganizationLimits(workspace.organization);
  return (
    <div className="shell">
      <Topbar />
      <main id="main" className="grid-page wide">
        <div className="page-head">
          <div>
            <Link href={`/app/${slug}`} className="subtle row">
              <Icon name="chevronLeft" size={14} />
              {t("settings.back")}
            </Link>
            <h1>{workspace.name}</h1>
            <p>{t("settings.subtitle")}</p>
          </div>
        </div>
        <BoardSettings
          slug={slug}
          isOwner={actor?.role === "OWNER"}
          meId={user.id}
          general={{
            name: workspace.name,
            locale: workspace.locale,
            dictationEnabled: workspace.dictationEnabled,
            planModel: resolvePlanningModel(workspace.planModel),
          }}
          models={PLANNING_MODELS}
          columns={workspace.columns.map(column => ({
            id: column.id,
            title: column.title,
            description: column.description,
            cards: column._count.cards,
          }))}
          members={workspace.members.map(member => ({
            id: member.userId,
            name: member.user.name,
            email: member.user.email,
            role: member.role,
          }))}
          guestsAllowed={limits.guests}
        />
      </main>
    </div>
  );
}
