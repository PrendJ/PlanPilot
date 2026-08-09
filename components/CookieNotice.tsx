"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "boardcue_cookie_notice_v1";

export function CookieNotice() {
  const [visible, setVisible] = useState(false);
  useEffect(() => { try { setVisible(localStorage.getItem(STORAGE_KEY) !== "hidden"); } catch { setVisible(true); } }, []);
  function dismiss() { try { localStorage.setItem(STORAGE_KEY, "hidden"); } catch {} setVisible(false); }
  if (!visible) return null;
  return (
    <aside className="cookie-notice" aria-label="Informativa cookie">
      <div><strong>Solo strumenti tecnici.</strong><span>BoardCue AI non usa cookie pubblicitari, di profilazione o analytics. Usa solo sessione e preferenze necessarie al servizio.</span></div>
      <div className="cookie-notice-actions"><a href="/cookies">Cookie Policy</a><a href="/privacy">Privacy</a><button type="button" className="btn accent" onClick={dismiss}>Ho capito</button></div>
    </aside>
  );
}
