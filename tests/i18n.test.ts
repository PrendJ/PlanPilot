import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it as test } from "vitest";
import { it } from "@/lib/i18n/it";
import { en } from "@/lib/i18n/en";
import { localeFromAcceptLanguage, normalizeUiLocale, translator } from "@/lib/i18n/core";
import { ERROR_CODES } from "@/lib/errors";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : /\.(tsx?|mjs)$/.test(name) ? [full] : [];
  });
}

function get(tree: unknown, key: string) {
  return key
    .split(".")
    .reduce<unknown>((node, part) => (node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined), tree);
}

function leaves(tree: unknown, prefix = ""): string[] {
  if (typeof tree === "string") return [prefix];
  return Object.entries(tree as Record<string, unknown>).flatMap(([key, value]) => leaves(value, prefix ? `${prefix}.${key}` : key));
}

const source = ["app", "components", "lib"]
  .flatMap(files)
  .map(file => readFileSync(file, "utf8"))
  .join("\n");
const staticKeys = [...new Set([...source.matchAll(/\bt\(\s*"([a-zA-Z0-9_.]+)"/g)].map(match => match[1]))];

describe("i18n dictionaries", () => {
  test("every static key used in the code exists in Italian and English", () => {
    const missingIt = staticKeys.filter(key => typeof get(it, key) !== "string");
    const missingEn = staticKeys.filter(key => typeof get(en, key) !== "string");
    expect(missingIt).toEqual([]);
    expect(missingEn).toEqual([]);
  });

  test("dynamic key families are complete", () => {
    const families: Record<string, string[]> = {
      plans: ["TRIAL", "PRO", "TEAM", "BUSINESS", "ENTERPRISE", "LIFETIME", "SOLO", "TEAM_LEGACY", "STUDIO"],
      priority: ["LOW", "NORMAL", "HIGH", "URGENT"],
      roles: ["OWNER", "ADMIN", "MEMBER", "GUEST"],
      presets: ["GENERAL", "SOFTWARE", "MARKETING", "PROJECT", "CONSULTING"],
      notifications: ["ASSIGNED", "MENTIONED", "COMMENTED", "DUE_SOON", "OVERDUE"],
      "board.due": ["overdue", "soon", "later", "done"],
      "board.views": ["kanban", "list", "calendar"],
      "board.proposal.field": ["priority", "dueDate", "tags", "description", "title"],
      "activity.filters": ["all", "ai", "manual"],
      theme: ["system", "light", "dark"],
      "settings.nav": ["general", "columns", "members", "import", "integrations"],
      "account.nav": ["profile", "security", "api", "teams", "danger"],
      "pricing.audience": ["PRO", "TEAM", "BUSINESS"],
      errors: [...ERROR_CODES],
      activity: [
        "CARD_CREATED",
        "CARD_UPDATED",
        "CARD_MOVED",
        "CARD_ARCHIVED",
        "CARD_RESTORED",
        "COMMENT_CREATED",
        "COLUMN_CREATED",
        "COLUMN_UPDATED",
        "COLUMN_DELETED",
        "BOARD_IMPORTED",
        "AI_CARD_CREATED",
        "AI_CARD_UPDATED",
        "AI_CARD_ARCHIVED",
        "AI_UPDATE_APPLIED",
        "AI_UPDATE_UNDONE",
        "WORKSPACE_SETTINGS_UPDATED",
      ],
    };
    const missing = Object.entries(families)
      .flatMap(([prefix, keys]) => keys.map(key => `${prefix}.${key}`))
      .filter(key => typeof get(it, key) !== "string" || typeof get(en, key) !== "string");
    expect(missing).toEqual([]);
    for (const name of ["update", "trial", "frozen", "dictation", "privacy", "seats", "invoice", "cancel", "languages"]) {
      expect(typeof get(it, `faq.${name}.q`)).toBe("string");
      expect(typeof get(en, `faq.${name}.a`)).toBe("string");
    }
  });

  test("English has exactly the same keys and placeholders as Italian", () => {
    const itKeys = leaves(it).sort();
    expect(leaves(en).sort()).toEqual(itKeys);
    const placeholders = (value: unknown) =>
      [...String(value).matchAll(/\{(\w+)\}/g)]
        .map(match => match[1])
        .sort()
        .join(",");
    const mismatched = itKeys.filter(key => placeholders(get(it, key)) !== placeholders(get(en, key)));
    expect(mismatched).toEqual([]);
  });

  test("translator interpolates and falls back to Italian, then to the key", () => {
    expect(translator("it")("home.greeting", { name: "Giulia" })).toBe("Ciao, Giulia");
    expect(translator("en")("missing.key")).toBe("missing.key");
    expect(normalizeUiLocale("en-GB")).toBe("en");
    expect(normalizeUiLocale("de")).toBe("it");
    expect(localeFromAcceptLanguage("de-DE,en;q=0.8,it;q=0.5")).toBe("en");
    expect(localeFromAcceptLanguage("fr")).toBeNull();
  });
});
