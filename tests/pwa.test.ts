import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

/** Just enough IndexedDB for one keyed object store: requests succeed async, the transaction completes after them. */
function memoryIndexedDB(data = new Map<string, any>()) {
  const later = (fn: () => void) => setTimeout(fn, 0);
  const request = (value?: () => unknown) => { const r: any = {}; queueMicrotask(() => { r.result = value?.(); r.onsuccess?.(); }); return r; };
  const store = { get: (key: string) => request(() => data.get(key)), put: (value: unknown, key: string) => request(() => data.set(key, value)), delete: (key: string) => request(() => data.delete(key)) };
  const db = { close: vi.fn(), transaction: () => { const tx: any = { objectStore: () => store }; later(() => tx.oncomplete?.()); return tx; } };
  return { data, db, indexedDB: { open: vi.fn(() => request(() => db)) } };
}

const source = readFileSync("scripts/service-worker.js", "utf8").replace("__VERSION__", '"new"').replace("__ASSETS__", '["/_next/static/new.js"]');
function worker() {
  const listeners: Record<string, (event: any) => void> = {};
  const cached = new Map<string, Response>();
  const key = (r: any) => typeof r === "string" ? r : new URL(r.url).pathname;
  const cache = { match: vi.fn(async (r: any) => cached.get(key(r))), addAll: vi.fn(async () => {}), put: vi.fn(async () => {}) };
  const caches = { open: vi.fn(async () => cache), match: cache.match, keys: vi.fn(async () => ["other-app", "boardcue-static-oldest", "boardcue-static-previous", "boardcue-static-new"]), delete: vi.fn(async () => true) };
  const fetch = vi.fn(async () => new Response("network"));
  const self = { location: { origin: "https://boardcue.test" }, registration: { showNotification: vi.fn(async () => {}) }, clients: { claim: vi.fn(async () => {}), matchAll: vi.fn(async (): Promise<any[]> => []), openWindow: vi.fn(async () => {}) }, skipWaiting: vi.fn(async () => {}), addEventListener: (name: string, cb: any) => { listeners[name] = cb; } };
  const idb = memoryIndexedDB();
  runInNewContext(source, { self, caches, fetch, URL, Response, File, indexedDB: idb.indexedDB });
  function request(path: string, mode = "cors", method = "GET") {
    let response: Promise<Response> | undefined;
    listeners.fetch({ request: { url: new URL(path, self.location.origin).href, mode, method }, respondWith: (p: Promise<Response>) => { response = p; } });
    return response;
  }
  async function share(fields: Record<string, string | File>) {
    const form = new FormData(); for (const [name, value] of Object.entries(fields)) form.append(name, value);
    let response: Promise<Response> | undefined;
    listeners.fetch({ request: { url: `${self.location.origin}/share`, mode: "navigate", method: "POST", formData: async () => form }, respondWith: (p: Promise<Response>) => { response = p; } });
    return new URL((await response!).headers.get("location")!);
  }
  async function event(name: string, rest = {}) { let task: Promise<unknown> | undefined; listeners[name]({ ...rest, waitUntil: (p: Promise<unknown>) => { task = p; } }); await task; }
  return { cache, cached, caches, fetch, self, request, event, share, idb };
}
describe("PWA privacy, lifecycle and notification worker", () => {
  it("provides real opaque platform icons and a stable standalone identity", () => {
    const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));
    expect(manifest).toMatchObject({ id: "/", start_url: "/", scope: "/", display: "standalone" });
    for (const icon of manifest.icons) {
      const png = readFileSync(`public${icon.src.split("?")[0]}`); const [w, h] = icon.sizes.split("x").map(Number);
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

describe("PWA share target", () => {
  it("stores shared text and redirects to the signed-in home", async () => {
    const w = worker(); const location = await w.share({ title: "Idea", text: "Call the bank", url: "https://example.test/x" });
    expect(location.pathname + location.search).toBe("/app?shared=1");
    expect(w.idb.data.get("latest")).toMatchObject({ text: "Idea\nCall the bank\nhttps://example.test/x", audio: null, audioName: null, truncated: false });
    expect(w.idb.db.close).toHaveBeenCalledOnce();
  });
  it("truncates long text to 12,000 characters instead of rejecting it, without splitting a surrogate pair", async () => {
    const w = worker(); expect((await w.share({ text: "a".repeat(20_000) })).search).toBe("?shared=1");
    expect(w.idb.data.get("latest")).toMatchObject({ text: "a".repeat(12_000), truncated: true });
    await w.share({ text: "a".repeat(11_999) + "😀".repeat(10) });
    const { text } = w.idb.data.get("latest"); expect(text).toBe("a".repeat(11_999)); expect(w.idb.data.get("latest").truncated).toBe(true);
  });
  it("keeps the original name of an untyped audio file with a known extension", async () => {
    const w = worker(); const voice = new File([new Uint8Array(32)], "voice-note.opus", { type: "" });
    expect((await w.share({ audio: voice })).search).toBe("?shared=1");
    expect(w.idb.data.get("latest")).toMatchObject({ text: "", audioName: "voice-note.opus", truncated: false });
    expect(w.idb.data.get("latest").audio.name).toBe("voice-note.opus");
  });
  it("rejects empty shares and unsupported, empty or oversized audio without storing anything", async () => {
    const w = worker();
    for (const fields of <Record<string, string | File>[]>[{}, { text: "   " }, { audio: new File(["x"], "notes.pdf", { type: "application/pdf" }) }, { audio: new File([], "empty.ogg", { type: "audio/ogg" }) }, { audio: new File([new Uint8Array(8 * 1024 * 1024 + 1)], "big.ogg", { type: "audio/ogg" }) }]) {
      expect((await w.share(fields)).search).toBe("?shareError=1");
    }
    expect(w.idb.data.size).toBe(0);
  });
  it("redirects with an error when local storage fails", async () => {
    const w = worker(); w.idb.indexedDB.open.mockImplementationOnce(() => { const r: any = {}; queueMicrotask(() => { r.error = new Error("blocked"); r.onerror?.(); }); return r; });
    expect((await w.share({ text: "hello" })).search).toBe("?shareError=1");
  });
});

describe("share inbox reader", () => {
  async function inbox(value?: Record<string, unknown>) {
    const idb = memoryIndexedDB(); if (value) idb.data.set("latest", value);
    vi.stubGlobal("indexedDB", idb.indexedDB); vi.resetModules();
    return { idb, ...(await import("../lib/share-inbox")) };
  }
  it("reads without deleting until clearSharedCapture() is called", async () => {
    const { idb, consumeSharedCapture, clearSharedCapture } = await inbox({ text: "hello", audio: null, createdAt: Date.now() });
    expect(await consumeSharedCapture()).toEqual({ text: "hello", audio: null, audioName: null, truncated: false, createdAt: expect.any(Number) });
    expect(await consumeSharedCapture()).toMatchObject({ text: "hello" });
    await clearSharedCapture(); expect(idb.data.size).toBe(0); expect(await consumeSharedCapture()).toBeNull();
    vi.unstubAllGlobals();
  });
  it("keeps shares for 30 minutes and deletes them once expired", async () => {
    const fresh = await inbox({ text: "x", audio: null, truncated: true, audioName: "a.ogg", createdAt: Date.now() - 29 * 60_000 });
    expect(await fresh.consumeSharedCapture()).toMatchObject({ truncated: true, audioName: "a.ogg" });
    const stale = await inbox({ text: "x", audio: null, createdAt: Date.now() - 31 * 60_000 });
    expect(await stale.consumeSharedCapture()).toBeNull(); expect(stale.idb.data.size).toBe(0);
    vi.unstubAllGlobals();
  });
});
