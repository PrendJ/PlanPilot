import type { Metadata } from "next";
import "./globals.css";
import "./draftapps-theme.css";

export const metadata: Metadata = {
  title: "VoxBoard AI — Talk. Update. Repeat.",
  description: "AI-first voice-powered planning board. Tell VoxBoard AI what changed and keep your work in sync.",
};

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
      <body>{children}</body>
    </html>
  );
}
