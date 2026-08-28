import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/Topbar";
import { AccountSettings } from "@/components/AccountSettings";
import { getOrganizationLimits, PLANS, planKey } from "@/lib/plans";
import { ensureDefaultOrganization } from "@/lib/default-organization";

export default async function Account() {
  const user = await getCurrentUser(); if (!user) redirect("/login");
  const defaultOrganization = await ensureDefaultOrganization(user.id);
  const memberships = await prisma.organizationMember.findMany({where:{userId:user.id},include:{organization:{include:{subscription:true,_count:{select:{members:true,workspaces:true}}}}},orderBy:{createdAt:"asc"}});
  return <div className="shell"><Topbar loggedIn/><main className="grid-page"><div className="pill">ACCOUNT</div><h1>{user.name}</h1><p className="muted-copy">{user.email}</p><AccountSettings organizations={memberships.map(({role,organization})=>{const plan=PLANS[planKey(organization.plan)],limits=getOrganizationLimits(organization);return {id:organization.id,name:organization.name,slug:organization.slug,isDefault:organization.id===defaultOrganization.id,legalType:organization.legalType,lifecycleStatus:organization.lifecycleStatus,plan:organization.plan,planLabel:plan.label,priceEur:plan.priceEur,memberLimit:limits.memberLimit,workspaceLimit:limits.workspaceLimit,members:organization._count.members,workspaces:organization._count.workspaces,role,licenseSource:organization.licenseSource,accessExpiresAt:organization.accessExpiresAt?.toISOString()||null,trialEndsAt:organization.trialEndsAt?.toISOString()||null,readOnly:Boolean(organization.readOnlyAt),subscriptionStatus:organization.subscription?.status||null,currentPeriodEnd:organization.subscription?.currentPeriodEnd?.toISOString()||null,cancelAtPeriodEnd:Boolean(organization.subscription?.cancelAtPeriodEnd),hasBillingAccount:Boolean(organization.subscription?.stripeCustomerId)}})}/></main></div>;
}
