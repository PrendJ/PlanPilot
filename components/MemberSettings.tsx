"use client";

import { FormEvent, useState } from "react";

type Member = { userId: string; role: string; user: { name: string; email: string } };

export function MemberSettings({ slug, initialMembers, canChangeRoles }: { slug: string; initialMembers: Member[]; canChangeRoles: boolean }) {
  const [members, setMembers] = useState(initialMembers);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState("");

  async function request(url: string, options: RequestInit) {
    try {
      const response = await fetch(url, options);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setFeedback({ tone: "error", text: body.error || "Operazione non riuscita. Riprova." }); return null; }
      return body;
    } catch {
      setFeedback({ tone: "error", text: "Connessione interrotta. Nessuna modifica è stata salvata." });
      return null;
    }
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    setBusy("invite"); setFeedback(null);
    const body = await request(`/api/workspaces/${slug}/invites`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: fields.get("email"), role: fields.get("role") }) });
    setBusy("");
    if (body) { setFeedback({ tone: "success", text: "Invito inviato. Scadrà tra 7 giorni." }); form.reset(); }
  }

  async function changeRole(userId: string, role: string) {
    setBusy(userId); setFeedback(null);
    const body = await request(`/api/workspaces/${slug}/members/${userId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }) });
    setBusy("");
    if (body) { setMembers(current => current.map(member => member.userId === userId ? { ...member, role } : member)); setFeedback({ tone: "success", text: "Ruolo aggiornato." }); }
  }

  async function remove(userId: string) {
    if (!confirm("Rimuovere questa persona dalla board? Potrà rientrare solo con un nuovo invito.")) return;
    setBusy(userId); setFeedback(null);
    const body = await request(`/api/workspaces/${slug}/members/${userId}`, { method: "DELETE" });
    setBusy("");
    if (body) { setMembers(current => current.filter(member => member.userId !== userId)); setFeedback({ tone: "success", text: "Membro rimosso dalla board." }); }
  }

  return <section className="settings-card"><div className="settings-head"><div><h2>Membri e inviti</h2><p>Invita tramite email. Il link dura 7 giorni e il piano stabilisce quante persone possono partecipare.</p></div></div><form className="member-invite" onSubmit={invite}><label className="sr-only" htmlFor="invite-email">Email da invitare</label><input id="invite-email" name="email" type="email" inputMode="email" autoCapitalize="none" placeholder="nome@azienda.it" required/><label className="sr-only" htmlFor="invite-role">Ruolo</label><select id="invite-role" name="role" defaultValue="MEMBER"><option value="MEMBER">Membro · può lavorare sulla board</option><option value="ADMIN">Admin · può anche configurarla</option></select><button className="btn accent" disabled={busy === "invite"}>{busy === "invite" ? "Invio…" : "Invita"}</button></form><div className="member-list">{members.map(member=><div key={member.userId}><span><strong>{member.user.name}</strong><small>{member.user.email}</small></span>{canChangeRoles?<><select aria-label={`Ruolo di ${member.user.name}`} value={member.role} disabled={busy === member.userId} onChange={event=>changeRole(member.userId,event.target.value)}><option value="OWNER">Owner</option><option value="ADMIN">Admin</option><option value="MEMBER">Membro</option></select><button className="btn danger" disabled={busy === member.userId} onClick={()=>remove(member.userId)}>Rimuovi</button></>:<span>{member.role}</span>}</div>)}</div>{feedback&&<div className={`status ${feedback.tone === "error" ? "error" : ""}`} role={feedback.tone === "error" ? "alert" : "status"}>{feedback.text}</div>}</section>;
}
