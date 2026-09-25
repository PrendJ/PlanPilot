import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getTranslator } from "@/lib/i18n/server";
import { PLANS, SELLABLE_PLAN_KEYS, TRIAL_DAYS, planPriceCents } from "@/lib/plans";
import { Topbar } from "@/components/Topbar";
import { PublicFooter } from "@/components/PublicFooter";
import { Icon, type IconName } from "@/components/Icon";

/** Static, animated illustration of the loop (CSS only): voice → proposal → the card moves. */
function LoopPreview({ t }: { t: (key: string) => string }) {
  return (
    <div className="loop-preview" aria-hidden="true">
      <div className="loop-bubble">
        <span className="loop-mic">
          <Icon name="mic" size={16} />
        </span>
        <span>{t("landing.preview.quote")}</span>
      </div>
      <div className="loop-proposal">
        <Icon name="sparkles" size={14} />
        <span>{t("landing.preview.proposal")}</span>
        <span className="loop-apply">{t("landing.preview.apply")}</span>
      </div>
      <div className="loop-board">
        {(["todo", "doing", "done"] as const).map(lane => (
          <div key={lane} className={`loop-lane lane-${lane}`}>
            <span className="loop-lane-title">{t(`landing.preview.${lane}`)}</span>
            <span className="loop-card static">{t(`landing.preview.card.${lane}`)}</span>
            {lane === "doing" && <span className="loop-card moving">{t("landing.preview.card.moving")}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function Home() {
  const user = await getCurrentUser();
  const { t } = await getTranslator(user?.locale);
  const steps: Array<{ icon: IconName; key: string }> = [
    { icon: "mic", key: "speak" },
    { icon: "eye", key: "review" },
    { icon: "check", key: "apply" },
  ];
  const features: Array<{ icon: IconName; key: string }> = [
    { icon: "mic", key: "dictation" },
    { icon: "undo", key: "preview" },
    { icon: "users", key: "realtime" },
    { icon: "message", key: "comments" },
    { icon: "calendar", key: "views" },
    { icon: "upload", key: "import" },
  ];
  const personas: Array<{ icon: IconName; key: string }> = [
    { icon: "users", key: "agency" },
    { icon: "phone", key: "field" },
    { icon: "user", key: "freelance" },
  ];
  const trust: Array<{ icon: IconName; key: string }> = [
    { icon: "globe", key: "eu" },
    { icon: "lock", key: "retention" },
    { icon: "shield", key: "twofa" },
    { icon: "download", key: "export" },
  ];
  return (
    <div className="shell">
      <Topbar />
      <main id="main" className="marketing">
        <section className="hero container">
          <div className="hero-copy">
            <span className="eyebrow badge signal">
              <Icon name="sparkles" size={13} />
              {t("landing.eyebrow")}
            </span>
            <h1>{t("landing.title")}</h1>
            <p className="lead">{t("landing.lead")}</p>
            <div className="row hero-actions">
              <Link className="btn primary lg" href={user ? "/app" : "/demo"}>
                {user ? t("landing.openBoards") : t("landing.tryDemo")}
              </Link>
              <Link className="btn lg" href={user ? "/demo" : "/register"}>
                <Icon name="arrowRight" size={16} />
                {user ? t("landing.tryDemo") : t("pricing.startTrial", { days: TRIAL_DAYS })}
              </Link>
            </div>
            <p className="subtle">{t("landing.fineprint")}</p>
          </div>
          <LoopPreview t={t} />
        </section>

        <section id="come-funziona" className="section container">
          <div className="section-heading">
            <span className="eyebrow">{t("landing.how.eyebrow")}</span>
            <h2>{t("landing.how.title")}</h2>
            <p>{t("landing.how.body")}</p>
          </div>
          <ol className="steps">
            {steps.map((step, index) => (
              <li key={step.key} className="panel">
                <span className="step-num">{index + 1}</span>
                <Icon name={step.icon} size={20} />
                <h3>{t(`landing.how.${step.key}.title`)}</h3>
                <p className="subtle">{t(`landing.how.${step.key}.body`)}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="section container">
          <div className="section-heading">
            <span className="eyebrow">{t("landing.who.eyebrow")}</span>
            <h2>{t("landing.who.title")}</h2>
          </div>
          <div className="persona-grid">
            {personas.map(persona => (
              <article key={persona.key} className="panel">
                <Icon name={persona.icon} size={22} />
                <h3>{t(`landing.who.${persona.key}.title`)}</h3>
                <p className="subtle">{t(`landing.who.${persona.key}.body`)}</p>
                <p className="persona-quote">“{t(`landing.who.${persona.key}.quote`)}”</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section container">
          <div className="section-heading">
            <span className="eyebrow">{t("landing.features.eyebrow")}</span>
            <h2>{t("landing.features.title")}</h2>
          </div>
          <div className="feature-grid">
            {features.map(feature => (
              <article key={feature.key} className="feature">
                <span className="feature-icon">
                  <Icon name={feature.icon} size={18} />
                </span>
                <div>
                  <h3>{t(`landing.features.${feature.key}.title`)}</h3>
                  <p className="subtle">{t(`landing.features.${feature.key}.body`)}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="section container trust-band">
          <div className="section-heading">
            <span className="eyebrow">{t("landing.trust.eyebrow")}</span>
            <h2>{t("landing.trust.title")}</h2>
            <p>{t("landing.trust.body")}</p>
          </div>
          <div className="trust-grid">
            {trust.map(item => (
              <div key={item.key} className="trust-item">
                <Icon name={item.icon} size={18} />
                <div>
                  <strong>{t(`landing.trust.${item.key}.title`)}</strong>
                  <p className="subtle">{t(`landing.trust.${item.key}.body`)}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="subtle">
            <Link className="text-link" href="/privacy">
              {t("legal.privacy")}
            </Link>{" "}
            ·{" "}
            <Link className="text-link" href="/subprocessors">
              {t("legal.subprocessors")}
            </Link>
          </p>
        </section>

        <section className="section container">
          <div className="section-heading centered">
            <span className="eyebrow">{t("nav.pricing")}</span>
            <h2>{t("landing.pricing.title")}</h2>
            <p>{t("landing.pricing.body", { days: TRIAL_DAYS })}</p>
          </div>
          <div className="pricing-teaser">
            {SELLABLE_PLAN_KEYS.map(key => (
              <Link key={key} href={`/pricing?plan=${key}`} className="panel">
                <strong>{t(`plans.${key}`)}</strong>
                <span className="price-inline">
                  €{PLANS[key].priceEur}
                  <small>{PLANS[key].seatBased ? t("pricing.perSeatMonth") : t("pricing.perMonth")}</small>
                </span>
                <span className="subtle">{t(`pricing.audience.${key}`)}</span>
              </Link>
            ))}
          </div>
          <p className="subtle" style={{ textAlign: "center", marginTop: 12 }}>
            {t("landing.pricing.vatNote", {
              pro: (planPriceCents("PRO", "month", "consumer") / 100).toFixed(2).replace(".", ","),
              team: (planPriceCents("TEAM", "month", "consumer") / 100).toFixed(2).replace(".", ","),
              business: (planPriceCents("BUSINESS", "month", "consumer") / 100).toFixed(2).replace(".", ","),
            })}
          </p>
        </section>

        <section className="section container faq">
          <h2>{t("faq.title")}</h2>
          {(["update", "dictation", "privacy", "trial", "frozen", "languages"] as const).map(key => (
            <details key={key}>
              <summary>{t(`faq.${key}.q`)}</summary>
              <p>{t(`faq.${key}.a`, { days: TRIAL_DAYS })}</p>
            </details>
          ))}
        </section>

        <section className="final-cta container">
          <h2>{t("landing.final.title")}</h2>
          <p>{t("landing.final.body")}</p>
          <div className="row" style={{ justifyContent: "center" }}>
            <Link className="btn primary lg" href={user ? "/app" : "/demo"}>
              {user ? t("landing.openBoards") : t("landing.tryDemo")}
            </Link>
            <Link className="btn lg" href={user ? "/demo" : "/register"}>
              {user ? t("landing.tryDemo") : t("pricing.startTrial", { days: TRIAL_DAYS })}
            </Link>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
