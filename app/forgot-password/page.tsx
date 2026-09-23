import type { Metadata } from "next";
import Link from "next/link";
import { getTranslator } from "@/lib/i18n/server";
import { AuthShell } from "@/components/AuthShell";
import { ForgotForm } from "@/components/AuthForms";

export const metadata: Metadata = { robots: { index: false } };

export default async function ForgotPage() {
  const { t } = await getTranslator();
  return (
    <AuthShell
      title={t("auth.forgot.title")}
      subtitle={t("auth.forgot.subtitle")}
      footer={<Link href="/login">{t("auth.backToLogin")}</Link>}
    >
      <ForgotForm />
    </AuthShell>
  );
}
