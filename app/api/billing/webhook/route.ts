import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature"); const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });
  let event: Stripe.Event; try { event = stripe().webhooks.constructEvent(await request.text(), signature, secret); } catch { return NextResponse.json({ error: "Invalid signature" }, { status: 400 }); }
  if (await prisma.billingWebhook.findUnique({ where: { eventId: event.id } })) return NextResponse.json({ received: true });
  try {
    if (event.type.startsWith("customer.subscription.")) {
      const received = event.data.object as Stripe.Subscription; const current = await stripe().subscriptions.retrieve(received.id); const organizationId = current.metadata.organizationId; const plan = current.metadata.plan;
      if (organizationId && ["SOLO", "TEAM", "STUDIO", "ENTERPRISE"].includes(plan)) {
        const organization = await prisma.organization.findUnique({ where: { id: organizationId }, include: { createdBy: { select: { lifetimeFree: true } } } });
        if (organization) {
          const periodEnd = (current.items.data[0] as Stripe.SubscriptionItem | undefined)?.current_period_end; const active = ["active", "trialing", "past_due"].includes(current.status); const complimentary = organization.licenseSource === "LIFETIME" || organization.createdBy.lifetimeFree;
          const stripeData = complimentary || organization.licenseSource === "MANUAL" ? {} : { plan: active ? plan : "TRIAL", licenseSource: (active ? "STRIPE" : "TRIAL") as "STRIPE" | "TRIAL", accessExpiresAt: null, trialEndsAt: active ? null : new Date(Date.now() + 7 * 86400000), readOnlyAt: active ? null : new Date(), deleteAfter: active ? null : new Date(Date.now() + 30 * 86400000) };
          await prisma.$transaction([
            prisma.subscription.upsert({ where: { organizationId }, create: { organizationId, stripeCustomerId: String(current.customer), stripeSubscriptionId: current.id, stripePriceId: current.items.data[0]?.price.id, status: current.status, currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null, cancelAtPeriodEnd: current.cancel_at_period_end }, update: { stripeCustomerId: String(current.customer), stripeSubscriptionId: current.id, stripePriceId: current.items.data[0]?.price.id, status: current.status, currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null, cancelAtPeriodEnd: current.cancel_at_period_end } }),
            prisma.organization.update({ where: { id: organizationId }, data: complimentary ? { plan: "LIFETIME", licenseSource: "LIFETIME", trialEndsAt: null, readOnlyAt: null, deleteAfter: null } : stripeData }),
          ]);
        }
      }
    }
    await prisma.billingWebhook.create({ data: { eventId: event.id, type: event.type } }); return NextResponse.json({ received: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Webhook failed" }, { status: 500 }); }
}
