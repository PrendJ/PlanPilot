import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, getOrganizationAccess, isVerified } from "@/lib/auth";
import { appUrl } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { ITALIAN_INVOICE_FIELDS, creditPackPrice, stripe, stripeTaxEnabled } from "@/lib/stripe";
import { CREDIT_PACK, organizationReadOnly } from "@/lib/plans";
import { rejectCrossOrigin } from "@/lib/security";
import { apiError } from "@/lib/errors";

/** One-off pack of AI updates (never expires; used after the monthly allowance). */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return apiError(request, "UNAUTHORIZED", 401);
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  if (!isVerified(user)) return apiError(request, "EMAIL_NOT_VERIFIED", 403);
  const parsed = z
    .object({ organizationId: z.string().cuid(), packs: z.number().int().min(1).max(20).default(1) })
    .safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError(request, "INVALID_INPUT", 400);
  const membership = await getOrganizationAccess(user.id, parsed.data.organizationId);
  if (!membership || membership.role !== "OWNER") return apiError(request, "OWNER_ONLY", 403);
  // Packs top up an active plan; a frozen team needs a subscription first.
  if (organizationReadOnly(membership.organization) || membership.organization.plan === "TRIAL") return apiError(request, "READ_ONLY", 423);
  const existing = await prisma.subscription.findUnique({ where: { organizationId: membership.organizationId } });
  // Same customer type as the subscription: private customers see VAT-inclusive amounts.
  const customerType = existing?.customerType === "consumer" ? "consumer" : "business";
  const metadata = { organizationId: membership.organizationId, kind: "credits", units: String(CREDIT_PACK.units * parsed.data.packs) };
  try {
    const price = await creditPackPrice(customerType);
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      line_items: [{ price, quantity: parsed.data.packs }],
      success_url: appUrl("/account?credits=success", request),
      cancel_url: appUrl("/account?credits=cancelled", request),
      billing_address_collection: "required",
      tax_id_collection: { enabled: customerType === "business" },
      custom_fields: customerType === "business" ? ITALIAN_INVOICE_FIELDS : ITALIAN_INVOICE_FIELDS.filter(field => field.key === "cf"),
      invoice_creation: { enabled: true },
      ...(stripeTaxEnabled() && { automatic_tax: { enabled: true } }),
      metadata,
      payment_intent_data: { metadata },
      ...(existing?.stripeCustomerId
        ? { customer: existing.stripeCustomerId, customer_update: { name: "auto", address: "auto" } }
        : { customer_email: user.email }),
    });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Credit checkout failed", error);
    return apiError(request, "BILLING_UNAVAILABLE", 503);
  }
}
