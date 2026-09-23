import { it } from "./it";
import { en } from "./en";

export const UI_LOCALES = ["it", "en"] as const;
export type UiLocale = (typeof UI_LOCALES)[number];
export const LOCALE_COOKIE = "boardcue_locale";
export const LOCALE_HEADER = "x-boardcue-locale";

type Widen<T> = T extends string ? string : { [K in keyof T]: Widen<T[K]> };
export type Messages = Widen<typeof it>;

const dictionaries: Record<UiLocale, Messages> = { it, en };

export function normalizeUiLocale(value?: string | null): UiLocale {
  const short = (value || "").toLowerCase().slice(0, 2);
  return (UI_LOCALES as readonly string[]).includes(short) ? (short as UiLocale) : "it";
}

/** Picks the first supported language from an Accept-Language header. */
export function localeFromAcceptLanguage(header?: string | null): UiLocale | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const code = part.split(";")[0].trim().toLowerCase().slice(0, 2);
    if ((UI_LOCALES as readonly string[]).includes(code)) return code as UiLocale;
  }
  return null;
}

export function messages(locale: UiLocale): Messages {
  return dictionaries[locale];
}

function lookup(tree: unknown, key: string): string | undefined {
  let node: unknown = tree;
  for (const part of key.split(".")) {
    if (!node || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

export type Translate = (key: string, vars?: Record<string, string | number>) => string;

export function translator(locale: UiLocale): Translate {
  return (key, vars) => {
    const template = lookup(dictionaries[locale], key) ?? lookup(dictionaries.it, key) ?? key;
    return vars ? template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match)) : template;
  };
}

export function localeTag(locale: UiLocale) {
  return locale === "en" ? "en-GB" : "it-IT";
}
