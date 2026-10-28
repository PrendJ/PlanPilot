import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import ipaddr from "ipaddr.js";

export function isPublicAddress(address: string) {
  try { return ipaddr.process(address).range() === "unicast"; } catch { return false; }
}

async function resolveTarget(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.hash || (url.port && url.port !== "443")) throw new Error("INVALID_URL");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("INVALID_URL");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const records = await Promise.race([
    lookup(host, { all: true }),
    new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("DNS_TIMEOUT")), 3000); }),
  ]).finally(() => clearTimeout(timer));
  if (!records.length || records.some(record => !isPublicAddress(record.address))) throw new Error("INVALID_URL");
  return { url, record: records[0] };
}

export async function assertSafeWebhookUrl(raw: string) { return (await resolveTarget(raw)).url; }

/** Resolve once, validate all answers, pin this connection to a checked address.
 * TLS still verifies the original hostname; redirects and connection pooling are disabled. */
export async function postSafeWebhook(raw: string, headers: Record<string, string>, body: string) {
  const { url, record } = await resolveTarget(raw);
  return new Promise<{ status: number; ok: boolean }>((resolve, reject) => {
    const req = httpsRequest(url, {
      method: "POST", agent: false, family: record.family,
      signal: AbortSignal.timeout(10_000),
      headers: { ...headers, "Content-Length": String(Buffer.byteLength(body)) },
      lookup: (_host, _options, callback) => callback(null, record.address, record.family),
    }, response => {
      const status = response.statusCode || 502;
      response.destroy();
      resolve({ status, ok: status >= 200 && status < 300 });
    });
    req.on("error", reject);
    req.end(body);
  });
}
