"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { useI18n, useT } from "./I18nProvider";
import { api, Avatar, Dialog, MenuButton } from "./ui";
import { LOCALE_COOKIE } from "@/lib/i18n/core";

type ThemeChoice = "system" | "light" | "dark";

function readTheme(): ThemeChoice {
  try {
    const saved = localStorage.getItem("theme");
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(choice: ThemeChoice) {
  try {
    if (choice === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", choice);
  } catch {
    /* private mode */
  }
  const dark = choice === "dark" || (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export function ThemeMenu() {
  const t = useT();
  const [theme, setTheme] = useState<ThemeChoice>("system");
  useEffect(() => {
    setTheme(readTheme());
  }, []);
  const icon = theme === "dark" ? "moon" : theme === "light" ? "sun" : "monitor";
  return (
    <MenuButton label={t("theme.label")} icon={icon}>
      {close =>
        (["system", "light", "dark"] as const).map(choice => (
          <button
            key={choice}
            type="button"
            role="menuitemradio"
            aria-checked={theme === choice}
            className="menu-item"
            onClick={() => {
              applyTheme(choice);
              setTheme(choice);
              close();
            }}
          >
            <Icon name={choice === "dark" ? "moon" : choice === "light" ? "sun" : "monitor"} />
            {t(`theme.${choice}`)}
          </button>
        ))
      }
    </MenuButton>
  );
}

export function LanguageSwitch({ signedIn = false }: { signedIn?: boolean }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  async function choose(next: "it" | "en") {
    if (signedIn) await api("/api/account/preferences", { method: "PATCH", json: { locale: next } });
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${365 * 86400}; samesite=lax`;
    router.refresh();
  }
  return (
    <MenuButton label={t("language.label")} icon="globe">
      {close =>
        (["it", "en"] as const).map(code => (
          <button
            key={code}
            type="button"
            role="menuitemradio"
            aria-checked={locale === code}
            className="menu-item"
            onClick={() => {
              close();
              void choose(code);
            }}
          >
            {code === "it" ? "Italiano" : "English"}
          </button>
        ))
      }
    </MenuButton>
  );
}

export function TeamSwitcher({
  current,
  teams,
}: {
  current: string | null;
  teams: Array<{ id: string; name: string; plan: string; role: string }>;
}) {
  const t = useT();
  const router = useRouter();
  const active = teams.find(team => team.id === current) || teams[0];
  if (!active) return null;
  async function select(id: string) {
    await api("/api/account/preferences", { method: "PATCH", json: { defaultOrganizationId: id } });
    router.push("/app");
    router.refresh();
  }
  return (
    <MenuButton
      label={t("team.switch")}
      align="left"
      className="btn ghost team-switch"
      buttonContent={
        <>
          <span className="team-switch-name">{active.name}</span>
          <Icon name="chevronDown" size={16} />
        </>
      }
    >
      {close => (
        <>
          <div className="menu-label">{t("team.yourTeams")}</div>
          {teams.map(team => (
            <button
              key={team.id}
              type="button"
              role="menuitemradio"
              aria-checked={team.id === active.id}
              className="menu-item"
              onClick={() => {
                close();
                if (team.id !== active.id) void select(team.id);
              }}
            >
              <span>{team.name}</span>
              <small>{t(`plans.${team.plan}`)}</small>
            </button>
          ))}
          <div className="menu-sep" />
          <Link className="menu-item" href="/account#teams" onClick={close}>
            <Icon name="settings" />
            {t("team.manage")}
          </Link>
        </>
      )}
    </MenuButton>
  );
}

type SearchResult = { id: string; title: string; column: string; board: string; slug: string };

export function SearchButton() {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      const response = await api<{ results: SearchResult[] }>(`/api/search?q=${encodeURIComponent(query.trim())}`);
      setResults(response.ok ? response.data.results : []);
      setLoading(false);
    }, 220);
    return () => clearTimeout(timer);
  }, [query]);
  return (
    <>
      <button
        type="button"
        className="icon-btn"
        aria-label={t("search.open")}
        title={`${t("search.open")} (Ctrl+K)`}
        onClick={() => setOpen(true)}
      >
        <Icon name="search" />
      </button>
      {open && (
        <Dialog
          title={t("search.title")}
          onClose={() => {
            setOpen(false);
            setQuery("");
          }}
        >
          <input
            type="search"
            data-autofocus
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={t("search.placeholder")}
            aria-label={t("search.placeholder")}
          />
          <div className="search-results" aria-live="polite">
            {loading && <p className="subtle">{t("common.loading")}</p>}
            {!loading && query.trim().length >= 2 && !results.length && <p className="subtle">{t("search.empty")}</p>}
            {results.map(result => (
              <button
                key={result.id}
                type="button"
                className="menu-item"
                onClick={() => {
                  setOpen(false);
                  router.push(`/app/${result.slug}?card=${result.id}`);
                }}
              >
                <Icon name="file" />
                <span>
                  <strong>{result.title}</strong>
                  <br />
                  <small className="subtle">
                    {result.board} · {result.column}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </Dialog>
      )}
    </>
  );
}

type NotificationItem = {
  id: string;
  type: string;
  payload: { cardTitle?: string; boardName?: string; boardSlug?: string; excerpt?: string };
  cardId: string | null;
  readAt: string | null;
  createdAt: string;
  actorName: string | null;
};

export function NotificationsBell() {
  const t = useT();
  const { tag } = useI18n();
  const router = useRouter();
  const [data, setData] = useState<{ unread: number; items: NotificationItem[] }>({ unread: 0, items: [] });
  const load = useCallback(async () => {
    const response = await api<{ unread: number; items: NotificationItem[] }>("/api/notifications");
    if (response.ok) setData(response.data);
  }, []);
  useEffect(() => {
    void load();
    const timer = setInterval(load, 60_000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);
  async function openItem(item: NotificationItem) {
    if (!item.readAt) await api("/api/notifications", { method: "PATCH", json: { ids: [item.id] } });
    void load();
    if (item.payload.boardSlug) router.push(`/app/${item.payload.boardSlug}${item.cardId ? `?card=${item.cardId}` : ""}`);
  }
  const line = (item: NotificationItem) =>
    t(`notifications.${item.type}`, { actor: item.actorName || t("notifications.someone"), card: item.payload.cardTitle || "" });
  return (
    <MenuButton
      label={data.unread ? t("notifications.unread", { count: data.unread }) : t("notifications.title")}
      buttonContent={
        <>
          <Icon name="bell" />
          {data.unread > 0 && <span className="dot">{data.unread > 9 ? "9+" : data.unread}</span>}
        </>
      }
    >
      {close => (
        <>
          <div className="menu-head row">
            <strong>{t("notifications.title")}</strong>
            <span className="spacer" />
            {data.unread > 0 && (
              <button
                type="button"
                className="text-button"
                onClick={async () => {
                  await api("/api/notifications", { method: "PATCH", json: { all: true } });
                  void load();
                }}
              >
                {t("notifications.markAll")}
              </button>
            )}
          </div>
          <div className="notification-list">
            {!data.items.length && <p className="subtle menu-head">{t("notifications.empty")}</p>}
            {data.items.map(item => (
              <button
                key={item.id}
                type="button"
                className={`menu-item notification ${item.readAt ? "" : "unread"}`}
                onClick={() => {
                  close();
                  void openItem(item);
                }}
              >
                <span>
                  <span className="notification-line">{line(item)}</span>
                  <small className="subtle">
                    {item.payload.boardName} ·{" "}
                    {new Date(item.createdAt).toLocaleString(tag, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </MenuButton>
  );
}

export function UserMenu({ name, email, isAdmin }: { name: string; email: string; isAdmin: boolean }) {
  const t = useT();
  const { locale } = useI18n();
  const router = useRouter();
  const [theme, setTheme] = useState<ThemeChoice>("system");
  useEffect(() => {
    setTheme(readTheme());
  }, []);
  async function logout() {
    await api("/api/auth/logout", { method: "POST", json: {} });
    router.push("/");
    router.refresh();
  }
  async function language(next: "it" | "en") {
    await api("/api/account/preferences", { method: "PATCH", json: { locale: next } });
    router.refresh();
  }
  return (
    <MenuButton label={t("nav.accountMenu")} className="icon-btn avatar-btn" buttonContent={<Avatar name={name} />}>
      {close => (
        <>
          <div className="menu-head">
            <strong>{name}</strong>
            <span>{email}</span>
          </div>
          <div className="menu-sep" />
          <Link className="menu-item" href="/app" onClick={close}>
            <Icon name="kanban" />
            {t("nav.boards")}
          </Link>
          <Link className="menu-item" href="/account" onClick={close}>
            <Icon name="user" />
            {t("nav.account")}
          </Link>
          <Link className="menu-item" href="/account#security" onClick={close}>
            <Icon name="shield" />
            {t("nav.security")}
          </Link>
          <Link className="menu-item" href="/account#teams" onClick={close}>
            <Icon name="card" />
            {t("nav.billing")}
          </Link>
          {isAdmin && (
            <Link className="menu-item" href="/admin" onClick={close}>
              <Icon name="activity" />
              {t("nav.backoffice")}
            </Link>
          )}
          <div className="menu-sep" />
          <div className="menu-label">{t("theme.label")}</div>
          <div className="menu-head">
            <div className="segmented" role="group" aria-label={t("theme.label")}>
              {(["system", "light", "dark"] as const).map(choice => (
                <button
                  key={choice}
                  type="button"
                  aria-pressed={theme === choice}
                  onClick={() => {
                    applyTheme(choice);
                    setTheme(choice);
                  }}
                >
                  {t(`theme.${choice}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="menu-label">{t("language.label")}</div>
          <div className="menu-head">
            <div className="segmented" role="group" aria-label={t("language.label")}>
              {(["it", "en"] as const).map(code => (
                <button key={code} type="button" aria-pressed={locale === code} onClick={() => void language(code)}>
                  {code.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div className="menu-sep" />
          <button
            type="button"
            className="menu-item"
            onClick={() => {
              close();
              void logout();
            }}
          >
            <Icon name="logout" />
            {t("nav.logout")}
          </button>
        </>
      )}
    </MenuButton>
  );
}

export function VerifyBanner({ email }: { email: string }) {
  const t = useT();
  const [state, setState] = useState<"idle" | "sent" | "error">("idle");
  const busy = useRef(false);
  async function resend() {
    if (busy.current) return;
    busy.current = true;
    const response = await api("/api/auth/resend-verification", { method: "POST", json: { email } });
    setState(response.ok ? "sent" : "error");
    busy.current = false;
  }
  return (
    <div className="app-banner" role="status">
      <Icon name="mail" size={16} />
      <span>{t("verify.banner", { email })}</span>
      {state === "idle" && (
        <button type="button" className="text-button" onClick={resend}>
          {t("verify.resend")}
        </button>
      )}
      {state === "sent" && <strong>{t("verify.sent")}</strong>}
      {state === "error" && <strong>{t("errors.SERVER_ERROR")}</strong>}
    </div>
  );
}
