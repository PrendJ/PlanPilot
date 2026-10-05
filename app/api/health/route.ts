import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function deployedVersion() {
  if (process.env.APP_VERSION) return process.env.APP_VERSION;
  try {
    return readFileSync(join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim() || "unknown";
  } catch {
    return "unknown";
  }
}

/** Liveness + database readiness for uptime monitors and the post-deploy smoke test. No secrets, no details. */
export async function GET() {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { status: "ok", db: "ok", latencyMs: Date.now() - started, version: deployedVersion() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ status: "degraded", db: "unreachable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
