import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/Topbar";
import { WorkspaceSettings } from "@/components/WorkspaceSettings";
import { canManageWorkspace } from "@/lib/auth";
import { MemberSettings } from "@/components/MemberSettings";

export default async function SettingsPage({params}:{params:Promise<{slug:string}>}){
  const user=await getCurrentUser(); if(!user) redirect("/login");
  const {slug}=await params;
  const workspace=await prisma.workspace.findUnique({where:{slug},include:{columns:{orderBy:{position:"asc"},include:{cards:{select:{id:true}}}},members:{include:{user:{select:{name:true,email:true}}},orderBy:{createdAt:"asc"}}}});
  if(!workspace||!(await canManageWorkspace(user.id,workspace.id,user.isAdmin))) notFound();
  const actor=workspace.members.find(member=>member.userId===user.id);
  return <div className="shell"><Topbar loggedIn/><main className="grid-page wide"><div className="pill">IMPOSTAZIONI WORKSPACE</div><div className="settings-title"><div><h1>{workspace.name}</h1><p className="muted-copy">Configura la struttura condivisa della board.</p></div><a className="btn" href={`/app/${slug}`}>← Torna alla board</a></div><WorkspaceSettings slug={slug} initialColumns={workspace.columns} initialRevision={workspace.revision}/><div className="settings-stack"><MemberSettings slug={slug} initialMembers={workspace.members} canChangeRoles={Boolean(user.isAdmin||actor?.role==="OWNER")}/></div></main></div>;
}
