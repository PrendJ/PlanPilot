"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { safeNextPath } from "@/lib/navigation";

type Mode = "register" | "forgot" | "reset";
type Delivery = "sent" | "preview" | "retry";

async function responseBody(response: Response) {
  return response.json().catch(() => ({})) as Promise<{ error?: string; delivery?: Delivery; valid?: boolean }>;
}

export function AccountForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const search = useSearchParams();
  const token = search.get("token") || "";
  const next = safeNextPath(search.get("next"), "/app");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState<{ email: string; delivery?: Delivery } | null>(null);
  const [tokenState, setTokenState] = useState<"checking" | "valid" | "invalid">(mode === "reset" ? "checking" : "valid");
  const [showPassword, setShowPassword] = useState(false);
  const [resendStatus, setResendStatus] = useState("");

  useEffect(() => {
    if (mode !== "reset") return;
    if (!token) { setTokenState("invalid"); return; }
    let active = true;
    fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`)
      .then(async response => ({ response, body: await responseBody(response) }))
      .then(({ response, body }) => { if (active) setTokenState(response.ok && body.valid ? "valid" : "invalid"); })
      .catch(() => { if (active) setTokenState("invalid"); });
    return () => { active = false; };
  }, [mode, token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    const form = event.currentTarget;
    const fields = new FormData(form);
    const body = Object.fromEntries(fields.entries());
    if (mode === "reset") body.token = token;
    if (mode === "register" && next !== "/app") body.next = next;
    const url = mode === "register" ? "/api/auth/register" : mode === "forgot" ? "/api/auth/forgot-password" : "/api/auth/reset-password";
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await responseBody(response);
      if (!response.ok) { setError(data.error || "Operazione non riuscita. Riprova."); return; }
      if (mode === "reset") {
        router.replace(`/login?reset=1${next !== "/app" ? `&next=${encodeURIComponent(next)}` : ""}`);
        router.refresh();
        return;
      }
      form.reset();
      setComplete({ email: String(fields.get("email") || ""), delivery: data.delivery });
    } catch {
      setError("Connessione non disponibile. Controlla la rete e riprova.");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!complete?.email) return;
    setBusy(true); setResendStatus(""); setError("");
    try {
      const response = await fetch("/api/auth/resend-verification", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: complete.email, ...(next !== "/app" && { next }) }) });
      if (!response.ok) { const body = await responseBody(response); setError(body.error || "Invio non riuscito. Riprova tra poco."); return; }
      setResendStatus("Nuovo link inviato. Usa solo l’email più recente.");
    } catch {
      setError("Connessione non disponibile. Riprova tra poco.");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "reset" && tokenState === "checking") return <div className="auth-state" role="status"><span className="auth-state-icon">…</span><h2>Controllo del link</h2><p>Un momento: verifichiamo che sia ancora valido.</p></div>;
  if (mode === "reset" && tokenState === "invalid") return <div className="auth-state error-state"><span className="auth-state-icon">!</span><h2>Questo link non è più valido</h2><p>Potrebbe essere scaduto o essere già stato usato. Richiedine uno nuovo per continuare in sicurezza.</p><a className="btn accent" href="/forgot-password">Richiedi un nuovo link</a><a className="auth-home-link" href="/login">Torna al login</a></div>;

  if (complete) {
    const registration = mode === "register";
    return <div className="auth-state" role="status" aria-live="polite">
      <span className="auth-state-icon">✓</span>
      <h2>{registration ? "Ora controlla la tua email" : "Controlla la posta"}</h2>
      <p>{registration ? "Riceverai il prossimo passo: se l’account è nuovo, premi “Verifica email” entro 24 ore; se era già attivo, troverai le istruzioni per accedere." : "Se l’indirizzo corrisponde a un account, riceverai un link valido per un’ora."}</p>
      {registration && complete.delivery === "retry" && <div className="status error">Non siamo riusciti a inviare il messaggio. I dati sono al sicuro: premi “Invia di nuovo”.</div>}
      {resendStatus && <div className="status">{resendStatus}</div>}
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="auth-state-actions">
        {registration && <button className="btn accent" type="button" disabled={busy} onClick={resend}>{busy ? "Invio…" : "Invia di nuovo"}</button>}
        <a className="btn" href={`/login${next !== "/app" ? `?next=${encodeURIComponent(next)}` : ""}`}>Vai al login</a>
      </div>
      <button className="text-button" type="button" onClick={() => { setComplete(null); setError(""); setResendStatus(""); }}>Usa un altro indirizzo</button>
    </div>;
  }

  const passwordId = `${mode}-password`;
  return <form onSubmit={submit}>
    {mode === "register" && <>
      <div className="field"><label htmlFor="register-name">Come ti chiami?</label><input id="register-name" name="name" autoComplete="name" placeholder="Nome e cognome" required minLength={2} maxLength={100} autoFocus /></div>
      <div className="field"><label htmlFor="register-organization">Nome del tuo team o progetto</label><input id="register-organization" name="organizationName" autoComplete="organization" placeholder="Es. Studio Rossi" required minLength={2} maxLength={100} /><small>Potrai cambiarlo più avanti.</small></div>
    </>}
    {mode !== "reset" && <div className="field"><label htmlFor={`${mode}-email`}>Email</label><input id={`${mode}-email`} name="email" type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" autoComplete="email" placeholder="nome@azienda.it" required autoFocus={mode === "forgot"} /></div>}
    {mode !== "forgot" && <div className="field"><label htmlFor={passwordId}>{mode === "register" ? "Crea una password" : "Nuova password"}</label><div className="password-field"><input id={passwordId} name="password" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={10} maxLength={200} required autoFocus={mode === "reset"} aria-describedby={`${passwordId}-hint`} /><button type="button" className="password-toggle" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? "Nascondi password" : "Mostra password"}>{showPassword ? "Nascondi" : "Mostra"}</button></div><small id={`${passwordId}-hint`}>Almeno 10 caratteri. Una frase lunga è più facile da ricordare.</small></div>}
    {mode === "register" && <div className="field"><label htmlFor="register-locale">Lingua della prima board</label><select id="register-locale" name="locale" defaultValue="it"><option value="it">Italiano</option><option value="en">English</option><option value="de">Deutsch</option><option value="fr">Français</option><option value="es">Español</option><option value="ru">Русский</option><option value="pl">Polski</option></select></div>}
    {mode === "register" && <p className="form-consent">Creando l’account accetti i <a href="/terms" target="_blank" rel="noreferrer">Termini</a> e confermi di aver letto la <a href="/privacy" target="_blank" rel="noreferrer">Privacy</a>.</p>}
    {error && <div className="form-error" role="alert" aria-live="assertive">{error}</div>}
    <button className="btn accent auth-submit" disabled={busy}>{busy ? "Attendi…" : mode === "register" ? "Crea account" : mode === "forgot" ? "Invia il link" : "Salva la nuova password"}</button>
  </form>;
}
