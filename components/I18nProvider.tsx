"use client";

import { createContext, useContext, useMemo } from "react";
import { localeTag, translator, type Translate, type UiLocale } from "@/lib/i18n/core";

const I18nContext = createContext<{ locale: UiLocale; t: Translate; tag: string }>({ locale: "it", t: translator("it"), tag: "it-IT" });

export function I18nProvider({ locale, children }: { locale: UiLocale; children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, t: translator(locale), tag: localeTag(locale) }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

export function useT() {
  return useContext(I18nContext).t;
}
