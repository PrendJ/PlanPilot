/** Proposal calculator only. Does not import or mutate the commercial catalogue or call any service. */
import assert from 'node:assert/strict';

export const assumptions = {
  vat: 1.22,
  stripeRateOnGross: 0.04,
  riskReserveOnNet: 0.01,
  targetMargin: 0.30,
  annualPaidMonths: 10,
  annualServedMonths: 12,
  confirmedCurrentHostMonthlyEur: 7.50,
  sharedInfrastructureMonthlyEur: 120,
  platformMaintenanceHours: 2,
  totalPaidSeats: 1000,
  variableInfraPerSeatEur: 0.10,
  aiAllInEur: 0.0025,
  stressAiAllInEur: 0.005 * 1.055,
  supportHourlyEur: 50,
  fixedFeePerInvoiceEur: 0.25,
  floorFromSeat: 100,
  priceStepCents: 5,
};

export const plans = [
  { name: 'Family', quota: 300, baseCents: 450, previousFloorCents: 380, gross: true, supportMinutes: 1 },
  { name: 'Team', quota: 600, baseCents: 600, previousFloorCents: 580, gross: false, supportMinutes: 1 },
  { name: 'Business', quota: 1000, baseCents: 1000, previousFloorCents: 940, gross: false, supportMinutes: 3 },
];

const roundUpCents = euro => Math.ceil(euro * 100 - 1e-9);
const centsToEur = cents => cents / 100;
const roundUpStep = cents => Math.ceil(cents / assumptions.priceStepCents) * assumptions.priceStepCents;
const roundStep = cents => Math.round(cents / assumptions.priceStepCents) * assumptions.priceStepCents;

function operatingCost(plan, settings) {
  return plan.quota * settings.aiAllInEur
    + settings.variableInfraPerSeatEur
    + (settings.sharedInfrastructureMonthlyEur + settings.platformMaintenanceHours * settings.supportHourlyEur) / settings.totalPaidSeats
    + (settings.supportMinutes ?? plan.supportMinutes) * settings.supportHourlyEur / 60;
}

export function minimumCents(plan, overrides = {}) {
  const settings = { ...assumptions, ...overrides };
  const denominator = settings.annualPaidMonths * (
    1 - settings.targetMargin - settings.riskReserveOnNet - settings.stripeRateOnGross * settings.vat
  );
  assert(denominator > 0);
  const netMonthlyTariff = (settings.annualServedMonths * operatingCost(plan, settings)
    + settings.fixedFeePerInvoiceEur / settings.floorFromSeat) / denominator;
  return roundUpCents(netMonthlyTariff * (plan.gross ? settings.vat : 1));
}

/** Listed price for seat 100+: the exact minimum rounded up to the price step (5 cents). */
export const listedFloorCents = (plan, overrides = {}) => roundUpStep(minimumCents(plan, overrides));

/** Linear price at each lower band boundary, rounded to the nearest 5 cents.
 * Pin first discounted seat below base and keep the floor exclusive to seat 100+.
 * Bands are a proposal; the existing production implementation remains untouched.
 */
export function proposedBands(plan, overrides = {}) {
  const floor = listedFloorCents(plan, overrides);
  const step = assumptions.priceStepCents;
  if (floor >= plan.baseCents) return null;
  const starts = [1, 4, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  return starts.map((from, index) => ({
    from,
    to: starts[index + 1] ? starts[index + 1] - 1 : null,
    cents: from === 1 ? plan.baseCents : from === 100 ? floor
      : Math.min(plan.baseCents - step, Math.max(floor + step,
        roundStep(plan.baseCents - (plan.baseCents - floor) * (from - 3) / 97))),
  }));
}

export function totalCents(bands, seats) {
  assert(Number.isSafeInteger(seats) && seats > 0);
  return bands.reduce((total, band) => total
    + Math.max(0, Math.min(seats, band.to ?? seats) - band.from + 1) * band.cents, 0);
}

export function annualEconomics(plan, monthlyTariffCents, seats = 100, overrides = {}) {
  const settings = { ...assumptions, ...overrides };
  const netRevenue = centsToEur(monthlyTariffCents) * settings.annualPaidMonths / (plan.gross ? settings.vat : 1);
  const operatingCosts = seats * settings.annualServedMonths * operatingCost(plan, settings);
  const stripe = netRevenue * settings.vat * settings.stripeRateOnGross + settings.fixedFeePerInvoiceEur;
  const riskReserve = netRevenue * settings.riskReserveOnNet;
  const contribution = netRevenue - operatingCosts - stripe - riskReserve;
  return { netRevenue, operatingCosts, stripe, riskReserve, contribution, margin: contribution / netRevenue };
}

const results = plans.map(plan => {
  const minimum = minimumCents(plan);
  const floor = Math.min(plan.baseCents, listedFloorCents(plan));
  // No 5-cent step fits between base and minimum: the plan stays flat at its base price.
  const bands = proposedBands(plan) ?? [{ from: 1, to: null, cents: plan.baseCents }];
  assert.equal(totalCents(bands, 3), plan.baseCents * 3);
  assert(bands.every(band => band.cents % assumptions.priceStepCents === 0));
  if (bands.length > 1) {
    assert(bands[1].cents < plan.baseCents);
    assert(bands.slice(1, -1).every(band => band.cents > floor));
  }
  assert.equal(bands.at(-1).cents, floor);
  for (let i = 1; i < bands.length; i++) assert(bands[i].cents <= bands[i - 1].cents);
  assert.equal(totalCents(bands, 101) - totalCents(bands, 100), floor);
  const flatFloorAnnual = annualEconomics(plan, floor * 100);
  assert(flatFloorAnnual.margin >= assumptions.targetMargin);
  assert(annualEconomics(plan, (minimum - 1) * 100).margin < assumptions.targetMargin);
  // The first three seats still cover the higher fixed payment charge per person on a small bill.
  assert(annualEconomics(plan, plan.baseCents * 2, 2).margin >= assumptions.targetMargin);
  const examples = [2, 3, 4, 10, 25, 50, 99, 100, 101, 200, 500].map(seats => {
    const monthlyCents = totalCents(bands, seats);
    return { seats, monthlyCents, annualCents: monthlyCents * 10,
      annualEconomics: annualEconomics(plan, monthlyCents, seats) };
  });
  const scenarioFloors = Object.fromEntries([
    ['ai', [0.0014, 0.0025, 0.0035, assumptions.stressAiAllInEur].map(aiAllInEur => ({ aiAllInEur, cents: minimumCents(plan, { aiAllInEur }) }))],
    ['support', [0, 1, 3, 5].map(supportMinutes => ({ supportMinutes, cents: minimumCents(plan, { supportMinutes }) }))],
    ['scale', [100, 250, 500, 1000].map(totalPaidSeats => ({ totalPaidSeats, cents: minimumCents(plan, { totalPaidSeats }) }))],
    ['sharedInfrastructure', [7.50, 30, 60, 120, 300, 500].map(sharedInfrastructureMonthlyEur => ({ sharedInfrastructureMonthlyEur, cents: minimumCents(plan, { sharedInfrastructureMonthlyEur }) }))],
    ['growth', [
      { name: 'Avvio', totalPaidSeats: 100, sharedInfrastructureMonthlyEur: 15, platformMaintenanceHours: 2 },
      { name: 'Crescita', totalPaidSeats: 500, sharedInfrastructureMonthlyEur: 60, platformMaintenanceHours: 2 },
      { name: 'Consolidamento', totalPaidSeats: 1000, sharedInfrastructureMonthlyEur: 120, platformMaintenanceHours: 2 },
      { name: 'Scala maggiore', totalPaidSeats: 5000, sharedInfrastructureMonthlyEur: 500, platformMaintenanceHours: 6 },
    ].map(stage => ({ ...stage, cents: minimumCents(plan, stage) }))],
  ]);
  return { ...plan, minimum, floor, monthlyOperatingCost: operatingCost(plan, assumptions), bands, flatFloorAnnual, examples,
    previousFloorAnnual: annualEconomics(plan, plan.previousFloorCents * 100),
    stepBelowFloorAnnual: annualEconomics(plan, (floor - assumptions.priceStepCents) * 100),
    stressAtFloorAnnual: annualEconomics(plan, floor * 100, 100, { aiAllInEur: assumptions.stressAiAllInEur }),
    stressFloor: minimumCents(plan, { aiAllInEur: assumptions.stressAiAllInEur }),
    scenarioFloors };
});

console.log(JSON.stringify({ assumptions, results }, null, 2));
