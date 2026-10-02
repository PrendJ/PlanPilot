import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM script without type declarations
import { isIdempotentMigration, retryableFailures } from "../scripts/migrate-deploy.mjs";

describe("automatic migration recovery", () => {
  it("only retries when every failed migration is marked idempotent", () => {
    const idempotent = (name: string) => name.startsWith("0013");
    expect(retryableFailures(["0013_platform_ai_capture_attempts"], idempotent)).toEqual(["0013_platform_ai_capture_attempts"]);
    expect(retryableFailures(["0013_platform_ai_capture_attempts", "0006_platform_backoffice"], idempotent)).toBeNull();
    expect(retryableFailures([], idempotent)).toBeNull();
  });

  it("reads the marker from the real migration files", () => {
    expect(isIdempotentMigration("0012_capture_integrations")).toBe(true);
    expect(isIdempotentMigration("0013_platform_ai_capture_attempts")).toBe(true);
    expect(isIdempotentMigration("0006_platform_backoffice")).toBe(false);
    expect(isIdempotentMigration("../../etc")).toBe(false);
  });
});
