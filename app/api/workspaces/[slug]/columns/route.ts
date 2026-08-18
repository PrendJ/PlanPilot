import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, canManageWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertRevision, bumpRevision, logActivity, workspaceForUser, workspaceReadOnly } from "@/lib/board";

const createSchema = z.object({ title: z.string().trim().min(1).max(80), description: z.string().max(500).default(""), revision: z.number().int().nonnegative() });
const reorderSchema = z.object({ columnIds: z.array(z.string().cuid()).min(1).max(12), revision: z.number().int().nonnegative() });

async function context(slug: string, userId: string, globalAdmin: boolean) {
  const workspace = await workspaceForUser(slug, userId);
  if (!workspace || !(await canManageWorkspace(userId, workspace.id, globalAdmin))) return null;
  return workspace;
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser(); if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { slug } = await params; const workspace = await context(slug, user.id, user.isAdmin); if (!workspace) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (workspaceReadOnly(workspace)) return NextResponse.json({ error: "Organization is read-only" }, { status: 423 });
  const parsed = createSchema.safeParse(await request.json().catch(() => ({}))); if (!parsed.success) return NextResponse.json({ error: "Invalid column" }, { status: 400 });
  if (await prisma.boardColumn.count({ where: { workspaceId: workspace.id } }) >= 12) return NextResponse.json({ error: "A workspace can have at most 12 columns" }, { status: 400 });
  try { const result = await prisma.$transaction(async (tx) => { if (!(await assertRevision(workspace.id, parsed.data.revision, tx))) throw new Error("STALE_REVISION"); const position = await tx.boardColumn.count({ where: { workspaceId: workspace.id } }); const column = await tx.boardColumn.create({ data: { workspaceId: workspace.id, title: parsed.data.title, description: parsed.data.description, semanticKey: "CUSTOM", position } }); await logActivity(tx, { organizationId: workspace.organizationId, workspaceId: workspace.id, userId: user.id, type: "COLUMN_CREATED", entityType: "COLUMN", entityId: column.id, afterState: column as never }); const revision = (await bumpRevision(tx, workspace.id)).revision; return { column, revision }; }); return NextResponse.json(result, { status: 201 }); } catch (error) { if (error instanceof Error && error.message === "STALE_REVISION") return NextResponse.json({ error: "Board changed. Reload and retry." }, { status: 409 }); throw error; }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser(); if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { slug } = await params; const workspace = await context(slug, user.id, user.isAdmin); if (!workspace) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (workspaceReadOnly(workspace)) return NextResponse.json({ error: "Organization is read-only" }, { status: 423 });
  const parsed = reorderSchema.safeParse(await request.json().catch(() => ({}))); if (!parsed.success || new Set(parsed.data.columnIds).size !== parsed.data.columnIds.length) return NextResponse.json({ error: "Invalid column order" }, { status: 400 });
  const current = await prisma.boardColumn.findMany({ where: { workspaceId: workspace.id }, select: { id: true } }); if (current.length !== parsed.data.columnIds.length || current.some((column) => !parsed.data.columnIds.includes(column.id))) return NextResponse.json({ error: "Column list is incomplete" }, { status: 400 });
  try { const revision = await prisma.$transaction(async (tx) => { if (!(await assertRevision(workspace.id, parsed.data.revision, tx))) throw new Error("STALE_REVISION"); for (const [position, id] of parsed.data.columnIds.entries()) await tx.boardColumn.update({ where: { id }, data: { position } }); await logActivity(tx, { organizationId: workspace.organizationId, workspaceId: workspace.id, userId: user.id, type: "COLUMNS_REORDERED", entityType: "COLUMN", afterState: parsed.data.columnIds as never }); return (await bumpRevision(tx, workspace.id)).revision; }); return NextResponse.json({ revision }); } catch (error) { if (error instanceof Error && error.message === "STALE_REVISION") return NextResponse.json({ error: "Board changed. Reload and retry." }, { status: 409 }); throw error; }
}
