import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, twoFactorRequiredButMissing } from "@/lib/auth";
import { canWriteCards, workspaceReadOnly } from "@/lib/board";
import { apiError } from "@/lib/errors";
import { getUsageStatus, recordUsage } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { rateLimit, rejectCrossOrigin } from "@/lib/security";
import { getWorkspaceApiKey } from "@/lib/workspace";
import { routeHomeCapture } from "@/lib/home-routing";
import { platformModels } from "@/lib/platform-ai";

const schema = z.object({ text: z.string().trim().min(1).max(12000) });

/** Only board names, team names and kind plus the submitted text are sent for routing; card data is loaded by the chosen board later. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return apiError(request, "UNAUTHORIZED", 401);
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  if (await twoFactorRequiredButMissing(user)) return apiError(request, "TWO_FACTOR_SETUP_REQUIRED", 403);
  const limited = await rateLimit(`home-route:${user.id}`, 20, 60_000, request);
  if (limited) return limited;
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError(request, "INVALID_INPUT", 400);
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: user.id, workspace: { lifecycleStatus: "ACTIVE" } },
    include: { workspace: { include: { organization: true } } },
    orderBy: { createdAt: "asc" },
  });
  const writable = memberships.filter(item => canWriteCards(item.role) && !workspaceReadOnly(item.workspace));
  if (!writable.length) return apiError(request, "READ_ONLY", 423);
  const boards = writable.map(item => ({ id: item.workspace.id, name: item.workspace.name, slug: item.workspace.slug }));
  const routeBoards = writable.map(item => ({
    id: item.workspace.id,
    name: item.workspace.name,
    team: item.workspace.organization.name,
    kind: (item.workspace.presetKey === "PERSONAL" || item.workspace.organization.legalType === "PERSONAL" ? "personal" : "work") as
      "personal" | "work",
  }));
  // Routing is billed to the user's own default team when possible, never to an arbitrary team they joined.
  const keyed = writable.filter(item => getWorkspaceApiKey(item.workspace));
  const anchor = keyed.find(item => item.workspace.organizationId === user.defaultOrganizationId) || keyed[0] || writable[0];
  const quota = await getUsageStatus(anchor.workspace.organizationId);
  const { planModel } = await platformModels();
  const result = await routeHomeCapture({
    text: parsed.data.text,
    boards: routeBoards,
    apiKey: quota?.status === "PAUSED" ? null : getWorkspaceApiKey(anchor.workspace),
    model: planModel,
  });
  if (result.cost)
    await recordUsage({
      organizationId: anchor.workspace.organizationId,
      workspaceId: anchor.workspace.id,
      userId: user.id,
      providerRequestId: result.requestId,
      category: "ROUTING",
      model: planModel,
      costUsd: result.cost,
    });
  return NextResponse.json({ segments: result.segments, boards });
}
