import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { v1User } from "@/lib/api-v1";

export async function GET(request: Request) {
  const user = await v1User(request);
  if (user instanceof NextResponse) return user;
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: user.id, workspace: { lifecycleStatus: "ACTIVE" } },
    include: { workspace: { include: { columns: { orderBy: { position: "asc" }, select: { id: true, title: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({
    data: memberships.map(({ role, workspace }) => ({ slug: workspace.slug, name: workspace.name, role, columns: workspace.columns })),
  });
}
