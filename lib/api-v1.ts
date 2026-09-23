import { NextResponse } from "next/server";
import { userFromApiToken } from "@/lib/auth";
import { canWriteCards, workspaceForUser, workspaceReadOnly } from "@/lib/board";
import { rateLimit } from "@/lib/security";

export function v1Error(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** Public API v1: personal token auth, 120 requests/minute per token owner. */
export async function v1User(request: Request) {
  const user = await userFromApiToken(request);
  if (!user) return v1Error(401, "UNAUTHORIZED", "Missing or invalid API token");
  const limited = await rateLimit(`api:${user.id}`, 120, 60_000, request);
  if (limited) return v1Error(429, "RATE_LIMITED", "Too many requests");
  return user;
}

export async function v1Board(request: Request, slug: string, write = false) {
  const user = await v1User(request);
  if (user instanceof NextResponse) return user;
  const workspace = await workspaceForUser(slug, user.id);
  if (!workspace || workspace.lifecycleStatus !== "ACTIVE") return v1Error(404, "NOT_FOUND", "Board not found");
  const role = workspace.members[0]?.role || "GUEST";
  if (write && (!canWriteCards(role) || workspaceReadOnly(workspace)))
    return v1Error(403, "FORBIDDEN", "This token cannot modify the board");
  return { user, workspace, role };
}
