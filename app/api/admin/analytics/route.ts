import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAdminAnalytics } from "@/lib/admin-analytics";
import { currentPeriodKey } from "@/lib/plans";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const value = new URL(request.url).searchParams.get("period") || currentPeriodKey();
  const period = /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : currentPeriodKey();
  return NextResponse.json(await getAdminAnalytics(period));
}
