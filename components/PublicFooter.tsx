import Link from "next/link";
import { getTranslator } from "@/lib/i18n/server";
import { BrandMark } from "./Brand";

/**
 * Italian law requires company name and VAT number on commercial websites: configure LEGAL_ENTITY_NAME,
 * LEGAL_VAT_NUMBER and LEGAL_ADDRESS (plus optional LEGAL_PEC / CONTACT_EMAIL) in the environment.
 */
export async function PublicFooter() {
  const { t } = await getTranslator();
  const entity = process.env.LEGAL_ENTITY_NAME;
  const vat = process.env.LEGAL_VAT_NUMBER;
  const address = process.env.LEGAL_ADDRESS;
  const contact = process.env.CONTACT_EMAIL;
  return (
    <footer className="public-footer">
      <div className="public-footer-inner">
        <div>
          <span className="row" style={{ gap: 8 }}>
            <BrandMark size={20} />
            <strong>BoardCue</strong>
          </span>
          <span className="legal-entity">
            {entity ? `${entity}${vat ? ` · P.IVA ${vat}` : ""}${address ? ` · ${address}` : ""}` : t("footer.tagline")}
          </span>
        </div>
        <nav aria-label={t("footer.nav")}>
          <Link href="/demo">{t("nav.demo")}</Link>
          <Link href="/pricing">{t("nav.pricing")}</Link>
          <Link href="/privacy">{t("legal.privacy")}</Link>
          <Link href="/cookies">{t("legal.cookies")}</Link>
          <Link href="/terms">{t("legal.terms")}</Link>
          <Link href="/subprocessors">{t("legal.subprocessors")}</Link>
          <Link href="/ai-literacy">{t("legal.aiGuide")}</Link>
          <Link href="/" hrefLang="it">
            Italiano
          </Link>
          <Link href="/en" hrefLang="en">
            English
          </Link>
          <a
            href={contact ? `mailto:${contact}` : "https://draftapps.it/#contatti"}
            target={contact ? undefined : "_blank"}
            rel="noreferrer"
          >
            {t("footer.contact")}
          </a>
        </nav>
      </div>
    </footer>
  );
}
