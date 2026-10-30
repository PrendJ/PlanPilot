import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeJson, rejectCrossOrigin } from "@/lib/security";
import { apiError } from "@/lib/errors";
import { lockSpaceOrganization, syncSpace, syncSpaceBoard } from "@/lib/spaces";
import { newInviteToken } from "@/lib/invites";
import { spaceError } from "@/lib/space-errors";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("rename"), name: z.string().trim().min(1).max(100) }),
  z.object({ action: z.literal("member"), userId: z.string().cuid(), role: z.enum(["ADMIN", "MEMBER", "GUEST"]).nullable() }),
  z.object({ action: z.literal("board"), boardId: z.string().cuid(), remove: z.boolean().default(false) }),
  z.object({ action: z.literal("invite"), email: z.string().email().max(254), role: z.enum(["ADMIN", "MEMBER", "GUEST"]) }),
]);

export async function PATCH(request: Request, { params }: { params: Promise<{ spaceId: string }> }) {
  const origin = rejectCrossOrigin(request);
  if (origin) return origin;
  const user = await getApiUser();
  if (!user) return apiError(request, "UNAUTHORIZED", 401);
  const { spaceId } = await params;
  const parsed = schema.safeParse(await safeJson(request));
  if (!parsed.success) return apiError(request, "INVALID_INPUT", 400);
  const space = await prisma.space.findUnique({ where: { id: spaceId } });
  if (!space) return apiError(request, "NOT_FOUND", 404);
  const body = parsed.data;
  try {
    const result = await prisma.$transaction(
      async tx => {
        await lockSpaceOrganization(tx, space.organizationId, user.id);
        if (body.action === "rename") return tx.space.update({ where: { id: spaceId }, data: { name: body.name } });
        if (body.action === "member") {
          const member = await tx.organizationMember.findUnique({
            where: { organizationId_userId: { organizationId: space.organizationId, userId: body.userId } },
          });
          if (!member || (member.role === "GUEST" && body.role && body.role !== "GUEST")) throw new Error("INVALID_INPUT");
          if (body.role)
            await tx.spaceMember.upsert({
              where: { spaceId_userId: { spaceId, userId: body.userId } },
              create: { spaceId, userId: body.userId, role: body.role },
              update: { role: body.role },
            });
          else await tx.spaceMember.deleteMany({ where: { spaceId, userId: body.userId } });
          await syncSpace(tx, spaceId);
          if (
            !body.role &&
            !(await tx.spaceMember.count({ where: { userId: body.userId, space: { organizationId: space.organizationId } } })) &&
            !(await tx.workspaceMember.count({ where: { userId: body.userId, workspace: { organizationId: space.organizationId } } }))
          )
            await tx.organizationMember.deleteMany({
              where: { userId: body.userId, organizationId: space.organizationId, role: { in: ["MEMBER", "GUEST"] } },
            });
        }
        if (body.action === "board") {
          const board = await tx.workspace.findFirst({
            where: { id: body.boardId, organizationId: space.organizationId, lifecycleStatus: "ACTIVE" },
          });
          if (!board || (body.remove && board.spaceId !== spaceId)) throw new Error("NOT_FOUND");
          await tx.workspace.update({ where: { id: board.id }, data: { spaceId: body.remove ? null : spaceId } });
          await syncSpaceBoard(tx, board.id, body.remove ? null : spaceId);
        }
        if (body.action === "invite") {
          const email = body.email.trim().toLowerCase();
          const token = newInviteToken();
          await tx.workspaceInvite.updateMany({
            where: { spaceId, email, acceptedAt: null, revokedAt: null },
            data: { revokedAt: new Date() },
          });
          await tx.workspaceInvite.create({
            data: {
              organizationId: space.organizationId,
              spaceId,
              invitedById: user.id,
              email,
              role: body.role,
              tokenHash: token.tokenHash,
              expiresAt: token.expiresAt,
            },
          });
          return { invitePath: `/accept-invite?token=${encodeURIComponent(token.token)}` };
        }
        return { ok: true };
      },
      { timeout: 20000 },
    );
    return NextResponse.json(result);
  } catch (error) {
    return spaceError(request, error);
  }
}
