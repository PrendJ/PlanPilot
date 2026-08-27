"use client";

import { FormEvent, useState } from "react";

export function CheckoutButton({ plan, organizationId }: { plan: "SOLO" | "TEAM" | "STUDIO"; organizationId?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function click() {
    if (!organizationId) { location.href = "/register"; return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan, organizationId }) });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body.url) location.href = body.url;
      else setError(body.error || "Il checkout non è disponibile. Riprova tra poco.");
    } catch {
      setError("Connessione interrotta. Nessun acquisto è stato avviato.");
    } finally {
      setBusy(false);
    }
  }
  return <><button className="btn accent" onClick={click} disabled={busy}>{busy ? "Apro il checkout…" : "Scegli questo piano"}</button>{error && <div className="form-error" role="alert">{error}</div>}</>;
}

export function EnterpriseForm() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [bookingUrl, setBookingUrl] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true); setMessage(""); setError(""); setBookingUrl("");
    try {
      const response = await fetch("/api/sales/enterprise", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(form).entries())) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setError(body.error || "Invio non riuscito. Controlla i dati e riprova."); return; }
      setMessage("Richiesta inviata. Ti ricontatterò personalmente.");
      setBookingUrl(body.bookingUrl || "");
      form.reset();
    } catch {
      setError("Connessione interrotta. La richiesta non è stata inviata.");
    } finally {
      setBusy(false);
    }
  }
  return <form className="enterprise-form" onSubmit={submit}><div className="form-grid"><label>Nome<input name="name" autoComplete="name" required/></label><label>Email<input name="email" type="email" inputMode="email" autoComplete="email" required/></label><label>Azienda<input name="company" autoComplete="organization" required/></label><label>Dimensione team<input name="teamSize" type="number" min="17" required/></label><label>Lingua<select name="locale" defaultValue="it"><option value="it">Italiano</option><option value="en">English</option><option value="de">Deutsch</option><option value="fr">Français</option><option value="es">Español</option><option value="ru">Русский</option><option value="pl">Polski</option></select></label></div><label>Di cosa hai bisogno?<textarea name="needs" minLength={10} placeholder="Es. SSO, onboarding per 40 persone, requisiti di sicurezza…" required/></label><button className="btn accent" disabled={busy}>{busy ? "Invio…" : "Richiedi una call con Lorenzo"}</button>{message&&<div className="status" role="status">{message}{bookingUrl&&<> <a href={bookingUrl} target="_blank" rel="noreferrer">Prenota ora un orario →</a></>}</div>}{error&&<div className="status error" role="alert">{error}</div>}</form>;
}
