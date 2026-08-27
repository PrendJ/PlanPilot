import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatform } from "@/lib/platform-access";

export async function GET() {
  const access = await requirePlatform("BILLING"); if ("error" in access) return access.error;
  const subscriptions = await prisma.subscription.findMany({ orderBy: { updatedAt: "desc" }, include: { organization: { select: { id: true, name: true, slug: true, plan: true, licenseSource: true, accessExpiresAt: true, lifecycleStatus: true } } } });
  const dashboardBase = process.env.STRIPE_DASHBOARD_BASE_URL || "https://dashboard.stripe.com";
  return NextResponse.json({ subscriptions: subscriptions.map(({ organization, ...subscription }) => ({ organization, subscription, stripeCustomerUrl: subscription.stripeCustomerId ? `${dashboardBase}/customers/${subscription.stripeCustomerId}` : null })), directFinancialActions: false });
}
