import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PlanPilot — AI-first planning board",
  description: "Tell the plan. PlanPilot keeps the board updated.",
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
