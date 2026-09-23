import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { safeNextPath } from "@/lib/navigation";
import { getTranslator } from "@/lib/i18n/server";
import { AuthShell } from "@/components/AuthShell";
import { RegisterForm } from "@/components/AuthForms";
import { TRIAL_DAYS } from "@/lib/plans";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: { absolute: `${t("auth.register.title")} · BoardCue` }, description: t("auth.register.subtitle", { days: TRIAL_DAYS }) };
}

const BOARD_LANGUAGES = ["it", "en", "de", "fr", "es", "ru", "pl"];

export default async function RegisterPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const value = (key: string) => (Array.isArray(query[key]) ? query[key]![0] : query[key]);
  const plan = value("plan");
  const fallback = plan ? `/pricing?plan=${encodeURIComponent(plan)}` : "/app";
  const next = safeNextPath(value("next"), fallback);
  if (await getCurrentUser()) redirect(next);
  const { t, locale } = await getTranslator();
  // The first board speaks the visitor's language when we support it (7 board languages).
  const browser = (await headers())
    .get("accept-language")
    ?.split(",")
    .map(part => part.slice(0, 2).toLowerCase())
    .find(code => BOARD_LANGUAGES.includes(code));
  return (
    <AuthShell
      title={t("auth.register.title")}
      subtitle={t("auth.register.subtitle", { days: TRIAL_DAYS })}
      footer={
        <>
          {t("auth.register.haveAccount")}{" "}
          <Link href={`/login${next !== "/app" ? `?next=${encodeURIComponent(next)}` : ""}`}>{t("auth.login.submit")}</Link>
        </>
      }
    >
      <RegisterForm next={next} referral={value("ref")} defaultLocale={browser || locale} />
    </AuthShell>
  );
}
