import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getTranslator } from "@/lib/i18n/server";
import { AuthShell } from "@/components/AuthShell";
import { AcceptInvite } from "@/components/AuthForms";

export const metadata: Metadata = { robots: { index: false } };

export default async function AcceptInvitePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const token = String(Array.isArray(query.token) ? query.token[0] : query.token || "");
  const user = await getCurrentUser();
  const { t } = await getTranslator(user?.locale);
  const next = `/accept-invite?token=${encodeURIComponent(token)}`;
  if (!token)
    return (
      <AuthShell title={t("invite.invalidTitle")} subtitle={t("invite.invalidBody")}>
        <Link className="btn" href="/">
          {t("nav.home")}
        </Link>
      </AuthShell>
    );
  if (user)
    return (
      <AuthShell title={t("invite.joinTitle")} subtitle={t("invite.signedInAs", { email: user.email })}>
        <AcceptInvite token={token} />
      </AuthShell>
    );
  return (
    <AuthShell title={t("invite.receivedTitle")} subtitle={t("invite.receivedBody")}>
      <div className="stack">
        <Link className="btn primary auth-submit" href={`/register?next=${encodeURIComponent(next)}`}>
          {t("invite.createAccount")}
        </Link>
        <Link className="btn auth-submit" href={`/login?next=${encodeURIComponent(next)}`}>
          {t("invite.signIn")}
        </Link>
      </div>
    </AuthShell>
  );
}
