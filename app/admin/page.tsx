import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/Topbar";
import { AdminPanel } from "@/components/AdminPanel";
import { getAdminAnalytics } from "@/lib/admin-analytics";
import { hasPlatformCapability, platformRoleOf } from "@/lib/platform-access";

export default async function AdminPage(){
  const user=await getCurrentUser(); if(!user) redirect("/login"); if(!hasPlatformCapability(user,"METADATA")) redirect("/app"); const role=platformRoleOf(user);
  const [users,workspaces,analytics]=await Promise.all([prisma.user.findMany({orderBy:[{name:"asc"},{email:"asc"}],select:{id:true,email:true,name:true,platformRole:true,lifecycleStatus:true,isAdmin:true,lifetimeFree:true,emailVerifiedAt:true,memberships:{select:{role:true,workspace:{select:{id:true,name:true,slug:true}}}},organizationMemberships:{orderBy:{createdAt:"asc"},select:{role:true,organization:{select:{id:true,name:true,slug:true,plan:true,legalType:true,createdById:true,licenseSource:true,accessExpiresAt:true}}}}}}),prisma.workspace.findMany({orderBy:{name:"asc"},select:{id:true,name:true,slug:true,lifecycleStatus:true,organization:{select:{name:true,plan:true,licenseSource:true,lifecycleStatus:true}}}}),getAdminAnalytics()]);
  return <div className="shell"><Topbar loggedIn/><main className="grid-page admin-page"><div className="pill">{role}</div><h1>BoardCue control room</h1><p className="muted-copy">Metadati di piattaforma, licenze, consumo AI e stato billing. I contenuti delle board restano isolati.</p><AdminPanel initialUsers={users} workspaces={workspaces} initialAnalytics={analytics} actorRole={role}/></main></div>;
}
