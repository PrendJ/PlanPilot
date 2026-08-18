import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/Topbar";
import { AdminPanel } from "@/components/AdminPanel";
import { getAdminAnalytics } from "@/lib/admin-analytics";

export default async function AdminPage(){
  const user=await getCurrentUser(); if(!user) redirect("/login"); if(!user.isAdmin) redirect("/app");
  const [users,workspaces,analytics]=await Promise.all([prisma.user.findMany({orderBy:[{name:"asc"},{email:"asc"}],select:{id:true,email:true,name:true,isAdmin:true,canCreateWorkspaces:true,lifetimeFree:true,emailVerifiedAt:true,memberships:{select:{role:true,workspace:{select:{id:true,name:true,slug:true}}}},organizationMemberships:{select:{role:true,organization:{select:{id:true,name:true,slug:true,plan:true}}}}}}),prisma.workspace.findMany({orderBy:{name:"asc"},select:{id:true,name:true,slug:true}}),getAdminAnalytics()]);
  return <div className="shell"><Topbar loggedIn/><main className="grid-page admin-page"><div className="pill">SUPERADMIN</div><h1>BoardCue control room</h1><p className="muted-copy">Utenti, organizzazioni, workspace, consumo AI ed economics in un unico backoffice.</p><AdminPanel initialUsers={users} workspaces={workspaces} initialAnalytics={analytics}/></main></div>;
}
