import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Brand } from "@/components/Brand";
import { LoginForm } from "@/components/LoginForm";
import { PublicFooter } from "@/components/PublicFooter";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/app");

  return (
    <div className="shell auth-shell">
      <main className="auth-page">
        <div className="auth-card">
          <Brand />
          <h1>Bentornato.</h1>
          <p>Accedi a BoardCue AI con il tuo account.</p>
          <LoginForm />
          <a className="auth-home-link" href="/demo">← Torna alla demo</a>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
