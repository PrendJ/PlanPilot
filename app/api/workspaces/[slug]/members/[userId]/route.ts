import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { boardContext, isResponse } from "@/lib/api-context";
import { apiError, type ErrorCode } from "@/lib/errors";
import { mutateMembership } from "@/lib/membership-mutation";
import { safeJson } from "@/lib/security";

function failure(request: Request, error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (["NOT_FOUND", "FORBIDDEN", "LAST_OWNER", "MEMBER_LIMIT", "READ_ONLY"].includes(code))
    return apiError(request, code as ErrorCode, code === "NOT_FOUND" ? 404 : code === "MEMBER_LIMIT" ? 402 : code === "LAST_OWNER" ? 400 : code === "READ_ONLY" ? 423 : 403);
  throw error;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string; userId: string }> }) {
  const { slug, userId } = await params;
  const ctx = await boardContext(request, slug, { manage: true });
  if (isResponse(ctx)) return ctx;
  if (ctx.role !== "OWNER") return apiError(request, "FORBIDDEN", 403);
  const parsed = z.object({ role: z.enum(["OWNER", "ADMIN", "MEMBER", "GUEST"]) }).safeParse(await safeJson(request));
  if (!parsed.success) return apiError(request, "INVALID_INPUT", 400);
  try {
    const membership = await prisma.$transaction(tx => mutateMembership(tx, { workspaceId: ctx.workspace.id, userId, actorId: ctx.user.id, role: parsed.data.role }));
    return NextResponse.json({ membership });
  } catch (error) { return failure(request, error); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ slug: string; userId: string }> }) {
  const { slug, userId } = await params;
  const ctx = await boardContext(request, slug, { mutation: true });
  if (isResponse(ctx)) return ctx;
  try {
    await prisma.$transaction(tx => mutateMembership(tx, { workspaceId: ctx.workspace.id, userId, actorId: ctx.user.id }));
    return NextResponse.json({ ok: true });
  } catch (error) { return failure(request, error); }
}
