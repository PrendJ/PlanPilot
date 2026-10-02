import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatform } from "@/lib/platform-access";
import { rejectCrossOrigin } from "@/lib/security";
import { isAllowedPlanningModel, isAllowedTranscriptionModel, platformModelOptions, platformModels, setPlatformModels } from "@/lib/platform-ai";

const schema = z.object({ planModel: z.string().min(1).max(200), transcriptionModel: z.string().min(1).max(200) });

/** Platform staff can read the current models; only the superadmin (PLATFORM_ADMIN) can change them. */
export async function GET() {
  const access = await requirePlatform("METADATA");
  if ("error" in access) return access.error;
  return NextResponse.json({ current: await platformModels(), options: platformModelOptions() });
}

export async function PATCH(request: Request) {
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  const access = await requirePlatform("PLATFORM_ADMIN");
  if ("error" in access) return access.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Indica un modello di pianificazione e uno di dettatura." }, { status: 400 });
  if (!isAllowedPlanningModel(parsed.data.planModel)) return NextResponse.json({ error: "Modello di pianificazione non consentito" }, { status: 400 });
  if (!isAllowedTranscriptionModel(parsed.data.transcriptionModel)) return NextResponse.json({ error: "Modello di dettatura non consentito" }, { status: 400 });
  try {
    const current = await setPlatformModels(parsed.data, access.user.id);
    return NextResponse.json({ current, options: platformModelOptions() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Aggiornamento non riuscito" }, { status: 400 });
  }
}
