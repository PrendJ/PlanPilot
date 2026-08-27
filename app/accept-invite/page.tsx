import { Brand } from "@/components/Brand";
import { AcceptInvite } from "@/components/AcceptInvite";
import { getCurrentUser } from "@/lib/auth";

export default async function AcceptInvitePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const token = String(Array.isArray(query.token) ? query.token[0] : query.token || "");
  const user = await getCurrentUser();
  const next = `/accept-invite?token=${encodeURIComponent(token)}`;
  return <main className="auth-page"><div className="auth-card"><Brand/>{!token ? <div className="auth-state error-state"><span className="auth-state-icon">!</span><h1>Invito non valido</h1><p>Il link è incompleto. Chiedi a chi ti ha invitato di inviarne uno nuovo.</p><a className="btn" href="/">Torna alla home</a></div> : user ? <><div className="auth-step">ULTIMO PASSAGGIO</div><h1>Unisciti al workspace.</h1><p>Sei connesso come <strong>{user.email}</strong>. Accetta per aggiungere il workspace al tuo account.</p><AcceptInvite token={token}/></> : <><div className="auth-step">INVITO RICEVUTO</div><h1>Prima, accedi.</h1><p>L’invito resta pronto: dopo l’accesso tornerai qui automaticamente.</p><div className="auth-state-actions vertical"><a className="btn accent" href={`/login?next=${encodeURIComponent(next)}`}>Accedi e continua</a><a className="btn" href={`/register?next=${encodeURIComponent(next)}`}>Non hai un account? Crealo</a></div></>}</div></main>;
}
