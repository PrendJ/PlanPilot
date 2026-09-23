import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { boardContext, isResponse } from "@/lib/api-context";
import { apiError } from "@/lib/errors";
import { dispatchWebhooks } from "@/lib/webhooks";

/** Pause/resume, or send a test event (delivered immediately). */
export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string; webhookId: string }> }) {
  const { slug, webhookId } = await params;
  const ctx = await boardContext(request, slug, { manage: true });
  if (isResponse(ctx)) return ctx;
  const parsed = z
    .object({ active: z.boolean().optional(), test: z.boolean().optional() })
    .safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError(request, "INVALID_INPUT", 400);
  const webhook = await prisma.webhook.findFirst({ where: { id: webhookId, workspaceId: ctx.workspace.id } });
  if (!webhook) return apiError(request, "NOT_FOUND", 404);
  if (parsed.data.active !== undefined) await prisma.webhook.update({ where: { id: webhook.id }, data: { active: parsed.data.active } });
  if (parsed.data.test) {
    await prisma.webhookDelivery.create({
      data: {
        webhookId: webhook.id,
        eventType: "card.updated",
        payload: {
          event: "card.updated",
          workspaceId: ctx.workspace.id,
          test: true,
          data: { after: { title: "Evento di prova BoardCue" } },
        },
      },
    });
    await dispatchWebhooks(5);
  }
  const updated = await prisma.webhook.findUniqueOrThrow({
    where: { id: webhook.id },
    select: { id: true, active: true, lastStatus: true, lastError: true },
  });
  return NextResponse.json({ webhook: updated });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ slug: string; webhookId: string }> }) {
  const { slug, webhookId } = await params;
  const ctx = await boardContext(request, slug, { manage: true });
  if (isResponse(ctx)) return ctx;
  const deleted = await prisma.webhook.deleteMany({ where: { id: webhookId, workspaceId: ctx.workspace.id } });
  if (!deleted.count) return apiError(request, "NOT_FOUND", 404);
  return NextResponse.json({ ok: true });
}
