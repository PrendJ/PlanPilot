import { getCurrentUser, canAccessWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { Board } from "@/components/Board";

export default async function WorkspacePage({ params }: { params: Promise<{ slug:string }> }) {
  const user=await getCurrentUser(); if(!user) redirect("/login");
  const {slug}=await params; const workspace=await prisma.workspace.findUnique({where:{slug}}); if(!workspace||!(await canAccessWorkspace(user.id,workspace.id))) notFound();
  return <div className="shell"><Topbar loggedIn/><main className="page"><Board slug={slug}/></main></div>;
}
