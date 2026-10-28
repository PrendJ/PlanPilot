import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
vi.mock("node:https", () => ({ request: mocks.request }));
import { postSafeWebhook } from "@/lib/safe-webhook";

describe("webhook transport under DNS rebinding", () => {
  it("uses the validated DNS answer for the connection and never follows redirects", async () => {
    mocks.lookup.mockResolvedValueOnce([{ address: "8.8.8.8", family: 4 }]).mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
    let target: URL, options: any;
    const destroy = vi.fn();
    mocks.request.mockImplementation((url, opts, callback) => {
      target = url; options = opts;
      const req = { on: vi.fn(), end: () => callback({ statusCode: 302, destroy }) };
      return req;
    });
    const result = await postSafeWebhook("https://public.example/webhook", {}, "{}");
    expect(result).toEqual({ status: 302, ok: false });
    expect(target!.hostname).toBe("public.example");
    const callback = vi.fn(); options.lookup("public.example", {}, callback);
    expect(callback).toHaveBeenCalledWith(null, "8.8.8.8", 4);
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
    expect(options.agent).toBe(false); expect(destroy).toHaveBeenCalled();
  });
});
