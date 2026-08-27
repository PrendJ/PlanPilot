import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { organizationReadOnly } from "@/lib/plans";
import { canManageWorkspaceAction, workspaceLifecycleChange } from "@/lib/workspace-management";
import { rejectCrossOrigin } from "@/lib/security";

const schema = z.discriminatedUnion("action", [z.object({action:z.literal("rename"),name:z.string().trim().min(1).max(100)}),z.object({action:z.literal("archive")}),z.object({action:z.literal("restore")})]);

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser(); if (!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const originError = rejectCrossOrigin(request); if (originError) return originError;
  const parsed = schema.safeParse(await request.json().catch(()=>({}))); if (!parsed.success) return NextResponse.json({error:"Aggiornamento workspace non valido"},{status:400});
  const {slug} = await params;
  const membership = await prisma.workspaceMember.findFirst({where:{userId:user.id,workspace:{slug}},include:{workspace:{include:{organization:true}}}});
  if (!membership) return NextResponse.json({error:"Workspace non trovato"},{status:404});
  if (!canManageWorkspaceAction(membership.role,parsed.data.action)) return NextResponse.json({error:"Forbidden"},{status:403});
  if (organizationReadOnly(membership.workspace.organization)) return NextResponse.json({error:"L'organizzazione è in sola lettura"},{status:423});
  if (parsed.data.action === "restore" && membership.workspace.lifecycleStatus !== "ARCHIVED") return NextResponse.json({error:"Solo un workspace archiviato può essere ripristinato"},{status:409});
  if (parsed.data.action !== "restore" && membership.workspace.lifecycleStatus !== "ACTIVE") return NextResponse.json({error:"Il workspace non è attivo"},{status:409});
  const before = {name:membership.workspace.name,lifecycleStatus:membership.workspace.lifecycleStatus};
  const data = parsed.data.action === "rename" ? {name:parsed.data.name} : workspaceLifecycleChange(parsed.data.action);
  const workspace = await prisma.$transaction(async tx => {
    const updated = await tx.workspace.update({where:{id:membership.workspaceId},data,select:{id:true,name:true,slug:true,lifecycleStatus:true}});
    await tx.activityEvent.create({data:{organizationId:membership.workspace.organizationId,workspaceId:membership.workspaceId,userId:user.id,type:`WORKSPACE_${parsed.data.action.toUpperCase()}D`,entityType:"WORKSPACE",entityId:membership.workspaceId,beforeState:before,afterState:{name:updated.name,lifecycleStatus:updated.lifecycleStatus},undoable:false}});
    return updated;
  });
  return NextResponse.json({workspace});
}
