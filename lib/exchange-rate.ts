import { prisma } from "@/lib/prisma";

const SETTING_ID = "usd-eur";
const FALLBACK_USD_TO_EUR = Number(process.env.USD_TO_EUR_FALLBACK || 0.92);
const FRANKFURTER_URL = "https://api.frankfurter.dev/v2/rate/USD/EUR?providers=ECB";

type StoredSetting = Awaited<ReturnType<typeof getStoredSetting>>;

function isUsableRate(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function fetchedToday(value: Date | null) {
  if (!value) return false;
  const now = new Date();
  return value.getUTCFullYear() === now.getUTCFullYear() && value.getUTCMonth() === now.getUTCMonth() && value.getUTCDate() === now.getUTCDate();
}

async function getStoredSetting() {
  return prisma.exchangeRateSetting.upsert({ where: { id: SETTING_ID }, create: { id: SETTING_ID }, update: {} });
}

function toStatus(setting: StoredSetting, rate = setting.manualUsdToEur ?? setting.latestUsdToEur ?? FALLBACK_USD_TO_EUR) {
  const manual = isUsableRate(setting.manualUsdToEur);
  return {
    usdToEur: rate,
    mode: manual ? "MANUAL" as const : "AUTO" as const,
    source: manual ? "Impostato manualmente" : setting.latestSource || "Valore di emergenza",
    observedAt: manual ? setting.manualSetAt : setting.latestObservedAt,
    fetchedAt: setting.latestFetchedAt,
    stale: !manual && !fetchedToday(setting.latestFetchedAt),
    lastFetchError: setting.lastFetchError,
  };
}

export async function getUsdToEurRate() {
  const setting = await getStoredSetting();
  if (isUsableRate(setting.manualUsdToEur) || fetchedToday(setting.latestFetchedAt)) return toStatus(setting);
  return refreshUsdToEurRate();
}

export async function refreshUsdToEurRate() {
  const setting = await getStoredSetting();
  if (isUsableRate(setting.manualUsdToEur)) return toStatus(setting);
  try {
    const response = await fetch(FRANKFURTER_URL, { cache: "no-store", signal: AbortSignal.timeout(7000) });
    if (!response.ok) throw new Error(`Fonte cambio non disponibile (${response.status})`);
    const payload = await response.json() as { date?: string; rate?: number };
    const rate = Number(payload.rate);
    if (!isUsableRate(rate)) throw new Error("Fonte cambio con valore non valido");
    const observedAt = payload.date ? new Date(`${payload.date}T00:00:00.000Z`) : new Date();
    const updated = await prisma.exchangeRateSetting.update({
      where: { id: SETTING_ID },
      data: { latestUsdToEur: rate, latestSource: "Tasso di riferimento BCE (giornaliero)", latestObservedAt: observedAt, latestFetchedAt: new Date(), lastFetchError: null },
    });
    return toStatus(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Aggiornamento del cambio non riuscito";
    const updated = await prisma.exchangeRateSetting.update({ where: { id: SETTING_ID }, data: { lastFetchError: message } });
    return toStatus(updated);
  }
}

export async function setManualUsdToEurRate(usdToEur: number, actorId: string) {
  if (!isUsableRate(usdToEur) || usdToEur < 0.5 || usdToEur > 1.5) throw new Error("Il cambio deve essere compreso tra 0,50 e 1,50.");
  const setting = await prisma.exchangeRateSetting.upsert({
    where: { id: SETTING_ID },
    create: { id: SETTING_ID, manualUsdToEur: usdToEur, manualSetAt: new Date(), manualSetById: actorId },
    update: { manualUsdToEur: usdToEur, manualSetAt: new Date(), manualSetById: actorId },
  });
  return toStatus(setting);
}

export async function enableAutomaticUsdToEurRate() {
  await prisma.exchangeRateSetting.upsert({ where: { id: SETTING_ID }, create: { id: SETTING_ID }, update: { manualUsdToEur: null, manualSetAt: null, manualSetById: null } });
  return refreshUsdToEurRate();
}
