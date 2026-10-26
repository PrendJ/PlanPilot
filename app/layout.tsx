import type { Metadata, Viewport } from "next";
import { PwaProvider } from "@/components/PwaProvider";
import { CookieNotice } from "@/components/CookieNotice";
import { I18nProvider } from "@/components/I18nProvider";
import { FeedbackProvider } from "@/components/ui";
import { getLocale, getTranslator } from "@/lib/i18n/server";
import "@fontsource-variable/inter";
import "./tokens.css";
import "./ui.css";
import "./board.css";
import "./marketing.css";
import "./admin.css";

const ICON_VERSION = "2";

export async function generateMetadata(): Promise<Metadata> {
  const { t, locale } = await getTranslator();
  return {
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, title: "BoardCue", statusBarStyle: "default" },
    // ?v= busts browser and home-screen caches after a logo change; bump it with the next redesign.
    icons: {
      icon: [
        { url: `/icon.svg?v=${ICON_VERSION}`, type: "image/svg+xml" },
        { url: `/icons/favicon-32.png?v=${ICON_VERSION}`, sizes: "32x32", type: "image/png" },
      ],
      shortcut: `/favicon.ico?v=${ICON_VERSION}`,
      apple: `/icons/apple-touch-icon.png?v=${ICON_VERSION}`,
    },
    metadataBase: new URL(process.env.APP_URL || "https://boardcue.draftapps.it"),
    title: { default: t("meta.title"), template: "%s · BoardCue" },
    description: t("meta.description"),
    // No canonical/hreflang here: a layout value is inherited by every page, so each public page sets its own.
    applicationName: "BoardCue",
    authors: [{ name: "Draftapps", url: "https://draftapps.it" }],
    creator: "Draftapps",
    publisher: "Draftapps",
    category: "productivity",
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
    },
    // Search Console / Bing Webmaster ownership tags, set per environment.
    verification: {
      google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
      other: process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : undefined,
    },
    openGraph: {
      title: t("meta.title"),
      description: t("meta.description"),
      siteName: "BoardCue",
      type: "website",
      locale: locale === "en" ? "en_GB" : "it_IT",
    },
    twitter: { card: "summary_large_image", title: t("meta.title"), description: t("meta.description") },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F6F7F9" },
    { media: "(prefers-color-scheme: dark)", color: "#0D0F14" },
  ],
};

// Runs before paint: saved choice, otherwise the operating system preference.
const themeScript = `(function(){try{var s=localStorage.getItem('theme');var d=s==='dark'||(s!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',function(e){if(!localStorage.getItem('theme'))document.documentElement.dataset.theme=e.matches?'dark':'light';});}catch(e){document.documentElement.dataset.theme='light';}})();`;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  const { t } = await getTranslator();
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <a className="skip-link" href="#main">
          {t("common.skipToContent")}
        </a>
        <I18nProvider locale={locale}>
          <FeedbackProvider>
            <PwaProvider>
              {children}
              <CookieNotice />
            </PwaProvider>
          </FeedbackProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
