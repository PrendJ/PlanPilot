import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { DemoBoard } from "@/components/DemoBoard";

export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect("/app");

  return <div className="shell"><Topbar/><main className="page hero-demo"><div className="hero-row"><div className="hero-copy"><div className="pill">VOICE + AI BOARD</div><h1>Parla. L’AI capisce. La board si aggiorna.</h1><p>VoxBoard AI trasforma aggiornamenti scritti o vocali in modifiche strutturate al piano: crea task, li sposta, aggiorna priorità e mantiene il lavoro sempre nel loop.</p></div><div className="top-actions"><a className="btn accent" href="/demo">Apri la demo</a><a className="btn" href="/login">Login</a></div></div><div className="demo-banner"><span>Demo pubblica · nessun dato reale e nessuna chiamata AI</span><a className="btn" href="/demo">Apri demo dedicata</a></div><DemoBoard/></main></div>;
}
