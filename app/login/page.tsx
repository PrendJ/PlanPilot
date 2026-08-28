import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Brand } from "@/components/Brand";
import { LoginForm } from "@/components/LoginForm";
import { PublicFooter } from "@/components/PublicFooter";
import { safeNextPath } from "@/lib/navigation";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (await getCurrentUser()) redirect("/app");
  const query = await searchParams;
  const next = safeNextPath(Array.isArray(query.next) ? query.next[0] : query.next, "/app");
  const verified = Array.isArray(query.verified) ? query.verified[0] : query.verified;
  const reset = Array.isArray(query.reset) ? query.reset[0] : query.reset;
  const registered = Array.isArray(query.registered) ? query.registered[0] : query.registered;
  const notice = verified === "1"
    ? { tone: "success" as const, message: "Email verificata. Ora puoi accedere." }
    : verified === "invalid"
      ? { tone: "error" as const, message: "Il link di verifica è scaduto o non è valido. Accedi per richiederne uno nuovo." }
      : reset === "1"
        ? { tone: "success" as const, message: "Password aggiornata. Accedi con quella nuova." }
        : registered === "1"
          ? { tone: "success" as const, message: "Registrazione completata. Controlla la tua email e verifica l’indirizzo prima di accedere." }
        : undefined;

  return <div className="shell auth-shell"><main className="auth-page"><div className="auth-card"><Brand/><h1>Bentornato.</h1><p>Accedi per riprendere il lavoro da dove l’hai lasciato.</p><LoginForm next={next} notice={notice}/><a className="auth-home-link" href="/demo">← Torna alla demo</a></div></main><PublicFooter/></div>;
}
