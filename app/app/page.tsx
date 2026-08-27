import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { PLANS, planKey } from "@/lib/plans";
import { ensureDefaultOrganization } from "@/lib/default-organization";

const limit = (value:number) => Number.isFinite(value) ? String(value) : "Illimitati";

export default async function AppPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const defaultOrganization = await ensureDefaultOrganization(user.id);
  const [memberships, organizations] = await Promise.all([
    prisma.workspaceMember.findMany({ where:{userId:user.id,workspace:{lifecycleStatus:"ACTIVE"}}, include:{workspace:{include:{organization:{select:{name:true}}}}}, orderBy:{createdAt:"desc"} }),
    prisma.organizationMember.findMany({ where:{userId:user.id}, include:{organization:{include:{subscription:true,_count:{select:{members:true,workspaces:true}}}}}, orderBy:{createdAt:"asc"} }),
  ]);
  const primary = organizations.find(item=>item.organizationId===defaultOrganization.id);
  const recentWorkspaces = memberships.slice(0, 6);
  const plan = primary ? PLANS[planKey(primary.organization.plan)] : PLANS.TRIAL;
  const renewal = primary?.organization.subscription?.currentPeriodEnd || primary?.organization.accessExpiresAt || primary?.organization.trialEndsAt;

  return <div className="shell"><Topbar loggedIn/><main className="grid-page dashboard-page">
    <div className="dashboard-head"><div><div className="pill">HOME</div><h1>Ciao, {user.name}.</h1><p className="muted-copy">Il punto di partenza per i tuoi workspace, le organizzazioni e l’abbonamento.</p></div>{user.isAdmin&&<a className="btn accent" href="/admin">Apri il backoffice</a>}</div>
    <section className="dashboard-grid">
      <article className="dashboard-card subscription-summary"><span className="eyebrow">ORGANIZZAZIONE PREDEFINITA</span>{primary?<><div className="dashboard-card-head"><div><h2>{primary.organization.name}</h2><small>{primary.organization.legalType==="PERSONAL"?"Personale":"Business"} · {primary.role}</small></div><span className={`plan-badge plan-${primary.organization.plan}`}>{plan.label}</span></div><strong className="dashboard-price">{plan.priceEur===null?"Su misura":plan.priceEur===0?"€0":`€${plan.priceEur}`}<small>{typeof plan.priceEur==="number"&&plan.priceEur>0?" + IVA / mese":""}</small></strong><p>{primary.organization.lifecycleStatus!=="ACTIVE"?"Organizzazione archiviata":primary.organization.subscription?.status?`Stato: ${primary.organization.subscription.status}`:primary.organization.readOnlyAt?"Accesso in sola lettura":"Accesso attivo"} · Licenza {primary.organization.licenseSource}</p>{renewal&&<p>{primary.organization.subscription?.currentPeriodEnd?"Prossimo rinnovo":"Scadenza"}: <strong>{new Date(renewal).toLocaleDateString("it-IT")}</strong></p>}<div className="usage-summary"><span>Workspace <strong>{primary.organization._count.workspaces} / {limit(plan.workspaceLimit)}</strong></span><span>Membri <strong>{primary.organization._count.members} / {limit(plan.memberLimit)}</strong></span></div><div className="dashboard-actions"><a className="btn" href="/account">Gestisci account</a><a className="btn ghost" href="/pricing">Confronta piani</a></div></>:<><h2>Provisioning non disponibile</h2><p>Non è stato possibile risolvere l’organizzazione predefinita.</p></>}</article>
      <article className="dashboard-card workspace-summary"><span className="eyebrow">WORKSPACE ATTIVI</span><strong className="dashboard-count">{memberships.length}</strong><p>La creazione parte sempre da <strong>{defaultOrganization.name}</strong>.</p><a className="btn accent" href="/workspaces">Crea o gestisci workspace</a></article>
    </section>
    <section className="dashboard-section organization-overview"><div className="settings-head"><div><h2>Le tue organizzazioni</h2><p>Quella predefinita è il tuo contesto di lavoro; le altre possono essere condivise.</p></div><a className="btn ghost" href="/account">Dettagli e abbonamenti</a></div><div className="organization-list">{organizations.map(({role,organization})=><div key={organization.id}><div><strong>{organization.name}</strong><small>{organization.id===defaultOrganization.id?"Predefinita":role==="OWNER"||role==="ADMIN"?"Gestita":"Condivisa"} · {role}</small></div><span className={`plan-badge plan-${organization.plan}`}>{organization.plan}</span></div>)}</div></section>
    <section className="dashboard-section"><div className="settings-head"><div><h2>Workspace recenti</h2><p>Riprendi rapidamente il lavoro sulle tue board.</p></div><a className="btn ghost" href="/workspaces">Vedi tutti</a></div><div className="workspace-grid compact">{recentWorkspaces.map(({role,workspace})=><a className="workspace-tile" href={`/app/${workspace.slug}`} key={workspace.id}><span className="pill">{role}</span><h3>{workspace.name}</h3><p>{workspace.organization.name}</p></a>)}{!memberships.length&&<div className="empty-state"><h3>Nessun workspace attivo</h3><p>Puoi creare subito il primo workspace nella tua organizzazione predefinita.</p><a className="btn accent" href="/workspaces">Crea workspace</a></div>}</div></section>
  </main></div>;
}
