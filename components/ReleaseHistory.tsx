"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Add an entry only when a user-facing release is ready to ship.
const releases = [
  {
    id: "workspaces-and-list-1",
    it: [
      "Organizza reparti e persone in più workspace con Family, Team e Business.",
      "Riaprendo una task ritrovi il suo stato precedente; le checklist suggerite dall’IA sono riconoscibili e da rivedere.",
      "Completa e riapri le attività direttamente dalla lista.",
      "Trova attività aperte e completate in gruppi distinti.",
      "Piano, consumi e impostazioni dell’app sono nel tuo account.",
    ],
    en: [
      "Organize departments and people in multiple workspaces with Family, Team and Business.",
      "Reopening a task restores its previous state; AI-suggested checklist steps are labeled for review.",
      "Complete and reopen tasks directly from the list.",
      "Find open and completed tasks in separate groups.",
      "Find your plan, usage and app settings in your account.",
    ],
  },
];
const key = (email: string) => `boardcue:release-read:${email}`;

export function ReleaseLink({ locale, email, onClick }: { locale: string; email: string; onClick: () => void }) {
  const [unread, setUnread] = useState(false);
  useEffect(() => {
    const refresh = () => {
      try {
        setUnread(localStorage.getItem(key(email)) !== releases[0].id);
      } catch {
        setUnread(false);
      }
    };
    refresh();
    window.addEventListener("boardcue-release-read", refresh);
    return () => window.removeEventListener("boardcue-release-read", refresh);
  }, [email]);
  return (
    <Link className="menu-item" href="/account#updates" onClick={onClick}>
      {locale === "it" ? "Novità" : "What’s new"}
      {unread && <span aria-label={locale === "it" ? "Novità non lette" : "Unread updates"}> •</span>}
    </Link>
  );
}

export function ReleaseHistory({ locale, email }: { locale: "it" | "en"; email: string }) {
  return (
    <div>
      {releases.map((release, index) => (
        <div key={release.id}>
          <h3>
            {locale === "it" ? (index === 0 ? "Ultime novità" : "Novità precedenti") : index === 0 ? "Latest updates" : "Earlier updates"}
          </h3>
          <ul>
            {release[locale].map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
      <button
        type="button"
        className="btn sm"
        onClick={() => {
          try {
            localStorage.setItem(key(email), releases[0].id);
            window.dispatchEvent(new Event("boardcue-release-read"));
          } catch {}
        }}
      >
        {locale === "it" ? "Segna come lette" : "Mark as read"}
      </button>
    </div>
  );
}
