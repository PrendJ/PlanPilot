import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/Topbar";
import { WorkspaceSettings } from "@/components/WorkspaceSettings";
import { PLAN_MODELS, TRANSCRIPTION_MODELS } from "@/lib/model-catalog";

export default async function SettingsPage({params}:{params:Promise<{slug:string}>}){
  const user=await getCurrentUser(); if(!user) redirect("/login"); if(!user.isAdmin) redirect("/app");
  const {slug}=await params;
  const workspace=await prisma.workspace.findUnique({where:{slug},select:{name:true,slug:true,planModel:true,transcriptionModel:true,dictationEnabled:true}});
  if(!workspace) notFound();
  return <div className="shell"><Topbar loggedIn/><main className="grid-page wide"><div className="pill">WORKSPACE SETTINGS</div><div className="settings-title"><div><h1>{workspace.name}</h1><p className="muted-copy">Configura modello AI e dettatura per questo workspace.</p></div><a className="btn" href={`/app/${slug}`}>← Torna alla board</a></div><WorkspaceSettings workspace={workspace} planModels={PLAN_MODELS} transcriptionModels={TRANSCRIPTION_MODELS}/></main></div>;
}
