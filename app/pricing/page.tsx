import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PAID_PLAN_KEYS, PLANS, quotaIncreaseFromSolo } from "@/lib/plans";
import { Topbar } from "@/components/Topbar";
import { PublicFooter } from "@/components/PublicFooter";
import { CheckoutButton, EnterpriseForm } from "@/components/PricingActions";

const planDetails = {
  SOLO: { members: "1 membro", workspaces: "6 workspace" },
  TEAM: { members: "Fino a 10 membri", workspaces: "10 workspace" },
  STUDIO: { members: "Fino a 24 membri", workspaces: "Workspace illimitati" },
};

export default async function Pricing({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const checkout = Array.isArray(query.checkout) ? query.checkout[0] : query.checkout;
  const user = await getCurrentUser();
  const org = user ? await prisma.organizationMember.findFirst({ where: { userId: user.id, role: "OWNER" }, select: { organizationId: true } }) : null;

  return <div className="shell"><Topbar loggedIn={Boolean(user)} /><main className="grid-page wide"><div className="section-heading"><div className="pill">PREZZI</div><h1>Un piano semplice, senza sorprese.</h1><p>Prezzi mensili al netto dell’IVA. Prova gratuita di 7 giorni senza carta.</p></div>{checkout === "cancelled" && <div className="status error dashboard-notice" role="status">Checkout annullato: non è stato effettuato alcun addebito. Puoi riprendere quando vuoi.</div>}<div className="pricing-grid">{PAID_PLAN_KEYS.map(key => { const plan = PLANS[key]; const details = planDetails[key]; const increase = quotaIncreaseFromSolo(key); return <article className="pricing-card" key={key}><h2>{plan.label}</h2><strong>€{plan.priceEur}<small> + IVA / mese</small></strong><p>{details.members}<br />{details.workspaces}</p><ul><li>Board personalizzabili</li><li>{increase === null ? "Quota voce e AI inclusa" : `Quota voce e AI: +${increase}% rispetto a Solo`}</li><li>Export e attività</li></ul><CheckoutButton plan={key} organizationId={org?.organizationId} /></article>; })}<article className="pricing-card enterprise"><h2>Enterprise</h2><strong>Parliamone</strong><p>Da 25 membri o per requisiti personalizzati.</p><ul><li>Quote, SSO/SAML e SLA su misura</li><li>Onboarding e supporto prioritario</li><li>DPA, sicurezza e routing concordati</li></ul></article></div><section className="enterprise-section"><h2>Parla con noi</h2><p>Raccontaci la tua realtà: prepareremo insieme configurazione, contratto e onboarding.</p><EnterpriseForm /></section></main><PublicFooter /></div>;
}
