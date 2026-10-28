import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorMessage } from "@/lib/errors";
import { requestLocale } from "@/lib/i18n/server";
import { isIP } from "node:net";
import { trustedRequestOrigin } from "@/lib/request-origin";

type Bucket = { count: number; resetAt: number };
const globalBuckets = globalThis as typeof globalThis & { boardcueRateLimits?: Map<string, Bucket> };
const buckets = globalBuckets.boardcueRateLimits || new Map<string, Bucket>();
globalBuckets.boardcueRateLimits = buckets;

export function clientIp(request: Request) {
  // Opt in only when ingress appends the actual peer address and app is private.
  // Count from the trusted end, never from attacker-controlled entries on the left.
  const hops = Number(process.env.TRUSTED_PROXY_HOPS || 0);
  if (!Number.isSafeInteger(hops) || hops < 1 || hops > 5) return "unknown";
  const chain = (request.headers.get("x-forwarded-for") || "").split(",").map(value => value.trim());
  const ip = chain[chain.length - hops];
  return ip && isIP(ip) ? ip : "unknown";
}

function memoryHit(key: string, windowMs: number) {
  const now = Date.now();
  if (buckets.size >= 10_000) {
    for (const [entry, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(entry);
    // One bounded overflow bucket fails closed during a store outage.
    if (!buckets.has(key) && buckets.size >= 10_000) key = "overflow";
  }
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
  if (trustedRequestOrigin(request)) return null;
  return NextResponse.json({ error: errorMessage("ORIGIN_REJECTED", requestLocale(request)), code: "ORIGIN_REJECTED" }, { status: 403 });
}

export async function boundedBytes(request: Pick<Request, "headers" | "body">, maxBytes = 256 * 1024) {
  if (Number(request.headers.get("content-length") || 0) > maxBytes) throw new Error("BODY_TOO_LARGE");
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("BODY_TIMEOUT")), 10_000); });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error("BODY_TOO_LARGE");
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  } finally { clearTimeout(timer); void reader.cancel().catch(() => undefined); }
}

export async function boundedText(request: Request, maxBytes = 256 * 1024) {
  return new TextDecoder().decode(await boundedBytes(request, maxBytes));
}

export async function safeJson<T = Record<string, unknown>>(request: Request, maxBytes = 256 * 1024): Promise<T | Record<string, never>> {
  if (!(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) return {};
  try { return JSON.parse(await boundedText(request, maxBytes)) as T; } catch { return {}; }
}

export async function boundedFormData(request: Request, maxBytes = 11 * 1024 * 1024) {
  try {
    const bytes = await boundedBytes(request, maxBytes);
    return await new Response(new Blob([bytes]), { headers: { "Content-Type": request.headers.get("content-type") || "" } }).formData();
  } catch { return null; }
}
