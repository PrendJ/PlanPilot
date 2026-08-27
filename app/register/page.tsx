import { Suspense } from "react";
import { Brand } from "@/components/Brand";
import { AccountForm } from "@/components/AccountForm";
import { safeNextPath } from "@/lib/navigation";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const next = safeNextPath(Array.isArray(query.next) ? query.next[0] : query.next, "/app");
  return <main className="auth-page"><div className="auth-card"><Brand/><h1>Crea il tuo spazio.</h1><p>7 giorni gratis, senza carta. Ti guideremo nella creazione della prima board.</p><Suspense fallback={<div className="auth-state">Caricamento…</div>}><AccountForm mode="register"/></Suspense><a className="auth-home-link" href={`/login${next !== "/app" ? `?next=${encodeURIComponent(next)}` : ""}`}>Hai già un account? Accedi</a></div></main>;
}
