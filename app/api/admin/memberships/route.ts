import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const user = await getCurrentUser();
  return user?.isAdmin ? user : null;
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const userId = String(body.userId || "");
  const workspaceId = String(body.workspaceId || "");
  const role = ["OWNER", "MEMBER"].includes(String(body.role)) ? String(body.role) : "MEMBER";
  if (!userId || !workspaceId) return NextResponse.json({ error: "Utente e workspace richiesti" }, { status: 400 });
  const membership = await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId, userId } },
    update: { role },
    create: { workspaceId, userId, role },
    include: { user: { select: { id: true, name: true, email: true } }, workspace: { select: { id: true, name: true, slug: true } } },
  });
  return NextResponse.json({ membership });
}

export async function DELETE(request: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const userId = String(body.userId || "");
  const workspaceId = String(body.workspaceId || "");
  if (!userId || !workspaceId) return NextResponse.json({ error: "Utente e workspace richiesti" }, { status: 400 });
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { createdById: true } });
  if (workspace?.createdById === userId) return NextResponse.json({ error: "Il creatore del workspace non può essere rimosso" }, { status: 400 });
  await prisma.workspaceMember.deleteMany({ where: { userId, workspaceId } });
  return NextResponse.json({ ok: true });
}
