import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { PLANS, planKey } from "@/lib/plans";
import { firstPersonalOrganization } from "@/lib/personal-organization";

export default async function AppPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [memberships, organizations] = await Promise.all([
    prisma.workspaceMember.findMany({ where:{userId:user.id,workspace:{lifecycleStatus:"ACTIVE"}}, include:{workspace:{include:{organization:{select:{name:true}}}}}, orderBy:{createdAt:"desc"} }),
    prisma.organizationMember.findMany({ where:{userId:user.id}, include:{organization:{include:{subscription:true}}}, orderBy:{createdAt:"asc"} }),
  ]);
  const personal = firstPersonalOrganization(user.id, organizations);
  const recentWorkspaces = memberships.slice(0, 6);
  const plan = personal ? PLANS[planKey(personal.organization.plan)] : null;
  const renewal = personal?.organization.subscription?.currentPeriodEnd || personal?.organization.accessExpiresAt || personal?.organization.trialEndsAt;

  return <div className="shell"><Topbar loggedIn/><main className="grid-page dashboard-page">
    <div className="dashboard-head"><div><div className="pill">HOME</div><h1>Ciao, {user.name}.</h1><p className="muted-copy">Il punto di partenza per i tuoi workspace e il tuo abbonamento.</p></div>{user.isAdmin&&<a className="btn accent" href="/admin">Apri il backoffice</a>}</div>
    <section className="dashboard-grid">
      <article className="dashboard-card subscription-summary"><span className="eyebrow">Abbonamento personale</span>{personal&&plan?<><div className="dashboard-card-head"><h2>{plan.label}</h2><span className={`plan-badge plan-${personal.organization.plan}`}>{personal.organization.licenseSource}</span></div><strong className="dashboard-price">{plan.priceEur===null?"Su misura":plan.priceEur===0?"€0":`€${plan.priceEur}`}<small>{typeof plan.priceEur==="number"&&plan.priceEur>0?" + IVA / mese":""}</small></strong><p>{personal.organization.subscription?.status?`Stato: ${personal.organization.subscription.status}`:personal.organization.readOnlyAt?"Accesso in sola lettura":"Accesso attivo"}</p>{renewal&&<p>{personal.organization.subscription?.currentPeriodEnd?"Prossimo rinnovo":"Scadenza"}: <strong>{new Date(renewal).toLocaleDateString("it-IT")}</strong></p>}<div className="dashboard-actions"><a className="btn" href="/account">Gestisci account</a><a className="btn ghost" href="/pricing">Confronta piani</a></div></>:<><h2>Nessuna organizzazione personale</h2><p>Puoi comunque lavorare nei workspace a cui sei stato invitato.</p><a className="btn" href="/account">Vai all’account</a></>}</article>
      <article className="dashboard-card workspace-summary"><span className="eyebrow">Workspace attivi</span><strong className="dashboard-count">{memberships.length}</strong><p>Accessi disponibili per il tuo account.</p><a className="btn accent" href="/workspaces">Gestisci workspace</a></article>
    </section>
    <section className="dashboard-section"><div className="settings-head"><div><h2>Workspace recenti</h2><p>Riprendi rapidamente il lavoro sulle tue board.</p></div><a className="btn ghost" href="/workspaces">Vedi tutti</a></div><div className="workspace-grid compact">{recentWorkspaces.map(({role,workspace})=><a className="workspace-tile" href={`/app/${workspace.slug}`} key={workspace.id}><span className="pill">{role}</span><h3>{workspace.name}</h3><p>{workspace.organization.name}</p></a>)}{!memberships.length&&<div className="empty-state"><h3>Nessun workspace attivo</h3><p>Crea il primo workspace o attendi un invito.</p><a className="btn accent" href="/workspaces">Gestisci workspace</a></div>}</div></section>
  </main></div>;
}
