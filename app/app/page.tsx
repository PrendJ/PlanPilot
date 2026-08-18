import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { WorkspaceList } from "@/components/WorkspaceList";

export default async function AppPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const memberships = await prisma.workspaceMember.findMany({ where:{userId:user.id}, include:{workspace:true}, orderBy:{createdAt:"asc"} });
  const organizations = await prisma.organizationMember.findMany({ where: { userId: user.id, role: { in: ["OWNER", "ADMIN"] } }, include: { organization: true }, orderBy: { createdAt: "asc" } });
  return <div className="shell"><Topbar loggedIn/><main className="grid-page"><div className="workspace-list-head"><div><div className="pill">{user.isAdmin?"SUPPORT":"WORKSPACE"}</div><h1 style={{fontSize:36,letterSpacing:"-.05em",margin:"4px 0 8px"}}>I tuoi workspace</h1><p style={{color:"var(--muted)",margin:0}}>Board condivise e configurabili per ogni cliente o progetto.</p></div>{user.isAdmin&&<a className="btn accent" href="/admin">Supporto interno</a>}</div><WorkspaceList organizations={organizations.map(m=>({id:m.organization.id,name:m.organization.name,plan:m.organization.plan,locale:m.organization.locale}))} workspaces={memberships.map(m=>({id:m.workspace.id,name:m.workspace.name,slug:m.workspace.slug,organizationId:m.workspace.organizationId,role:m.role}))}/></main></div>;
}
