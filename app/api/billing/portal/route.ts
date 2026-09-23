import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, getOrganizationAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { portalConfiguration, stripe } from "@/lib/stripe";
import { appUrl } from "@/lib/email";
import { rejectCrossOrigin } from "@/lib/security";
import { apiError } from "@/lib/errors";

/** Stripe customer portal: invoices, payment method, seats, plan change, cancellation. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return apiError(request, "UNAUTHORIZED", 401);
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  const parsed = z.object({ organizationId: z.string().cuid() }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError(request, "INVALID_INPUT", 400);
  const access = await getOrganizationAccess(user.id, parsed.data.organizationId);
  if (!access || access.role !== "OWNER") return apiError(request, "OWNER_ONLY", 403);
  const subscription = await prisma.subscription.findUnique({ where: { organizationId: parsed.data.organizationId } });
  if (!subscription?.stripeCustomerId) return apiError(request, "NOT_FOUND", 404);
  try {
    const configuration = await portalConfiguration(subscription.customerType === "consumer" ? "consumer" : "business", {
      privacy: appUrl("/privacy", request),
      terms: appUrl("/terms", request),
    });
    const session = await stripe().billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      configuration,
      return_url: appUrl("/account", request),
    });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Billing portal failed", error);
    return apiError(request, "BILLING_UNAVAILABLE", 503);
  }
}
