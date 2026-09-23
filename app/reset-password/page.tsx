import type { Metadata } from "next";
import { getTranslator } from "@/lib/i18n/server";
import { AuthShell } from "@/components/AuthShell";
import { ResetForm } from "@/components/AuthForms";

export const metadata: Metadata = { robots: { index: false } };

export default async function ResetPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const token = String(Array.isArray(query.token) ? query.token[0] : query.token || "");
  const { t } = await getTranslator();
  return (
    <AuthShell title={t("auth.reset.title")} subtitle={t("auth.reset.subtitle")}>
      <ResetForm token={token} />
    </AuthShell>
  );
}
