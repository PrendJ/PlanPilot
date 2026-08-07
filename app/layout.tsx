import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PlanPilot — AI-first planning board",
  description: "Tell the plan. PlanPilot keeps the board updated.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
