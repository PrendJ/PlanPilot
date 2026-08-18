import { NextResponse } from "next/server";
import { getCurrentUser, getOrganizationAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getOrganizationAccess(user.id, organizationId);
  if (!access || !["OWNER", "ADMIN"].includes(access.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: {
      members: { include: { user: { select: { name: true, email: true } } } },
      workspaces: {
        include: {
          members: { include: { user: { select: { name: true, email: true } } } },
          columns: { orderBy: { position: "asc" }, include: { cards: { include: { assignees: { include: { user: { select: { name: true, email: true } } } } } } } },
          activityEvents: true,
        },
      },
    },
  });
  return new NextResponse(JSON.stringify({ exportedAt: new Date().toISOString(), organization }, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="boardcue-${access.organization.slug}.json"` } });
}
