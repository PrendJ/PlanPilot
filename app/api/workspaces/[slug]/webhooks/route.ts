import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { boardContext, isResponse } from "@/lib/api-context";
import { apiError } from "@/lib/errors";
import { assertSafeWebhookUrl, newWebhookSecret, WEBHOOK_EVENTS } from "@/lib/webhooks";

const select = {
  id: true,
  url: true,
  format: true,
  events: true,
  active: true,
  lastStatus: true,
  lastError: true,
  createdAt: true,
} as const;

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await boardContext(request, slug, { manage: true });
  if (isResponse(ctx)) return ctx;
  const webhooks = await prisma.webhook.findMany({ where: { workspaceId: ctx.workspace.id }, orderBy: { createdAt: "desc" }, select });
  return NextResponse.json({ webhooks, events: WEBHOOK_EVENTS });
}

/** Outgoing webhooks (generic JSON signed with HMAC-SHA256, or Slack/Teams-compatible text). */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await boardContext(request, slug, { manage: true });
  if (isResponse(ctx)) return ctx;
  const parsed = z
    .object({
      url: z.string().url().max(500),
      format: z.enum(["json", "slack"]).default("json"),
      events: z.array(z.enum(WEBHOOK_EVENTS)).max(WEBHOOK_EVENTS.length).default([]),
    })
    .safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError(request, "INVALID_INPUT", 400);
  try {
    await assertSafeWebhookUrl(parsed.data.url);
  } catch {
    return apiError(request, "INVALID_INPUT", 400);
  }
  if ((await prisma.webhook.count({ where: { workspaceId: ctx.workspace.id } })) >= 10) return apiError(request, "INVALID_INPUT", 400);
  const secret = newWebhookSecret();
  const webhook = await prisma.webhook.create({
    data: {
      workspaceId: ctx.workspace.id,
      url: parsed.data.url,
      format: parsed.data.format,
      events: parsed.data.events,
      secret,
      createdById: ctx.user.id,
    },
    select,
  });
  return NextResponse.json({ webhook, secret }, { status: 201 });
}
