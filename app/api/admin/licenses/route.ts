import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatform } from "@/lib/platform-access";
import { grantManualLicense, isValidPlan, revokeManualLicense } from "@/lib/licenses";

const schema = z.object({ organizationId: z.string().cuid(), action: z.enum(["grant", "revoke"]), plan: z.string().optional(), expiresAt: z.string().datetime().nullable().optional(), reason: z.string().trim().min(4).max(1000) });
export async function POST(request: Request) {
  const access = await requirePlatform("LICENSE"); if ("error" in access) return access.error;
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Invalid license request" }, { status: 400 });
  try {
    const result = parsed.data.action === "revoke" ? await revokeManualLicense({ organizationId: parsed.data.organizationId, actorId: access.user.id, reason: parsed.data.reason }) : !parsed.data.plan || !isValidPlan(parsed.data.plan) ? null : await grantManualLicense({ organizationId: parsed.data.organizationId, plan: parsed.data.plan, expiresAt: parsed.data.expiresAt, actorId: access.user.id, reason: parsed.data.reason });
    if (!result) return NextResponse.json({ error: "A valid plan is required" }, { status: 400 });
    return NextResponse.json({ organization: result });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "License action failed" }, { status: 400 }); }
}
