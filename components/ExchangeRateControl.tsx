"use client";

import { useState } from "react";

export type ExchangeRateStatus = {
  usdToEur: number;
  mode: "AUTO" | "MANUAL";
  source: string;
  observedAt: string | Date | null;
  fetchedAt: string | Date | null;
  stale: boolean;
  lastFetchError: string | null;
};

export function ExchangeRateControl({ initial, onChanged }: { initial: ExchangeRateStatus; onChanged: () => Promise<void> | void }) {
  const [status, setStatus] = useState(initial);
  const [mode, setMode] = useState<"AUTO" | "MANUAL">(initial.mode);
  const [manual, setManual] = useState(String(initial.usdToEur));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const formatDate = (value: string | Date | null) => value ? new Date(value).toLocaleDateString("it-IT") : "non ancora disponibile";

  async function request(method: "PATCH" | "POST", body?: object) {
    setBusy(true); setError("");
    const response = await fetch("/api/admin/economics/exchange-rate", { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) { setError(data.error || "Aggiornamento non riuscito"); return; }
    setStatus(data); setMode(data.mode); setManual(String(data.usdToEur)); await onChanged();
  }

  return <section className="admin-card exchange-rate-control"><div><h2>Cambio USD → EUR</h2><p>{status.mode === "AUTO" ? "Aggiornato una volta al giorno dal tasso di riferimento BCE." : "Override manuale attivo per i calcoli del backoffice."} Ultimo valore: <strong>1 USD = {status.usdToEur.toFixed(4)} EUR</strong>.</p><small>Fonte: {status.source} · data tasso: {formatDate(status.observedAt)}</small>{status.stale && <small className="negative"> Il dato non è aggiornato oggi.</small>}{status.lastFetchError && status.stale && <small className="negative"> Riprova più tardi: {status.lastFetchError}</small>}</div><div className="exchange-rate-actions"><label>Modalità<select value={mode} disabled={busy} onChange={event => setMode(event.target.value as "AUTO" | "MANUAL")}><option value="AUTO">Automatica</option><option value="MANUAL">Manuale</option></select></label>{mode === "MANUAL" && <label>EUR per 1 USD<input type="number" min="0.5" max="1.5" step="0.0001" value={manual} disabled={busy} onChange={event => setManual(event.target.value)}/></label>}<button className="btn accent" disabled={busy} onClick={() => request("PATCH", { mode, ...(mode === "MANUAL" ? { usdToEur: Number(manual) } : {}) })}>{busy ? "Salvataggio…" : "Applica"}</button>{mode === "AUTO" && <button className="btn" disabled={busy} onClick={() => request("POST")}>Aggiorna ora</button>}</div>{error && <p className="negative">{error}</p>}</section>;
}
