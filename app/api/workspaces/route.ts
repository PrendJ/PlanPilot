import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createWorkspace } from "@/lib/workspace";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const memberships = await prisma.workspaceMember.findMany({ where: { userId: user.id }, include: { workspace: true }, orderBy: { createdAt: "asc" } });
  return NextResponse.json({ workspaces: memberships.map((m) => ({ ...m.workspace, role: m.role })), canCreateWorkspaces: user.canCreateWorkspaces || user.isAdmin });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.canCreateWorkspaces && !user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });
  try {
    const workspace = await createWorkspace({
      name,
      slug: body.slug ? String(body.slug) : undefined,
      userId: user.id,
      openrouterKeyEnv: body.openrouterKeyEnv ? String(body.openrouterKeyEnv) : undefined,
    });
    return NextResponse.json({ workspace });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create workspace" }, { status: 400 });
  }
}
