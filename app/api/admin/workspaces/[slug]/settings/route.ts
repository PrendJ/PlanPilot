import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PLAN_MODEL_IDS, TRANSCRIPTION_MODEL_IDS } from "@/lib/model-catalog";

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { slug } = await params;
  const body = await request.json().catch(() => ({}));
  const planModel = String(body.planModel || "");
  const transcriptionModel = String(body.transcriptionModel || "");
  if (!PLAN_MODEL_IDS.has(planModel)) return NextResponse.json({ error: "Modello AI non consentito" }, { status: 400 });
  if (!TRANSCRIPTION_MODEL_IDS.has(transcriptionModel)) return NextResponse.json({ error: "Modello di dettatura non consentito" }, { status: 400 });
  const workspace = await prisma.workspace.update({
    where: { slug },
    data: { planModel, transcriptionModel, dictationEnabled: Boolean(body.dictationEnabled) },
    select: { id: true, name: true, slug: true, planModel: true, transcriptionModel: true, dictationEnabled: true },
  });
  return NextResponse.json({ workspace });
}
