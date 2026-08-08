import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/Topbar";
import { AdminPanel } from "@/components/AdminPanel";

export default async function AdminPage(){
  const user=await getCurrentUser(); if(!user) redirect("/login"); if(!user.isAdmin) redirect("/app");
  const users=await prisma.user.findMany({orderBy:[{name:"asc"},{email:"asc"}],select:{id:true,email:true,name:true,isAdmin:true,canCreateWorkspaces:true,memberships:{select:{role:true,workspace:{select:{id:true,name:true,slug:true}}}}}});
  const workspaces=await prisma.workspace.findMany({orderBy:{name:"asc"},select:{id:true,name:true,slug:true}});
  return <div className="shell"><Topbar loggedIn/><main className="grid-page"><div className="pill">ADMIN</div><h1>Gestione utenti</h1><p className="muted-copy">Crea account e assegna gli utenti ai workspace senza usare il terminale.</p><AdminPanel initialUsers={users} workspaces={workspaces}/></main></div>;
}
