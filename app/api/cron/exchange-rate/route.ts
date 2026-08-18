import { NextResponse } from "next/server";
import { refreshUsdToEurRate } from "@/lib/exchange-rate";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await refreshUsdToEurRate());
}
