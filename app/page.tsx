import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { DemoBoard } from "@/components/DemoBoard";

export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect("/app");
  return <div className="shell"><Topbar/><main className="page hero-demo"><div className="hero-row"><div className="hero-copy"><div className="pill">AI-FIRST PLANNING</div><h1>Tu racconti il lavoro. La board si aggiorna.</h1><p>PlanPilot trasforma aggiornamenti scritti o vocali in modifiche strutturate al piano: crea task, li sposta, aggiorna priorità e mantiene una cronologia leggibile.</p></div><a className="btn accent" href="/login">Accedi al tuo workspace</a></div><div className="demo-banner"><span>Demo pubblica · nessun dato reale e nessuna chiamata AI</span><a className="btn" href="/login">Login</a></div><DemoBoard/></main></div>;
}
