import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, twoFactorRequiredButMissing } from "@/lib/auth";
import { getTranslator } from "@/lib/i18n/server";
import { Topbar } from "@/components/Topbar";
import { IntegrationsPanel } from "@/components/IntegrationsPanel";

export const metadata: Metadata = { title: "Integrazioni", robots: { index: false } };

export default async function IntegrationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/app/integrations");
  if (await twoFactorRequiredButMissing(user)) redirect("/account?require2fa=1#security");
  const { t } = await getTranslator(user.locale);
  return (
    <div className="shell">
      <Topbar />
      <main id="main" className="grid-page wide">
        <div className="page-head">
          <div>
            <h1>{t("integrations.title")}</h1>
            <p>{t("integrations.subtitle")}</p>
          </div>
        </div>
        <IntegrationsPanel />
      </main>
    </div>
  );
}
