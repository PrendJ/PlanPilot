import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory fake of the few Stripe resources the catalogue uses. No network, no real account.
type FakePrice = {
  id: string;
  active: boolean;
  lookup_key: string;
  unit_amount: number;
  tax_behavior: string;
  metadata: Record<string, string>;
};
const store = vi.hoisted(() => ({
  products: new Map<string, { id: string; active: boolean }>(),
  prices: [] as FakePrice[],
  configurations: [] as { id: string; metadata: Record<string, string> }[],
  calls: { productCreate: 0, priceCreate: 0, portalCreate: 0 },
  failNextPriceCreate: false,
}));

vi.mock("stripe", () => {
  class FakeStripe {
    products = {
      retrieve: async (id: string) => {
        const product = store.products.get(id);
        if (!product) throw Object.assign(new Error("No such product"), { code: "resource_missing" });
        return product;
      },
      update: async (id: string, data: { active: boolean }) => Object.assign(store.products.get(id)!, data),
      create: async ({ id }: { id: string }) => {
        store.calls.productCreate++;
        const product = { id, active: true };
        store.products.set(id, product);
        return product;
      },
    };
    prices = {
      list: async ({ lookup_keys }: { lookup_keys: string[] }) => ({
        data: store.prices.filter(price => lookup_keys.includes(price.lookup_key)),
      }),
      update: async (id: string, data: { active: boolean }) =>
        Object.assign(
          store.prices.find(price => price.id === id)!,
          data,
        ),
      create: async (params: Omit<FakePrice, "id" | "active">) => {
        store.calls.priceCreate++;
        const price = { ...params, id: `price_${store.prices.length + 1}`, active: true };
        store.prices.push(price);
        if (store.failNextPriceCreate) {
          // Simulates a concurrent request that created the same lookup key first.
          store.failNextPriceCreate = false;
          throw Object.assign(new Error("lookup key already exists"), { code: "resource_already_exists" });
        }
        return price;
      },
    };
    billingPortal = {
      configurations: {
        list: async () => ({ data: store.configurations }),
        create: async ({ metadata }: { metadata: Record<string, string> }) => {
          store.calls.portalCreate++;
          const configuration = { id: `bpc_${store.configurations.length + 1}`, metadata };
          store.configurations.push(configuration);
          return configuration;
        },
      },
    };
  }
  return { default: FakeStripe };
});

async function catalog() {
  vi.resetModules();
  return import("@/lib/stripe");
}

beforeEach(() => {
  store.products.clear();
  store.prices.length = 0;
  store.configurations.length = 0;
  store.calls = { productCreate: 0, priceCreate: 0, portalCreate: 0 };
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_synthetic");
});

describe("self-provisioned Stripe catalogue", () => {
  it("creates the product and price once, then reuses them", async () => {
    const { planPrice } = await catalog();
    const first = await planPrice("PRO", "month", "business");
    expect(store.prices[0]).toMatchObject({
      lookup_key: "boardcue_pro_month_business_700",
      unit_amount: 700,
      tax_behavior: "exclusive",
      metadata: { boardcue_plan: "PRO", boardcue_interval: "month", boardcue_customer: "business" },
    });
    expect(await planPrice("PRO", "month", "business")).toBe(first);
    const again = await catalog(); // fresh process: found by lookup key, not created twice
    expect(await again.planPrice("PRO", "month", "business")).toBe(first);
    expect(store.calls).toMatchObject({ productCreate: 1, priceCreate: 1 });
  });

  it("uses VAT-inclusive consumer prices and per-seat amounts", async () => {
    const { planPrice, creditPackPrice } = await catalog();
    await planPrice("PRO", "month", "consumer");
    await planPrice("TEAM", "year", "consumer");
    await creditPackPrice("consumer");
    expect(store.prices.map(price => [price.lookup_key, price.unit_amount, price.tax_behavior])).toEqual([
      ["boardcue_pro_month_consumer_850", 850, "inclusive"],
      ["boardcue_team_year_consumer_7200", 7200, "inclusive"],
      ["boardcue_credits_once_consumer_730", 730, "inclusive"],
    ]);
  });

  it("survives a concurrent creation of the same price", async () => {
    const { planPrice } = await catalog();
    store.failNextPriceCreate = true;
    expect(await planPrice("BUSINESS", "month", "business")).toBe("price_1");
  });

  it("maps provisioned and legacy prices back to plans", async () => {
    vi.stubEnv("STRIPE_PRICE_TEAM", "price_old_team_flat");
    vi.stubEnv("STRIPE_PRICE_SOLO", "price_old_solo");
    const { planFromPrice } = await catalog();
    expect(
      planFromPrice({ id: "price_x", metadata: { boardcue_plan: "TEAM", boardcue_interval: "year", boardcue_customer: "consumer" } }),
    ).toEqual({
      plan: "TEAM",
      interval: "year",
      customerType: "consumer",
    });
    // The old STRIPE_PRICE_TEAM is the €24 flat plan, never the new per-seat Team.
    expect(planFromPrice({ id: "price_old_team_flat", metadata: {} })?.plan).toBe("TEAM_LEGACY");
    expect(planFromPrice("price_old_solo")?.plan).toBe("SOLO");
    expect(planFromPrice("price_unknown")).toBeNull();
  });

  it("creates one portal configuration per catalogue and customer type", async () => {
    const urls = { privacy: "https://example.test/privacy", terms: "https://example.test/terms" };
    const { portalConfiguration } = await catalog();
    const business = await portalConfiguration("business", urls);
    const again = await catalog();
    expect(await again.portalConfiguration("business", urls)).toBe(business);
    expect(await again.portalConfiguration("consumer", urls)).not.toBe(business);
    expect(store.calls.portalCreate).toBe(2);
  });
});
