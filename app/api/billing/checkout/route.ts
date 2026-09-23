import { NextResponse } from "next/server";
import { z } from "zod";
import type Stripe from "stripe";
import { getCurrentUser, getOrganizationAccess, isVerified } from "@/lib/auth";
import { appUrl } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { ITALIAN_INVOICE_FIELDS, planPrice, stripe, stripeTaxEnabled } from "@/lib/stripe";
import { PLANS, SELLABLE_PLAN_KEYS } from "@/lib/plans";
import { rejectCrossOrigin } from "@/lib/security";
import { apiError } from "@/lib/errors";
import { usedSeats } from "@/lib/invites";
import { trackEvent } from "@/lib/product-events";

const schema = z.object({
  organizationId: z.string().cuid(),
  plan: z.enum(SELLABLE_PLAN_KEYS),
  interval: z.enum(["month", "year"]).default("month"),
  seats: z.number().int().min(1).max(500).optional(),
  // Private customers pay the VAT-inclusive price; businesses pay net + VAT (or reverse charge).
  customerType: z.enum(["business", "consumer"]).default("business"),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return apiError(request, "UNAUTHORIZED", 401);
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  if (!isVerified(user)) return apiError(request, "EMAIL_NOT_VERIFIED", 403);
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError(request, "INVALID_INPUT", 400);
  const membership = await getOrganizationAccess(user.id, parsed.data.organizationId);
  if (!membership || membership.role !== "OWNER") return apiError(request, "OWNER_ONLY", 403);
  if (membership.organization.plan === "LIFETIME") return apiError(request, "INVALID_INPUT", 400);
  const customerType = parsed.data.customerType;
  const plan = PLANS[parsed.data.plan];
  // Seat plans start from the people already in the team (never below the minimum of 2).
  const seats = plan.seatBased ? Math.max(plan.minSeats, parsed.data.seats || 0, await usedSeats(membership.organizationId)) : 1;
  const existing = await prisma.subscription.findUnique({ where: { organizationId: membership.organizationId } });
  const metadata = { organizationId: membership.organizationId, plan: parsed.data.plan, interval: parsed.data.interval, customerType };
  let price: string;
  try {
    price = await planPrice(parsed.data.plan, parsed.data.interval, customerType);
  } catch (error) {
    console.error("Stripe price provisioning failed", error);
    return apiError(request, "BILLING_UNAVAILABLE", 503);
  }
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    line_items: [
      {
        price,
        quantity: seats,
        ...(plan.seatBased && {
          adjustable_quantity: {
            enabled: true,
            minimum: Math.max(plan.minSeats, await usedSeats(membership.organizationId)),
            maximum: 500,
          },
        }),
      },
    ],
    success_url: appUrl("/app?checkout=success", request),
    cancel_url: appUrl("/pricing?checkout=cancelled", request),
    allow_promotion_codes: true,
    billing_address_collection: "required",
    tax_id_collection: { enabled: customerType === "business" },
    custom_fields: customerType === "business" ? ITALIAN_INVOICE_FIELDS : ITALIAN_INVOICE_FIELDS.filter(field => field.key === "cf"),
    locale: "auto",
    ...(stripeTaxEnabled() && { automatic_tax: { enabled: true } }),
    subscription_data: { metadata },
    metadata,
    ...(existing?.stripeCustomerId
      ? { customer: existing.stripeCustomerId, customer_update: { name: "auto", address: "auto" } }
      : { customer_email: user.email }),
  };
  try {
    const session = await stripe().checkout.sessions.create(params);
    await trackEvent("checkout_started");
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Checkout creation failed", error);
    return apiError(request, "BILLING_UNAVAILABLE", 503);
  }
}
