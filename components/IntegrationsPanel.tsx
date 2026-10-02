"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "./I18nProvider";
import { api, useFeedback } from "./ui";

type TelegramStatus = { configured: boolean; connected: boolean };
type CalendarStatus = { connected: boolean; timeZone: string | null };

/** How to send a board's events to a Slack channel; shared with the board settings. */
export function SlackSteps() {
  const { t } = useI18n();
  return (
    <ol className="integration-steps">
      <li>
        {t("integrations.slackStep1")}{" "}
        <a className="text-link" href="https://api.slack.com/messaging/webhooks" target="_blank" rel="noreferrer">
          {t("integrations.slackGuide")}
        </a>
      </li>
      <li>{t("integrations.slackStep2")}</li>
      <li>{t("integrations.slackStep3")}</li>
      <li>{t("integrations.slackStep4")}</li>
    </ol>
  );
}

export function IntegrationsPanel() {
  const { t } = useI18n();
  const { toast } = useFeedback();
  const [telegram, setTelegram] = useState<TelegramStatus | null>(null);
  const [calendar, setCalendar] = useState<CalendarStatus | null>(null);
  const [telegramUrl, setTelegramUrl] = useState("");
  const [calendarUrl, setCalendarUrl] = useState("");
  const [webcalUrl, setWebcalUrl] = useState("");
  const [busy, setBusy] = useState("");

  async function refresh() {
    const [tg, cal] = await Promise.all([
      api<TelegramStatus>("/api/integrations/telegram"),
      api<CalendarStatus>("/api/integrations/calendar"),
    ]);
    if (tg.ok) setTelegram(tg.data);
    if (cal.ok) setCalendar(cal.data);
  }
  useEffect(() => {
    void refresh();
  }, []);

  async function linkTelegram() {
    setBusy("telegram");
    const response = await api<{ url: string }>("/api/integrations/telegram", { method: "POST" });
    setBusy("");
    if (response.ok) setTelegramUrl(response.data.url);
    else toast({ message: response.data.error || t("errors.SERVER_ERROR"), tone: "error" });
  }

  async function unlinkTelegram() {
    setBusy("telegram");
    const response = await api("/api/integrations/telegram", { method: "DELETE" });
    setBusy("");
    if (response.ok) {
      setTelegramUrl("");
      void refresh();
    } else toast({ message: response.data.error || t("errors.SERVER_ERROR"), tone: "error" });
  }

  async function createFeed() {
    setBusy("calendar");
    const response = await api<{ url: string; webcalUrl: string }>("/api/integrations/calendar", {
      method: "POST",
      json: { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Rome" },
    });
    setBusy("");
    if (response.ok) {
      setCalendarUrl(response.data.url);
      setWebcalUrl(response.data.webcalUrl);
      void refresh();
    } else toast({ message: response.data.error || t("errors.SERVER_ERROR"), tone: "error" });
  }

  async function revokeFeed() {
    setBusy("calendar");
    const response = await api("/api/integrations/calendar", { method: "DELETE" });
    setBusy("");
    if (response.ok) {
      setCalendarUrl("");
      setWebcalUrl("");
      void refresh();
    } else toast({ message: response.data.error || t("errors.SERVER_ERROR"), tone: "error" });
  }

  return (
    <div className="stack" style={{ gap: 18 }}>
      <section className="panel stack">
        <h2>{t("integrations.telegramTitle")}</h2>
        <p className="subtle">{t("integrations.telegramBody")}</p>
        <p>
          {telegram?.connected
            ? t("integrations.connected")
            : telegram?.configured
              ? t("integrations.notConnected")
              : t("integrations.telegramUnavailable")}
        </p>
        <div className="row">
          {telegram?.configured && (
            <button type="button" className="btn primary" disabled={Boolean(busy)} onClick={() => void linkTelegram()}>
              {busy === "telegram"
                ? t("common.loading")
                : telegram.connected
                  ? t("integrations.newTelegramLink")
                  : t("integrations.connectTelegram")}
            </button>
          )}
          {telegram?.connected && (
            <button type="button" className="btn" disabled={Boolean(busy)} onClick={() => void unlinkTelegram()}>
              {t("integrations.disconnect")}
            </button>
          )}
          <button type="button" className="btn" onClick={() => void refresh()}>
            {t("integrations.refresh")}
          </button>
        </div>
        {telegramUrl && (
          <p>
            <a className="btn" href={telegramUrl} target="_blank" rel="noopener noreferrer">
              {t("integrations.openTelegram")}
            </a>{" "}
            <span className="subtle">{t("integrations.telegramLinkExpires")}</span>
          </p>
        )}
      </section>
      <section className="panel stack">
        <h2>{t("integrations.calendarTitle")}</h2>
        <p className="subtle">{t("integrations.calendarBody")}</p>
        <p>
          {calendar?.connected
            ? t("integrations.calendarActive", { timeZone: calendar.timeZone || "Europe/Rome" })
            : t("integrations.calendarInactive")}
        </p>
        <div className="row">
          <button type="button" className="btn primary" disabled={Boolean(busy)} onClick={() => void createFeed()}>
            {busy === "calendar"
              ? t("common.loading")
              : calendar?.connected
                ? t("integrations.regenerateFeed")
                : t("integrations.createFeed")}
          </button>
          {calendar?.connected && (
            <button type="button" className="btn" disabled={Boolean(busy)} onClick={() => void revokeFeed()}>
              {t("integrations.revokeFeed")}
            </button>
          )}
        </div>
        {calendarUrl && (
          <div className="stack">
            <p className="subtle">{t("integrations.feedSecret")}</p>
            <input readOnly value={calendarUrl} aria-label={t("integrations.feedUrl")} onFocus={event => event.target.select()} />
            <div className="row">
              <button
                type="button"
                className="btn"
                onClick={() => void navigator.clipboard.writeText(calendarUrl).then(() => toast({ message: t("common.copied") }))}
              >
                {t("common.copy")}
              </button>
              <a className="btn" href={webcalUrl}>
                {t("integrations.openApple")}
              </a>
              <a
                className="btn"
                href="https://calendar.google.com/calendar/u/0/r/settings/addbyurl"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("integrations.openGoogle")}
              </a>
            </div>
          </div>
        )}
        <p className="subtle">{t("integrations.calendarInstructions")}</p>
      </section>
      <section className="panel stack">
        <h2>{t("integrations.slackTitle")}</h2>
        <p className="subtle">{t("integrations.slackBody")}</p>
        <SlackSteps />
        <p className="subtle">{t("integrations.slackNote")}</p>
      </section>
      <section className="panel stack">
        <h2>{t("integrations.mobileTitle")}</h2>
        <p className="subtle">{t("integrations.mobileBody")}</p>
        <Link href="/app/quick" className="btn">
          {t("integrations.openQuick")}
        </Link>
      </section>
    </div>
  );
}
