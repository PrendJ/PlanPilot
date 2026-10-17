import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";

describe("malformed server action requests", () => {
  it.each(["x", "y", '"x"', "a".repeat(41), "z".repeat(42)])("rejects invalid reference %s", id => {
    expect(middleware(new NextRequest("https://boardcue.test/", { method: "POST", headers: { "next-action": id } })).status).toBe(400);
  });
  it("preserves valid action references and ordinary API requests", () => {
    const action = middleware(new NextRequest("https://boardcue.test/", { method: "POST", headers: { "next-action": "a".repeat(42) } }));
    expect(action.headers.get("x-middleware-next")).toBe("1");
    const api = middleware(new NextRequest("https://boardcue.test/api/workspaces/test/transcribe", { method: "POST" }));
    expect(api.headers.get("x-middleware-next")).toBe("1");
  });
});
