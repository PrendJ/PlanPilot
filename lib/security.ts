import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorMessage } from "@/lib/errors";
import { requestLocale } from "@/lib/i18n/server";

type Bucket = { count: number; resetAt: number };
const globalBuckets = globalThis as typeof globalThis & { boardcueRateLimits?: Map<string, Bucket> };
const buckets = globalBuckets.boardcueRateLimits || new Map<string, Bucket>();
globalBuckets.boardcueRateLimits = buckets;

export function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function memoryHit(key: string, windowMs: number) {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    const fresh = { count: 1, resetAt: now + windowMs };
    buckets.set(key, fresh);
    return fresh;
  }
  current.count += 1;
  return current;
}

/**
 * Fixed-window limiter stored in PostgreSQL, so limits survive restarts and hold across instances.
 * Falls back to process memory if the database is unreachable (never fails open silently: it still limits).
 */
export async function rateLimit(key: string, limit: number, windowMs: number, request?: Request) {
  let hit: Bucket;
  try {
    const resetAt = new Date(Date.now() + windowMs);
    const rows = await prisma.$queryRaw<Array<{ count: number; resetAt: Date }>>`
      INSERT INTO "RateLimitBucket" ("key", "count", "resetAt") VALUES (${key}, 1, ${resetAt})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimitBucket"."resetAt" <= NOW() THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
        "resetAt" = CASE WHEN "RateLimitBucket"."resetAt" <= NOW() THEN ${resetAt} ELSE "RateLimitBucket"."resetAt" END
      RETURNING "count", "resetAt"`;
    const row = Array.isArray(rows) ? rows[0] : undefined;
    if (!row || !Number.isFinite(Number(row.count))) throw new Error("rate limit store unavailable");
    hit = { count: Number(row.count), resetAt: new Date(row.resetAt).getTime() };
  } catch {
    hit = memoryHit(key, windowMs);
  }
  if (hit.count <= limit) return null;
  const locale = request ? requestLocale(request) : "it";
  return NextResponse.json(
    { error: errorMessage("RATE_LIMITED", locale), code: "RATE_LIMITED" },
    { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((hit.resetAt - Date.now()) / 1000))) } },
  );
}

export async function purgeRateLimits() {
  return prisma.rateLimitBucket.deleteMany({ where: { resetAt: { lt: new Date(Date.now() - 3600_000) } } }).catch(() => ({ count: 0 }));
}

export function rejectCrossOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  if (origin === new URL(request.url).origin) return null;
  // Behind a proxy (or the standalone server) request.url may carry an internal host: compare with the Host seen by the browser.
  try {
    const originHost = new URL(origin).host;
    const hosts = [request.headers.get("x-forwarded-host"), request.headers.get("host")]
      .filter(Boolean)
      .flatMap(value => value!.split(",").map(item => item.trim()));
    if (hosts.includes(originHost)) return null;
  } catch {
    // Malformed Origin header: fall through to rejection.
  }
  try {
    if (process.env.APP_URL && origin === new URL(process.env.APP_URL).origin) return null;
  } catch {
    // A malformed deployment URL must not break every form submission.
  }
  return NextResponse.json({ error: errorMessage("ORIGIN_REJECTED", requestLocale(request)), code: "ORIGIN_REJECTED" }, { status: 403 });
}

export function safeJson<T = unknown>(request: Request): Promise<T | Record<string, never>> {
  return request.json().catch(() => ({}));
}
