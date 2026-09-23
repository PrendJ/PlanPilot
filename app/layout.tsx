import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { PwaProvider } from "@/components/PwaProvider";
import { CookieNotice } from "@/components/CookieNotice";
import { I18nProvider } from "@/components/I18nProvider";
import { FeedbackProvider } from "@/components/ui";
import { getLocale, getTranslator } from "@/lib/i18n/server";
import "./tokens.css";
import "./ui.css";
import "./board.css";
import "./marketing.css";
import "./admin.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t, locale } = await getTranslator();
  return {
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, title: "BoardCue", statusBarStyle: "default" },
    icons: { icon: "/icon.svg", apple: "/icons/apple-touch-icon.png" },
    metadataBase: new URL(process.env.APP_URL || "https://boardcue.draftapps.it"),
    title: { default: t("meta.title"), template: "%s · BoardCue" },
    description: t("meta.description"),
    alternates: { canonical: "/", languages: { "it-IT": "/", "en-GB": "/en" } },
    openGraph: {
      title: t("meta.title"),
      description: t("meta.description"),
      siteName: "BoardCue",
      type: "website",
      locale: locale === "en" ? "en_GB" : "it_IT",
    },
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
    <html lang={locale} className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
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
