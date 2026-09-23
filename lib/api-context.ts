import { NextResponse } from "next/server";
import type { User } from "@prisma/client";
import { getCurrentUser, twoFactorRequiredButMissing } from "@/lib/auth";
import { canManageRole, canWriteCards, workspaceForUser, workspaceReadOnly } from "@/lib/board";
import { apiError } from "@/lib/errors";
import { rejectCrossOrigin } from "@/lib/security";

export type BoardContext = {
  user: User;
  workspace: NonNullable<Awaited<ReturnType<typeof workspaceForUser>>>;
  role: string;
  readOnly: boolean;
};

type Need = { write?: boolean; manage?: boolean; comment?: boolean; mutation?: boolean };

/**
 * Resolves the signed-in user, the board and the member's role, and applies the common guards.
 * Returns a ready error response instead of throwing, so handlers stay linear:
 *   const ctx = await boardContext(request, slug, { write: true }); if (ctx instanceof NextResponse) return ctx;
 * These checks are a fast path; writes still re-check access under lock with assertBoardAccess.
 */
export async function boardContext(request: Request, slug: string, need: Need = {}): Promise<BoardContext | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError(request, "UNAUTHORIZED", 401);
  if (need.mutation || need.write || need.manage || need.comment) {
    const originError = rejectCrossOrigin(request);
    if (originError) return originError;
  }
  const workspace = await workspaceForUser(slug, user.id);
  if (!workspace) return apiError(request, "NOT_FOUND", 404);
  if (await twoFactorRequiredButMissing(user)) return apiError(request, "TWO_FACTOR_SETUP_REQUIRED", 403);
  const role = workspace.members[0]?.role || "GUEST";
  const readOnly = workspaceReadOnly(workspace);
  if ((need.write || need.manage || need.comment) && readOnly) return apiError(request, "READ_ONLY", 423);
  if (need.manage && !canManageRole(role)) return apiError(request, "FORBIDDEN", 403);
  if (need.write && !canWriteCards(role)) return apiError(request, "FORBIDDEN", 403);
  return { user, workspace, role, readOnly };
}

export function isResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}
