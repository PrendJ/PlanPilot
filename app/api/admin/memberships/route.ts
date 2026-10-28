import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiUser } from "@/lib/auth";
import { hasPlatformCapability } from "@/lib/platform-access";
import { prisma } from "@/lib/prisma";
import { mutateMembership } from "@/lib/membership-mutation";
import { rejectCrossOrigin, safeJson } from "@/lib/security";

async function change(request: Request, remove: boolean) {
  const origin = rejectCrossOrigin(request); if (origin) return origin;
  const actor = await getApiUser();
  if (!actor || !hasPlatformCapability(actor, "SUPPORT")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = z.object({ userId: z.string().cuid(), workspaceId: z.string().cuid(), role: z.enum(["OWNER", "ADMIN", "MEMBER"]).default("MEMBER") }).safeParse(await safeJson(request));
  if (!parsed.success) return NextResponse.json({ error: "Invalid membership" }, { status: 400 });
  try {
    const membership = await prisma.$transaction(async tx => {
      const result = await mutateMembership(tx, { ...parsed.data, actorId: actor.id, role: remove ? undefined : parsed.data.role, platform: true });
      await tx.adminAuditEvent.create({ data: { actorId: actor.id, action: remove ? "WORKSPACE_MEMBERSHIP_REMOVED" : "WORKSPACE_MEMBERSHIP_UPSERTED", targetType: "USER", targetId: parsed.data.userId, metadata: parsed.data } });
      return result;
    });
    return NextResponse.json({ ok: true, membership });
  } catch (error) {
    if (error instanceof Error && ["LAST_OWNER", "MEMBER_LIMIT", "FORBIDDEN", "NOT_FOUND", "READ_ONLY"].includes(error.message)) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
export async function POST(request: Request) { return change(request, false); }
export async function DELETE(request: Request) { return change(request, true); }
