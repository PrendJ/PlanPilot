import type { Metadata } from "next";
import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { DemoBoard } from "@/components/DemoBoard";
import { PublicFooter } from "@/components/PublicFooter";
import { getTranslator } from "@/lib/i18n/server";
import { TRIAL_DAYS } from "@/lib/plans";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("demo.title"), description: t("demo.subtitle"), alternates: { canonical: "/demo" } };
}

export default async function DemoPage() {
  const { t } = await getTranslator();
  return (
    <div className="shell">
      <Topbar />
      <main id="main" className="board-page container" style={{ paddingTop: 28 }}>
        <div className="page-head" style={{ marginBottom: 4 }}>
          <div>
            <span className="eyebrow">{t("demo.eyebrow")}</span>
            <h1>{t("demo.title")}</h1>
            <p>{t("demo.subtitle")}</p>
          </div>
          <Link className="btn primary" href="/register">
            {t("pricing.startTrial", { days: TRIAL_DAYS })}
          </Link>
        </div>
        <DemoBoard />
        <section className="demo-cta panel">
          <div>
            <h2>{t("demo.ctaTitle")}</h2>
            <p className="subtle">{t("demo.ctaBody")}</p>
          </div>
          <div className="row">
            <Link className="btn primary" href="/register">
              {t("pricing.startTrial", { days: TRIAL_DAYS })}
            </Link>
            <Link className="btn" href="/pricing">
              {t("nav.pricing")}
            </Link>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
