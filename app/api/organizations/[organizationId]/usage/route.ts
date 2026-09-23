import { NextResponse } from "next/server";
import { getCurrentUser, getOrganizationAccess } from "@/lib/auth";
import { getUsageStatus } from "@/lib/plans";
import { apiError } from "@/lib/errors";

export async function GET(request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return apiError(request, "UNAUTHORIZED", 401);
  const { organizationId } = await params;
  if (!(await getOrganizationAccess(user.id, organizationId))) return apiError(request, "NOT_FOUND", 404);
  const usage = await getUsageStatus(organizationId);
  return NextResponse.json(
    usage
      ? {
          used: usage.used,
          included: usage.included,
          credits: usage.credits,
          percent: usage.percent,
          status: usage.status,
          resetsAt: usage.resetsAt,
        }
      : null,
  );
}
