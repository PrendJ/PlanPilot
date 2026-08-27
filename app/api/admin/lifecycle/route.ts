import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatform } from "@/lib/platform-access";
import { changeLifecycle } from "@/lib/lifecycle";

const schema = z.object({ subject: z.enum(["user", "organization", "workspace"]), id: z.string().min(1), action: z.enum(["suspend", "reactivate", "archive"]), reason: z.string().trim().min(4).max(1000), transferSupportUserId: z.string().min(1).optional() });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid lifecycle request" }, { status: 400 });
  const access = await requirePlatform(parsed.data.action === "archive" ? "PLATFORM_ADMIN" : "SUPPORT");
  if ("error" in access) return access.error;
  try { await changeLifecycle({ ...parsed.data, actorId: access.user.id }); return NextResponse.json({ ok: true }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Lifecycle action failed" }, { status: 400 }); }
}
