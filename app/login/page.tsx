import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Brand } from "@/components/Brand";
import { LoginForm } from "@/components/LoginForm";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/app");
  return <div className="auth-page"><div className="auth-card"><Brand/><h1>Bentornato.</h1><p>Accedi a PlanPilot con l’utente creato da terminale.</p><LoginForm/><a href="/" style={{display:"block",textAlign:"center",marginTop:16,color:"var(--muted)",fontSize:12}}>← Torna alla demo</a></div></div>;
}
