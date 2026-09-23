import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { fiscalDataFromSession, planFromPrice, stripe } from "@/lib/stripe";
import { trackEvent } from "@/lib/product-events";

const ACTIVE = ["active", "trialing", "past_due"];

async function syncSubscription(received: Stripe.Subscription) {
  const current = await stripe().subscriptions.retrieve(received.id);
  const organizationId = current.metadata.organizationId;
  if (!organizationId) return;
  const item = current.items.data[0] as Stripe.SubscriptionItem | undefined;
  const mapped = planFromPrice(item?.price);
  // Subscriptions created by the previous checkout (no customerType) carry plan "TEAM" but bill the old flat price.
  const metadataPlan = current.metadata.plan === "TEAM" && !current.metadata.customerType ? "TEAM_LEGACY" : current.metadata.plan;
  const plan = mapped?.plan || metadataPlan;
  if (!plan || !["PRO", "TEAM", "BUSINESS", "ENTERPRISE", "SOLO", "TEAM_LEGACY", "STUDIO"].includes(plan)) return;
  const customerType = mapped?.customerType ?? (current.metadata.customerType === "consumer" ? "consumer" : null);
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: { createdBy: { select: { lifetimeFree: true } } },
  });
  if (!organization) return;
  const periodEnd = item?.current_period_end;
  const active = ACTIVE.includes(current.status);
  const complimentary = organization.licenseSource === "LIFETIME" || organization.createdBy.lifetimeFree;
  // Manual and lifetime licenses win over Stripe. A lapsed subscription freezes the team (read-only,
  // exportable) and never schedules deletion: data stays until the customer resubscribes or deletes it.
  const planData =
    complimentary || organization.licenseSource === "MANUAL"
      ? {}
      : active
        ? {
            plan,
            licenseSource: "STRIPE" as const,
            seats: item?.quantity ?? 1,
            billingInterval: mapped?.interval || item?.price.recurring?.interval || "month",
            accessExpiresAt: null,
            trialEndsAt: null,
            readOnlyAt: null,
            deleteAfter: null,
            paidAt: organization.paidAt || new Date(),
          }
        : { readOnlyAt: organization.readOnlyAt || new Date(), deleteAfter: null };
  const legalType = customerType ? { legalType: customerType === "consumer" ? "PERSONAL" : "BUSINESS" } : {};
  const subscriptionData = {
    stripeCustomerId: String(current.customer),
    stripeSubscriptionId: current.id,
    stripePriceId: item?.price.id,
    plan,
    customerType,
    status: current.status,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
    cancelAtPeriodEnd: current.cancel_at_period_end,
  };
  await prisma.$transaction([
    prisma.subscription.upsert({ where: { organizationId }, create: { organizationId, ...subscriptionData }, update: subscriptionData }),
    prisma.organization.update({
      where: { id: organizationId },
      data: complimentary
        ? { plan: "LIFETIME", licenseSource: "LIFETIME", trialEndsAt: null, readOnlyAt: null, deleteAfter: null }
        : { ...planData, ...legalType },
    }),
  ]);
  if (active && !organization.paidAt && !complimentary) await trackEvent("subscription_started");
}

async function completeCheckout(session: Stripe.Checkout.Session) {
  const organizationId = session.metadata?.organizationId;
  if (!organizationId) return;
  const fiscal = fiscalDataFromSession(session);
  await prisma.organization.updateMany({
    where: { id: organizationId },
    data: Object.fromEntries(Object.entries(fiscal).filter(([, value]) => value !== null)),
  });
  if (session.mode === "payment" && session.metadata?.kind === "credits" && session.payment_status === "paid") {
    const units = Math.max(0, Math.min(100000, Number(session.metadata.units || 0)));
    if (units)
      await prisma.creditGrant.upsert({
        where: { stripeSessionId: session.id },
        create: { organizationId, units, remaining: units, source: "STRIPE", stripeSessionId: session.id },
        update: {},
      });
  }
  if (session.customer && session.mode === "subscription") {
    await prisma.subscription
      .upsert({
        where: { organizationId },
        create: { organizationId, stripeCustomerId: String(session.customer), status: "incomplete" },
        update: { stripeCustomerId: String(session.customer) },
      })
      .catch(() => undefined);
  }
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  if (await prisma.billingWebhook.findUnique({ where: { eventId: event.id } })) return NextResponse.json({ received: true });
  try {
    if (event.type.startsWith("customer.subscription.")) await syncSubscription(event.data.object as Stripe.Subscription);
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded")
      await completeCheckout(event.data.object as Stripe.Checkout.Session);
    await prisma.billingWebhook.create({ data: { eventId: event.id, type: event.type } });
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook failed", error);
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}
