import { Suspense } from "react"; import { Brand } from "@/components/Brand"; import { AccountForm } from "@/components/AccountForm";
export default function ResetPage(){return <main className="auth-page"><div className="auth-card"><Brand/><h1>Nuova password.</h1><p>La modifica disconnetterà tutte le sessioni attive.</p><Suspense><AccountForm mode="reset"/></Suspense></div></main>}
