import { NextResponse } from "next/server";
import { requirePlatform } from "@/lib/platform-access";
import { ensureDefaultOrganization } from "@/lib/default-organization";
import { prisma } from "@/lib/prisma";

export async function POST(_: Request, { params }: { params: Promise<{ userId: string }> }) {
  const access = await requirePlatform("PLATFORM_ADMIN");
  if ("error" in access) return access.error;
  const { userId } = await params;
  try {
    const organization = await ensureDefaultOrganization(userId);
    await prisma.adminAuditEvent.create({ data: { actorId: access.user.id, action: "DEFAULT_ORGANIZATION_ENSURED", targetType: "USER", targetId: userId, metadata: { organizationId: organization.id } } });
    return NextResponse.json({ organization });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Provisioning failed" }, { status: 400 });
  }
}
