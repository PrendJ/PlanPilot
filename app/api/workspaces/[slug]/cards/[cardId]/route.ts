import { NextResponse } from "next/server";
import { getCurrentUser, canAccessWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string; cardId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { slug, cardId } = await params;
  const workspace = await prisma.workspace.findUnique({ where: { slug } });
  if (!workspace || !(await canAccessWorkspace(user.id, workspace.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const card = await prisma.card.findFirst({ where: { id: cardId, workspaceId: workspace.id } });
  if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const data: any = {};
  if (body.columnId) {
    const col = await prisma.boardColumn.findFirst({ where: { id: String(body.columnId), workspaceId: workspace.id } });
    if (!col) return NextResponse.json({ error: "Column not found" }, { status: 400 });
    data.columnId = col.id;
  }
  if (typeof body.title === "string") data.title = body.title.slice(0, 180);
  if (typeof body.description === "string") data.description = body.description;
  const updated = await prisma.card.update({ where: { id: cardId }, data });
  return NextResponse.json({ card: updated });
}
