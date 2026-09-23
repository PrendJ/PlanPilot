import { prisma } from "@/lib/prisma";

/**
 * Privacy-preserving product analytics: daily counters per event name, with no user, organization,
 * IP or content attached. Used only for aggregate KPIs (signups, AI updates, conversions).
 */
export const PRODUCT_EVENTS = [
  "signup",
  "ai_update_proposed",
  "ai_update_applied",
  "ai_update_discarded",
  "ai_update_undone",
  "dictation",
  "invite_sent",
  "checkout_started",
  "subscription_started",
  "import_completed",
  "card_created",
] as const;
export type ProductEventName = (typeof PRODUCT_EVENTS)[number];

export function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export async function trackEvent(name: ProductEventName, count = 1) {
  await prisma.productEvent
    .upsert({
      where: { name_day: { name, day: dayKey() } },
      create: { name, day: dayKey(), count },
      update: { count: { increment: count } },
    })
    .catch(() => undefined);
}
