import type { Metadata, Viewport } from "next";
import { PwaProvider } from "@/components/PwaProvider";
import "./globals.css";
import "./draftapps-theme.css";
import "./marketing.css";
import "./pwa.css";
import { CookieNotice } from "@/components/CookieNotice";

export const metadata: Metadata = {
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "BoardCue", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
  metadataBase: new URL("https://boardcue.draftapps.it"),
  title: "BoardCue AI — Talk. Update. Repeat.",
  description: "AI-first voice-powered planning board. Tell BoardCue AI what changed and keep your work in sync.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "BoardCue AI — Talk. Update. Repeat.",
    description: "Parla o scrivi un aggiornamento: l’AI capisce cosa è cambiato e mantiene la board sincronizzata.",
    url: "https://boardcue.draftapps.it",
    siteName: "BoardCue AI",
    type: "website",
  },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#101827" };

const themeScript = `
(function(){
  try {
    var saved = localStorage.getItem('theme');
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = saved || (prefersDark ? 'dark' : 'light');
  } catch (e) {
    document.documentElement.dataset.theme = 'dark';
  }
})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it" data-theme="dark" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>
        <PwaProvider>{children}<CookieNotice /></PwaProvider>
      </body>
    </html>
  );
}
