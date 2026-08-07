import { NextResponse } from "next/server";
import { getCurrentUser, canAccessWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { slug } = await params;
  const workspace = await prisma.workspace.findUnique({ where: { slug }, include: { columns: { orderBy: { position: "asc" }, include: { cards: { where: { archived: false }, orderBy: [{ position: "asc" }, { updatedAt: "desc" }] } } }, updateLogs: { orderBy: { createdAt: "desc" }, take: 8 } } });
  if (!workspace || !(await canAccessWorkspace(user.id, workspace.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug, planModel: workspace.planModel, keyEnv: workspace.openrouterKeyEnv },
    columns: workspace.columns,
    logs: workspace.updateLogs,
  });
}
