import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/Topbar";
import { WorkspaceList } from "@/components/WorkspaceList";
import { ensureDefaultOrganization } from "@/lib/default-organization";

export default async function WorkspacesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const defaultOrganization = await ensureDefaultOrganization(user.id);

  const [memberships, organizations] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { userId: user.id },
      include: { workspace: { include: { organization: { select: { name: true } } } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.organizationMember.findMany({
      where: { userId: user.id, OR: [{ organizationId: defaultOrganization.id }, { role: { in: ["OWNER", "ADMIN"] } }] },
      include: { organization: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return <div className="shell"><Topbar loggedIn/><main className="grid-page wide"><div className="workspace-list-head"><div><div className="pill">WORKSPACE</div><h1>I tuoi workspace</h1><p className="muted-copy">Crea, configura, rinomina o archivia le board dei tuoi progetti.</p></div><a className="btn ghost" href="/app">← Torna alla home</a></div><WorkspaceList defaultOrganizationId={defaultOrganization.id} organizations={organizations.map(({organization})=>({id:organization.id,name:organization.name,plan:organization.plan,locale:organization.locale,isDefault:organization.id===defaultOrganization.id}))} workspaces={memberships.map(({role,workspace})=>({id:workspace.id,name:workspace.name,slug:workspace.slug,organizationId:workspace.organizationId,organizationName:workspace.organization.name,role,lifecycleStatus:workspace.lifecycleStatus}))}/></main></div>;
}
