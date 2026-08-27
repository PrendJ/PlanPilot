"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { safeNextPath } from "@/lib/navigation";

export function LoginForm({ next = "/app", notice }: { next?: string; notice?: { tone: "success" | "error"; message: string } }) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState("");
  const [resendStatus, setResendStatus] = useState("");
  const router = useRouter();
  const destination = safeNextPath(next, "/app");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setResendStatus(""); setUnverifiedEmail(""); setLoading(true);
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") || "");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: data.get("password") }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (body.code === "EMAIL_NOT_VERIFIED") setUnverifiedEmail(email);
        setError(body.error || "Accesso non riuscito. Riprova.");
        return;
      }
      router.replace(destination); router.refresh();
    } catch {
      setError("Connessione non disponibile. Controlla la rete e riprova.");
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setLoading(true); setResendStatus("");
    try {
      const response = await fetch("/api/auth/resend-verification", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: unverifiedEmail, ...(destination !== "/app" && { next: destination }) }) });
      if (!response.ok) throw new Error();
      setError(""); setResendStatus("Nuovo link inviato. Controlla anche spam e promozioni.");
    } catch {
      setError("Non siamo riusciti a inviare il link. Riprova tra poco.");
    } finally {
      setLoading(false);
    }
  }

  return <form onSubmit={submit}>
    {notice && <div className={`status ${notice.tone === "error" ? "error" : ""}`} role="status">{notice.message}</div>}
    <div className="field"><label htmlFor="login-email">Email</label><input id="login-email" name="email" type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" autoComplete="email" placeholder="nome@azienda.it" required autoFocus /></div>
    <div className="field"><label htmlFor="login-password">Password</label><div className="password-field"><input id="login-password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required minLength={8} /><button type="button" className="password-toggle" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? "Nascondi password" : "Mostra password"}>{showPassword ? "Nascondi" : "Mostra"}</button></div></div>
    {error && <div className="form-error" role="alert" aria-live="assertive">{error}</div>}
    {unverifiedEmail && <button className="text-button verification-resend" type="button" onClick={resend} disabled={loading}>Invia un nuovo link di verifica</button>}
    {resendStatus && <div className="status" role="status">{resendStatus}</div>}
    <button className="btn accent auth-submit" disabled={loading}>{loading ? "Accesso…" : "Accedi"}</button>
    <div className="auth-links"><a href="/forgot-password">Password dimenticata?</a><a href={`/register${destination !== "/app" ? `?next=${encodeURIComponent(destination)}` : ""}`}>Crea account</a></div>
  </form>;
}
