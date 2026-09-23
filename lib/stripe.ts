import { createHash } from "node:crypto";
import Stripe from "stripe";
import {
  CREDIT_PACK,
  PLANS,
  SELLABLE_PLAN_KEYS,
  creditPackPriceCents,
  isSellablePlan,
  planPriceCents,
  type CustomerType,
  type SellablePlanKey,
} from "@/lib/plans";

export function stripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Billing is not configured");
  return new Stripe(key);
}

export function billingConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export type BillingInterval = "month" | "year";

/**
 * Prices are provisioned in the connected Stripe account on first use, so nothing has to be created by hand:
 * one product per plan with a fixed ID, and one price per plan, interval, customer type and amount, found
 * again through its lookup key. Changing an amount in lib/plans.ts creates a new price for new checkouts;
 * existing subscriptions keep the price they signed up with. Business prices are VAT-exclusive, consumer
 * prices VAT-inclusive (see consumerPriceCents).
 */
export const PRODUCTS = {
  PRO: { id: "boardcue_pro", name: "BoardCue Pro" },
  TEAM: { id: "boardcue_team", name: "BoardCue Team" },
  BUSINESS: { id: "boardcue_business", name: "BoardCue Business" },
  CREDITS: { id: "boardcue_ai_credits", name: "BoardCue, pacchetto aggiornamenti AI" },
} as const;

/** Flat prices of the previous catalogue: only used to recognise existing subscriptions. */
export const LEGACY_PRICE_ENV = { SOLO: "STRIPE_PRICE_SOLO", TEAM_LEGACY: "STRIPE_PRICE_TEAM", STUDIO: "STRIPE_PRICE_STUDIO" } as const;

export function priceLookupKey(
  item: SellablePlanKey | "CREDITS",
  interval: BillingInterval | "once",
  customerType: CustomerType,
  cents: number,
) {
  return `boardcue_${item.toLowerCase()}_${interval}_${customerType}_${cents}`;
}

const priceCache = new Map<string, string>();
const stripeCode = (error: unknown) => (error as { code?: string } | null)?.code;

async function ensureProduct(client: Stripe, product: { id: string; name: string }) {
  try {
    const found = await client.products.retrieve(product.id);
    if (!found.active) await client.products.update(product.id, { active: true });
  } catch (error) {
    if (stripeCode(error) !== "resource_missing") throw error;
    try {
      await client.products.create({ id: product.id, name: product.name });
    } catch (created) {
      if (stripeCode(created) !== "resource_already_exists") throw created;
    }
  }
}

async function findPrice(client: Stripe, lookupKey: string) {
  const [price] = (await client.prices.list({ lookup_keys: [lookupKey], limit: 1 })).data;
  if (price && !price.active) await client.prices.update(price.id, { active: true });
  return price?.id;
}

async function ensurePrice(input: {
  product: { id: string; name: string };
  lookupKey: string;
  cents: number;
  customerType: CustomerType;
  interval?: BillingInterval;
  metadata: Record<string, string>;
}) {
  const cached = priceCache.get(input.lookupKey);
  if (cached) return cached;
  const client = stripe();
  let id = await findPrice(client, input.lookupKey);
  if (!id) {
    await ensureProduct(client, input.product);
    try {
      const price = await client.prices.create({
        product: input.product.id,
        currency: "eur",
        unit_amount: input.cents,
        ...(input.interval && { recurring: { interval: input.interval } }),
        tax_behavior: input.customerType === "consumer" ? "inclusive" : "exclusive",
        lookup_key: input.lookupKey,
        metadata: input.metadata,
      });
      id = price.id;
    } catch (error) {
      // A concurrent checkout created it first (lookup keys are unique).
      id = await findPrice(client, input.lookupKey);
      if (!id) throw error;
    }
  }
  priceCache.set(input.lookupKey, id);
  return id;
}

export function planPrice(plan: SellablePlanKey, interval: BillingInterval, customerType: CustomerType) {
  const cents = planPriceCents(plan, interval, customerType);
  return ensurePrice({
    product: PRODUCTS[plan],
    lookupKey: priceLookupKey(plan, interval, customerType, cents),
    cents,
    customerType,
    interval,
    metadata: { boardcue_plan: plan, boardcue_interval: interval, boardcue_customer: customerType },
  });
}

export function creditPackPrice(customerType: CustomerType) {
  const cents = creditPackPriceCents(customerType);
  return ensurePrice({
    product: PRODUCTS.CREDITS,
    lookupKey: priceLookupKey("CREDITS", "once", customerType, cents),
    cents,
    customerType,
    metadata: { boardcue_kind: "credits", boardcue_units: String(CREDIT_PACK.units), boardcue_customer: customerType },
  });
}

type PriceLike = string | Pick<Stripe.Price, "id" | "metadata"> | null | undefined;

/** Maps a Stripe price back to our plan: provisioned prices carry it in metadata, legacy ones by env ID. */
export function planFromPrice(price: PriceLike): { plan: string; interval: BillingInterval; customerType: CustomerType | null } | null {
  if (!price) return null;
  if (typeof price !== "string") {
    const plan = price.metadata?.boardcue_plan;
    if (plan && isSellablePlan(plan))
      return {
        plan,
        interval: price.metadata.boardcue_interval === "year" ? "year" : "month",
        customerType: price.metadata.boardcue_customer === "consumer" ? "consumer" : "business",
      };
  }
  const id = typeof price === "string" ? price : price.id;
  for (const [plan, env] of Object.entries(LEGACY_PRICE_ENV))
    if (process.env[env] && process.env[env] === id) return { plan, interval: "month", customerType: null };
  return null;
}

const portalCache = new Map<string, string>();

/**
 * Customer portal configuration for the current catalogue: invoices, payment method, billing details,
 * cancellation at period end, plan switch among prices of the same customer type, and seat changes for
 * seat-based plans. Created once per catalogue version and reused.
 */
export async function portalConfiguration(customerType: CustomerType, urls: { privacy: string; terms: string }) {
  const products = await Promise.all(
    SELLABLE_PLAN_KEYS.map(async plan => ({
      product: PRODUCTS[plan].id,
      prices: [await planPrice(plan, "month", customerType), await planPrice(plan, "year", customerType)],
      adjustable_quantity: PLANS[plan].seatBased ? { enabled: true, minimum: PLANS[plan].minSeats, maximum: 500 } : { enabled: false },
    })),
  );
  const version = createHash("sha256").update(JSON.stringify(products)).digest("hex").slice(0, 16);
  const key = `${customerType}_${version}`;
  const cached = portalCache.get(key);
  if (cached) return cached;
  const client = stripe();
  const existing = (await client.billingPortal.configurations.list({ active: true, limit: 100 })).data.find(
    configuration => configuration.metadata?.boardcue === key,
  );
  const id =
    existing?.id ??
    (
      await client.billingPortal.configurations.create({
        business_profile: { privacy_policy_url: urls.privacy, terms_of_service_url: urls.terms },
        features: {
          customer_update: { enabled: true, allowed_updates: ["name", "email", "address", "tax_id"] },
          invoice_history: { enabled: true },
          payment_method_update: { enabled: true },
          subscription_cancel: { enabled: true, mode: "at_period_end" },
          subscription_update: {
            enabled: true,
            default_allowed_updates: ["price", "quantity", "promotion_code"],
            proration_behavior: "create_prorations",
            products,
          },
        },
        metadata: { boardcue: key },
      })
    ).id;
  portalCache.set(key, id);
  return id;
}

export function stripeTaxEnabled() {
  return process.env.STRIPE_TAX_ENABLED !== "false";
}

/**
 * Italian e-invoicing data collected at checkout. VAT numbers come from Stripe's tax ID collection;
 * SDI recipient code, PEC and fiscal code are custom fields (Stripe allows up to three).
 */
export const ITALIAN_INVOICE_FIELDS: Stripe.Checkout.SessionCreateParams.CustomField[] = [
  {
    key: "sdi",
    label: { type: "custom", custom: "Codice destinatario SDI (aziende)" },
    type: "text",
    optional: true,
    text: { minimum_length: 6, maximum_length: 7 },
  },
  {
    key: "pec",
    label: { type: "custom", custom: "PEC per fattura elettronica" },
    type: "text",
    optional: true,
    text: { maximum_length: 120 },
  },
  {
    key: "cf",
    label: { type: "custom", custom: "Codice fiscale" },
    type: "text",
    optional: true,
    text: { minimum_length: 11, maximum_length: 16 },
  },
];

export function fiscalDataFromSession(session: Stripe.Checkout.Session) {
  const field = (key: string) => session.custom_fields?.find(item => item.key === key)?.text?.value?.trim() || null;
  const vat = session.customer_details?.tax_ids?.find(item => item.type === "eu_vat")?.value || null;
  return {
    billingName: session.customer_details?.name || null,
    vatNumber: vat,
    fiscalCode: field("cf")?.toUpperCase() || null,
    sdiCode: field("sdi")?.toUpperCase() || null,
    pecEmail: field("pec")?.toLowerCase() || null,
    billingAddress: session.customer_details?.address ? JSON.parse(JSON.stringify(session.customer_details.address)) : null,
  };
}
