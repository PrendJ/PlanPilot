import { z } from "zod";

// Server-side allowlist: a submitted URL must never turn this service into an SSRF proxy.
export function allowedPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.hash
      && (!url.port || url.port === "443") && (url.hostname === "fcm.googleapis.com"
        || url.hostname === "updates.push.services.mozilla.com"
        || url.hostname.endsWith(".push.apple.com") || url.hostname.endsWith(".notify.windows.com"));
  } catch { return false; }
}

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().max(2048).refine(allowedPushEndpoint),
  keys: z.object({
    p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}$/),
    auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
  }).strict(),
  expirationTime: z.number().nullable().optional(),
}).strict();

export function pushConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY || "";
  const privateKey = process.env.VAPID_PRIVATE_KEY || "";
  const subject = process.env.VAPID_SUBJECT || "";
  if (process.env.WEB_PUSH_ENABLED !== "true" || !/^[A-Za-z0-9_-]{87}$/.test(publicKey)
    || !/^[A-Za-z0-9_-]{43}$/.test(privateKey) || !/^(mailto:|https:\/\/)/.test(subject)) return null;
  return { publicKey, privateKey, subject };
}
