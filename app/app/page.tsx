import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { WorkspaceList } from "@/components/WorkspaceList";

export default async function AppPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const memberships = await prisma.workspaceMember.findMany({ where:{userId:user.id}, include:{workspace:true}, orderBy:{createdAt:"asc"} });
  return <div className="shell"><Topbar loggedIn/><main className="grid-page"><div className="workspace-list-head"><div><div className="pill">{user.isAdmin?"ADMIN":"TEAM"}</div><h1 style={{fontSize:36,letterSpacing:"-.05em",margin:"4px 0 8px"}}>I tuoi workspace</h1><p style={{color:"var(--muted)",margin:0}}>Ogni workspace può usare una chiave e modelli OpenRouter differenti.</p></div>{user.isAdmin&&<a className="btn accent" href="/admin">Gestione utenti</a>}</div><WorkspaceList canCreate={user.canCreateWorkspaces||user.isAdmin} workspaces={memberships.map(m=>({id:m.workspace.id,name:m.workspace.name,slug:m.workspace.slug,openrouterKeyEnv:m.workspace.openrouterKeyEnv,role:m.role}))}/></main></div>;
}
