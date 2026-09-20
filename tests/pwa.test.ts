import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync("scripts/service-worker.js", "utf8").replace("__VERSION__", '"new"').replace("__ASSETS__", '["/_next/static/new.js"]');
function worker() {
  const listeners: Record<string, (event: any) => void> = {};
  const cached = new Map<string, Response>();
  const key = (r: any) => typeof r === "string" ? r : new URL(r.url).pathname;
  const cache = { match: vi.fn(async (r: any) => cached.get(key(r))), addAll: vi.fn(async () => {}), put: vi.fn(async () => {}) };
  const caches = { open: vi.fn(async () => cache), match: cache.match, keys: vi.fn(async () => ["other-app", "boardcue-static-oldest", "boardcue-static-previous", "boardcue-static-new"]), delete: vi.fn(async () => true) };
  const fetch = vi.fn(async () => new Response("network"));
  const self = { location: { origin: "https://boardcue.test" }, registration: { showNotification: vi.fn(async () => {}) }, clients: { claim: vi.fn(async () => {}), matchAll: vi.fn(async (): Promise<any[]> => []), openWindow: vi.fn(async () => {}) }, skipWaiting: vi.fn(async () => {}), addEventListener: (name: string, cb: any) => { listeners[name] = cb; } };
  runInNewContext(source, { self, caches, fetch, URL, Response });
  function request(path: string, mode = "cors", method = "GET") {
    let response: Promise<Response> | undefined;
    listeners.fetch({ request: { url: new URL(path, self.location.origin).href, mode, method }, respondWith: (p: Promise<Response>) => { response = p; } });
    return response;
  }
  async function event(name: string, rest = {}) { let task: Promise<unknown> | undefined; listeners[name]({ ...rest, waitUntil: (p: Promise<unknown>) => { task = p; } }); await task; }
  return { cache, cached, caches, fetch, self, request, event };
}
describe("PWA privacy, lifecycle and notification worker", () => {
  it("provides real opaque platform icons and a stable standalone identity", () => {
    const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));
    expect(manifest).toMatchObject({ id: "/", start_url: "/app", scope: "/", display: "standalone" });
    for (const icon of manifest.icons) {
      const png = readFileSync(`public${icon.src}`); const [w, h] = icon.sizes.split("x").map(Number);
      expect(png.readUInt32BE(16)).toBe(w); expect(png.readUInt32BE(20)).toBe(h); expect(png[25]).toBe(2);
    }
    const apple = readFileSync("public/icons/apple-touch-icon.png"); expect(apple.readUInt32BE(16)).toBe(180);
  });
  it("does not activate on install; failed offline download removes the partial cache", async () => {
    const w = worker(); await w.event("install"); expect(w.self.skipWaiting).not.toHaveBeenCalled();
    w.cache.addAll.mockRejectedValueOnce(new Error("offline")); await expect(w.event("install")).rejects.toThrow("offline"); expect(w.caches.delete).toHaveBeenCalledWith("boardcue-static-new");
  });
  it("requires explicit activation and retains previous build assets", async () => {
    const w = worker(); await w.event("message", { data: { type: "OTHER" } }); expect(w.self.skipWaiting).not.toHaveBeenCalled();
    await w.event("message", { data: { type: "ACTIVATE_UPDATE" } }); expect(w.self.skipWaiting).toHaveBeenCalledOnce();
    await w.event("activate"); expect(w.caches.delete.mock.calls).toEqual([["boardcue-static-oldest"]]);
    w.cached.set("/_next/static/old.js", new Response("old")); expect(await (await w.request("/_next/static/old.js"))?.text()).toBe("old");
  });
  it("never caches authenticated HTML and uses a generic offline page only on network failure", async () => {
    const w = worker(); expect(await (await w.request("/app/private", "navigate"))?.text()).toBe("network");
    expect(w.cache.put).not.toHaveBeenCalled();
    w.cached.set("/offline.html", new Response("generic offline")); w.fetch.mockRejectedValue(new Error("offline"));
    expect(await (await w.request("/app/private", "navigate"))?.text()).toBe("generic offline"); expect(w.cache.put).not.toHaveBeenCalled();
  });
  it("does not intercept APIs, RSC, external requests, worker checks or mutations", () => {
    const w = worker();
    for (const path of ["/api/workspaces/team/board", "/api/notifications/subscription", "/app/private?_rsc=abc", "/sw.js", "https://elsewhere.test/file.js"]) expect(w.request(path)).toBeUndefined();
    expect(w.request("/api/workspaces/team/cards", "cors", "POST")).toBeUndefined();
  });
  it("caches immutable public assets", async () => {
    const w = worker(); await w.request("/_next/static/new.js"); expect(w.cache.put).toHaveBeenCalledOnce();
  });
  it("discards payload content and links; malformed push still gives a generic notification", async () => {
    const w = worker(); await w.event("push", { data: { json: () => ({ tag: "abc", title: "Client secret", url: "https://evil.test" }) } });
    expect(w.self.registration.showNotification.mock.calls[0]).toEqual(["BoardCue", expect.objectContaining({ tag: "abc", body: expect.not.stringContaining("secret") })]);
    await w.event("push", { data: { json: () => { throw new Error("bad"); } } }); expect(w.self.registration.showNotification).toHaveBeenCalledTimes(2);
  });
  it("focuses an open window without navigating away from its draft; otherwise opens authenticated app entry", async () => {
    const w = worker(), focus = vi.fn(async () => {}), close = vi.fn();
    w.self.clients.matchAll.mockResolvedValueOnce([{ url: "https://boardcue.test/app/team", focus }]);
    await w.event("notificationclick", { notification: { close } }); expect(focus).toHaveBeenCalledOnce(); expect(w.self.clients.openWindow).not.toHaveBeenCalled();
    await w.event("notificationclick", { notification: { close } }); expect(w.self.clients.openWindow).toHaveBeenCalledWith("/app");
  });
});
