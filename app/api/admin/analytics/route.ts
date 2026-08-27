import { NextResponse } from "next/server";
import { requirePlatform } from "@/lib/platform-access";
import { getAdminAnalytics } from "@/lib/admin-analytics";
import { currentPeriodKey } from "@/lib/plans";

export async function GET(request: Request) {
  const access = await requirePlatform("METADATA");
  if ("error" in access) return access.error;
  const value = new URL(request.url).searchParams.get("period") || currentPeriodKey();
  const period = /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : currentPeriodKey();
  return NextResponse.json(await getAdminAnalytics(period));
}
