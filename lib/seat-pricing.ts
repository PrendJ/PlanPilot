/** Pure pricing math shared by the public quote and Stripe's graduated tiers. */
export type SeatTier = { upTo: number | null; cents: number };
export const SEAT_PRICING_VERSION = "graduated-v1";
/** Assumptions of docs/ANALISI_ECONOMICA_POSTI_2026-10-30.md (scenario: 1,000 paid seats platform-wide). */
export const SEAT_ECONOMICS = {
  margin: 0.3,
  riskReserve: 0.01,
  // Stripe premium card + Billing + Tax, applied to the gross amount (net + 22% VAT, business customers too).
  feeRateOnGross: 0.04,
  feeVatMultiplier: 1.22,
  fixedFeeEur: 0.25,
  // Average all-in AI cost per included update, with the whole quota consumed.
  aiUpdateEur: 0.0025,
  // €0.10 capacity reserve + (€120 shared infrastructure + 2 maintenance hours) / 1,000 seats.
  infrastructureEur: 0.1 + (120 + 2 * 50) / 1000,
  supportHourlyEur: 50,
  supportMinutes: { standard: 1, priority: 3 },
  annualPaidMonths: 10,
  annualServedMonths: 12,
  floorSeat: 100,
  priceStepCents: 5,
} as const;
/** Each band is priced at its first seat; every price is a multiple of 5 cents. */
const BAND_STARTS = [1, 4, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

/** Price from seat 100 that protects a 30% margin on annual billing, rounded up to 5 cents. */
export function seatFloorCents(aiUpdates: number, prioritySupport: boolean, vatMultiplier: number) {
  const e = SEAT_ECONOMICS;
  const minutes = prioritySupport ? e.supportMinutes.priority : e.supportMinutes.standard;
  const cost = aiUpdates * e.aiUpdateEur + e.infrastructureEur + (minutes * e.supportHourlyEur) / 60;
  const net =
    (e.annualServedMonths * cost + e.fixedFeeEur / e.floorSeat) /
    (e.annualPaidMonths * (1 - e.margin - e.riskReserve - e.feeRateOnGross * e.feeVatMultiplier));
  return Math.ceil((net * vatMultiplier * 100) / e.priceStepCents - 1e-9) * e.priceStepCents;
}

export function graduatedSeatTiers(baseCents: number, floorCents: number, annual = false): SeatTier[] {
  if (floorCents > baseCents) throw new Error("Seat price is below its profitability floor");
  const step = SEAT_ECONOMICS.priceStepCents;
  const belowBase = Math.ceil(baseCents / step) * step - step;
  const tiers: SeatTier[] = [];
  BAND_STARTS.forEach((from, index) => {
    const raw = baseCents - ((baseCents - floorCents) * (from - 3)) / (SEAT_ECONOMICS.floorSeat - 3);
    // The 4th seat gets at least one step off; seats before the 100th stay at least one step above the floor.
    const monthly =
      from <= 3 || floorCents === baseCents
        ? baseCents
        : from >= SEAT_ECONOMICS.floorSeat
          ? floorCents
          : Math.min(belowBase, Math.max(floorCents + step, Math.round(raw / step) * step));
    const cents = monthly * (annual ? SEAT_ECONOMICS.annualPaidMonths : 1);
    const upTo = BAND_STARTS[index + 1] ? BAND_STARTS[index + 1] - 1 : null;
    const last = tiers[tiers.length - 1];
    if (last?.cents === cents) last.upTo = upTo;
    else tiers.push({ upTo, cents });
  });
  return tiers;
}

export function seatTotalCents(tiers: SeatTier[], seats: number) {
  if (!Number.isSafeInteger(seats) || seats < 0) throw new Error("Invalid seat quantity");
  let previous = 0,
    total = 0;
  for (const tier of tiers) {
    const end = Math.min(seats, tier.upTo ?? seats);
    total += Math.max(0, end - previous) * tier.cents;
    previous = end;
    if (end === seats) return total;
  }
  throw new Error("Incomplete seat price tiers");
}
