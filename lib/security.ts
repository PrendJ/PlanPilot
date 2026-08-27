import { NextResponse } from "next/server";

type Bucket = { count: number; resetAt: number };
const globalBuckets = globalThis as typeof globalThis & { boardcueRateLimits?: Map<string, Bucket> };
const buckets = globalBuckets.boardcueRateLimits || new Map<string, Bucket>();
if (process.env.NODE_ENV !== "production") globalBuckets.boardcueRateLimits = buckets;

export function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  current.count += 1;
  if (current.count <= limit) return null;
  return NextResponse.json({ error: "Troppe richieste. Riprova tra poco." }, { status: 429, headers: { "Retry-After": String(Math.ceil((current.resetAt - now) / 1000)) } });
}

export function rejectCrossOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  if (origin === new URL(request.url).origin) return null;
  try {
    if (process.env.APP_URL && origin === new URL(process.env.APP_URL).origin) return null;
  } catch {
    // A malformed deployment URL must not break every form submission.
  }
  return NextResponse.json({ error: "Origin non consentita" }, { status: 403 });
}

export function safeJson<T = unknown>(request: Request): Promise<T | Record<string, never>> {
  return request.json().catch(() => ({}));
}
