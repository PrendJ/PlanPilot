import { afterEach, describe, expect, it, vi } from "vitest";
import { clientIp, rejectCrossOrigin, safeJson, boundedBytes } from "@/lib/security";
import { isPublicAddress } from "@/lib/safe-webhook";
import { toCsv } from "@/lib/import-export";
import { middleware } from "../middleware";
import { NextRequest } from "next/server";
import { acquireStreamSlot } from "@/lib/stream-slots";

afterEach(() => vi.unstubAllEnvs());
describe("security boundaries", () => {
  it("bounds simultaneous streams and releases cancelled slots exactly once", () => {
    const releases = Array.from({ length: 4 }, () => acquireStreamSlot("synthetic-slot-user")!);
    expect(acquireStreamSlot("synthetic-slot-user")).toBeNull();
    releases[0](); releases[0]();
    const next = acquireStreamSlot("synthetic-slot-user"); expect(next).not.toBeNull();
    next!(); releases.forEach(release => release());
  });
  it("rejects spoofed forwarded hosts and origin scheme changes", () => {
    vi.stubEnv("APP_URL", "https://boardcue.example");
    for (const origin of ["https://evil.example", "http://boardcue.example", "null"]) {
      expect(rejectCrossOrigin(new Request("http://internal:3000/x", { headers: { origin, host: "evil.example", "x-forwarded-host": "evil.example" } }))?.status).toBe(403);
    }
    expect(rejectCrossOrigin(new Request("http://internal:3000/x", { headers: { origin: "https://boardcue.example" } }))).toBeNull();
  });
  it("ignores forwarded addresses by default and reads trusted hops from the right", () => {
    const req = new Request("https://boardcue.example", { headers: { "x-forwarded-for": "1.2.3.4, 8.8.8.8" } });
    vi.stubEnv("TRUSTED_PROXY_HOPS", "0"); expect(clientIp(req)).toBe("unknown");
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1"); expect(clientIp(req)).toBe("8.8.8.8");
    vi.stubEnv("TRUSTED_PROXY_HOPS", "5"); expect(clientIp(req)).toBe("unknown");
  });
  it("rejects foreign API mutations in middleware even if a handler has no guard", () => {
    vi.stubEnv("APP_URL", "https://boardcue.example");
    const response = middleware(new NextRequest("https://boardcue.example/api/admin/economics/exchange-rate", { method: "POST", headers: { origin: "https://evil.example" } }));
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(rejectCrossOrigin(new Request("https://boardcue.example/x", { headers: { "sec-fetch-site": "same-site" } }))?.status).toBe(403);
  });
  it.each(["127.0.0.1", "169.254.169.254", "192.168.1.1", "100.64.0.1", "::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:a9fe:a9fe", "fc00::1", "fe80::1"])("blocks private and mapped address %s", address => expect(isPublicAddress(address)).toBe(false));
  it("permits globally routed IPv4 and IPv6", () => {
    expect(isPublicAddress("8.8.8.8")).toBe(true); expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
  });
  it("stops a chunked body before parsing it, even without Content-Length", async () => {
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(1025)); controller.close(); } });
    const request = new Request("https://boardcue.example", { method: "POST", body: stream, duplex: "half" } as RequestInit);
    await expect(boundedBytes(request, 1024)).rejects.toThrow("BODY_TOO_LARGE");
    expect(await safeJson(new Request("https://boardcue.example", { method: "POST", headers: { "content-type": "text/plain" }, body: '{"isAdmin":true}' }))).toEqual({});
  });
  it.each(["=1+1", "+1", "-1", "@SUM(1)", "  =1", "\tvalue", "\rvalue"])("neutralizes formula-like CSV cell %j", value => {
    expect(toCsv([{ title: value }], ["title"]).split("\r\n")[1]).toMatch(/^"?'/);
  });
  it("uses fresh CSP nonces and disables private API caching", () => {
    vi.stubEnv("NODE_ENV", "production");
    const first = middleware(new NextRequest("https://boardcue.example/api/search"));
    const second = middleware(new NextRequest("https://boardcue.example/api/search"));
    expect(first.headers.get("content-security-policy")).not.toBe(second.headers.get("content-security-policy"));
    expect(first.headers.get("content-security-policy")).toMatch(/script-src [^;]*'nonce-/);
    expect(first.headers.get("content-security-policy")?.split("script-src")[1].split(";")[0]).not.toContain("unsafe-inline");
    expect(first.headers.get("cache-control")).toBe("private, no-store");
  });
});
