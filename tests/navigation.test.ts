import { afterEach, describe, expect, it } from "vitest";
import { appUrl } from "@/lib/email";
import { safeNextPath } from "@/lib/navigation";

const originalAppUrl = process.env.APP_URL;

afterEach(() => {
  if (originalAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = originalAppUrl;
});

describe("safe post-auth navigation", () => {
  it("keeps local invite destinations", () => expect(safeNextPath("/accept-invite?token=abc")).toBe("/accept-invite?token=abc"));
  it("rejects protocol-relative and external destinations", () => {
    expect(safeNextPath("//evil.example/path")).toBe("/app");
    expect(safeNextPath("https://evil.example/path")).toBe("/app");
  });
});

describe("public action URLs", () => {
  it("never exposes a wildcard server address to the user", () => {
    process.env.APP_URL = "http://0.0.0.0:3000";
    expect(appUrl("/login?verified=1", new Request("https://boardcue.example/api/auth/verify"))).toBe(
      "https://boardcue.example/login?verified=1",
    );
  });

  it("uses the configured public origin when it is routable", () => {
    process.env.APP_URL = "https://boardcue.draftapps.it/";
    expect(appUrl("/reset-password?token=secret", new Request("http://127.0.0.1:3000/api"))).toBe(
      "https://boardcue.draftapps.it/reset-password?token=secret",
    );
  });
});

import { rejectCrossOrigin } from "@/lib/security";
describe("cross-origin guard", () => {
  it("accepts same-origin requests behind a proxy and rejects foreign origins", () => {
    const internal = (origin: string, host: string) =>
      new Request("http://0.0.0.0:3000/api/x", { method: "POST", headers: { origin, host } });
    expect(rejectCrossOrigin(internal("https://boardcue.example", "boardcue.example"))).toBeNull();
    expect(
      rejectCrossOrigin(
        new Request("http://0.0.0.0:3000/api/x", {
          method: "POST",
          headers: { origin: "https://boardcue.example", "x-forwarded-host": "boardcue.example" },
        }),
      ),
    ).toBeNull();
    expect(rejectCrossOrigin(internal("https://evil.example", "boardcue.example"))?.status).toBe(403);
    expect(rejectCrossOrigin(new Request("http://0.0.0.0:3000/api/x", { method: "POST" }))).toBeNull();
  });
});
