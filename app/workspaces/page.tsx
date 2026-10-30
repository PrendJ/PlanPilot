import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, twoFactorRequiredButMissing } from "@/lib/auth";
import { ensureActiveOrganization } from "@/lib/default-organization";
import { Topbar } from "@/components/Topbar";
import { SpacesManager } from "@/components/SpacesManager";

export const metadata: Metadata = { title: "Workspace", robots: { index: false } };

export default async function WorkspacesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (await twoFactorRequiredButMissing(user)) redirect("/account?require2fa=1#security");
  const organization = await ensureActiveOrganization(user.id);
  return (
    <div className="shell">
      <Topbar />
      <main id="main" className="grid-page wide">
        <div className="page-head">
          <div>
            <h1>Workspace</h1>
            <p>{organization.name}</p>
          </div>
        </div>
        <SpacesManager organizationId={organization.id} />
      </main>
    </div>
  );
}
