import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createWorkspace } from "@/lib/workspace";
import { getOrganizationAccess } from "@/lib/auth";
import { getOrganizationLimits, organizationReadOnly } from "@/lib/plans";
import { z } from "zod";
import { canCreateWorkspaceInOrganization, ensureDefaultOrganization } from "@/lib/default-organization";

const schema = z.object({ organizationId: z.string().cuid(), name: z.string().trim().min(1).max(100), presetKey: z.enum(["GENERAL", "SOFTWARE", "MARKETING", "PROJECT", "CONSULTING"]), locale: z.enum(["it", "en", "de", "fr", "es", "ru", "pl"]) });

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Accedi per vedere le tue board" }, { status: 401 });
  const memberships = await prisma.workspaceMember.findMany({ where: { userId: user.id }, include: { workspace: true }, orderBy: { createdAt: "asc" } });
  return NextResponse.json({ workspaces: memberships.map((m) => ({ id: m.workspace.id, name: m.workspace.name, slug: m.workspace.slug, organizationId: m.workspace.organizationId, role: m.role })) });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Accedi per creare una board" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Controlla nome, modello e lingua della board" }, { status: 400 });
  const body = parsed.data;
  const defaultOrganization = user.defaultOrganizationId ? null : await ensureDefaultOrganization(user.id);
  const membership = await getOrganizationAccess(user.id, body.organizationId);
  const defaultOrganizationId = user.defaultOrganizationId || defaultOrganization?.id || null;
  if (!membership || !canCreateWorkspaceInOrganization(defaultOrganizationId, body.organizationId, membership.role)) return NextResponse.json({ error: "Non hai i permessi per creare una board in questa organizzazione" }, { status: 403 });
  if (organizationReadOnly(membership.organization)) return NextResponse.json({ error: "Questa organizzazione è in sola lettura" }, { status: 423 });
  const config = getOrganizationLimits(membership.organization);
  const count = await prisma.workspace.count({ where: { organizationId: body.organizationId } });
  if (count >= config.workspaceLimit) return NextResponse.json({ error: `Il piano ${config.label} ha raggiunto il limite di workspace` }, { status: 402 });
  try {
    const workspace = await createWorkspace({
      name: body.name,
      userId: user.id,
      organizationId: body.organizationId,
      presetKey: body.presetKey,
      locale: body.locale,
    });
    return NextResponse.json({ workspace });
  } catch (error) {
    console.error("Workspace creation failed", error);
    return NextResponse.json({ error: "Non è stato possibile creare la board. Riprova tra poco." }, { status: 400 });
  }
}
