import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { safeNextPath } from "@/lib/navigation";
import { getTranslator } from "@/lib/i18n/server";
import { pendingTwoFactor } from "@/lib/two-factor";
import { AuthShell } from "@/components/AuthShell";
import { LoginForm } from "@/components/AuthForms";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: { absolute: t("auth.login.title") } };
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const value = (key: string) => (Array.isArray(query[key]) ? query[key]![0] : query[key]);
  const next = safeNextPath(value("next"), "/app");
  if (await getCurrentUser()) redirect(next);
  const { t } = await getTranslator();
  const notice =
    value("verified") === "1"
      ? { tone: "success" as const, message: t("auth.notices.verified") }
      : value("verified") === "invalid"
        ? { tone: "error" as const, message: t("auth.notices.verifyInvalid") }
        : value("reset") === "1"
          ? { tone: "success" as const, message: t("auth.notices.reset") }
          : value("magic") === "invalid"
            ? { tone: "error" as const, message: t("auth.notices.magicInvalid") }
            : undefined;
  const twoFactor = value("twofactor") === "1" && (await pendingTwoFactor());
  return (
    <AuthShell
      title={t("auth.login.title")}
      subtitle={t("auth.login.subtitle")}
      footer={
        <>
          {t("auth.login.noAccount")}{" "}
          <Link href={`/register${next !== "/app" ? `?next=${encodeURIComponent(next)}` : ""}`}>{t("auth.login.createAccount")}</Link>
        </>
      }
    >
      <LoginForm next={next} notice={notice} twoFactorPending={twoFactor} />
    </AuthShell>
  );
}
