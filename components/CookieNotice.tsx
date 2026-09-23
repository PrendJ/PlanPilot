"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useT } from "./I18nProvider";

const STORAGE_KEY = "boardcue_cookie_notice_v1";

/** Informational notice only: BoardCue uses technical cookies, so no consent choice is required. */
export function CookieNotice() {
  const t = useT();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    try {
      setVisible(localStorage.getItem(STORAGE_KEY) !== "hidden");
    } catch {
      setVisible(true);
    }
  }, []);
  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, "hidden");
    } catch {
      /* storage unavailable */
    }
    setVisible(false);
  }
  if (!visible) return null;
  return (
    <aside className="cookie-notice" aria-label={t("cookie.label")}>
      <div>
        <strong>{t("cookie.title")}</strong>
        <span>{t("cookie.body")}</span>
      </div>
      <div className="cookie-notice-actions">
        <Link href="/cookies">{t("legal.cookies")}</Link>
        <Link href="/privacy">{t("legal.privacy")}</Link>
        <button type="button" className="btn primary sm" onClick={dismiss}>
          {t("cookie.ok")}
        </button>
      </div>
    </aside>
  );
}
