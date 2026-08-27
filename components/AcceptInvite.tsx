"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [wrongAccount, setWrongAccount] = useState(false);

  async function accept() {
    setBusy(true); setError(""); setWrongAccount(false);
    try {
      const response = await fetch("/api/invites/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error || "Non è stato possibile accettare l’invito.");
        setWrongAccount(response.status === 403);
        return;
      }
      router.replace(body.destination || "/app"); router.refresh();
    } catch {
      setError("Connessione non disponibile. Controlla la rete e riprova.");
    } finally {
      setBusy(false);
    }
  }

  async function changeAccount() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    const next = `/accept-invite?token=${encodeURIComponent(token)}`;
    router.replace(`/login?next=${encodeURIComponent(next)}`); router.refresh();
  }

  return <div className="auth-state-actions vertical">
    <button className="btn accent" onClick={accept} disabled={busy}>{busy ? "Accetto…" : "Accetta e apri il workspace"}</button>
    {error && <div className="form-error" role="alert">{error}</div>}
    {wrongAccount && <button className="text-button" type="button" onClick={changeAccount} disabled={busy}>Accedi con un altro account</button>}
  </div>;
}
