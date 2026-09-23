"use client";

import { useState } from "react";
import { useI18n } from "./I18nProvider";
import { api } from "./ui";

/** Enterprise contact form (from 25 people). */
export function EnterpriseForm() {
  const { t } = useI18n();
  const [state, setState] = useState<{ ok?: string; error?: string; bookingUrl?: string }>({});
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setState({});
    const response = await api<{ bookingUrl?: string }>("/api/sales/enterprise", {
      method: "POST",
      json: Object.fromEntries(new FormData(form).entries()),
    });
    setBusy(false);
    if (!response.ok) {
      setState({ error: response.data.error || t("errors.SERVER_ERROR") });
      return;
    }
    setState({ ok: t("pricing.enterprise.sent"), bookingUrl: response.data.bookingUrl });
    form.reset();
  }
  return (
    <form className="panel stack" onSubmit={submit}>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="ent-name">{t("pricing.enterprise.name")}</label>
          <input id="ent-name" name="name" autoComplete="name" required />
        </div>
        <div className="field">
          <label htmlFor="ent-email">{t("auth.email")}</label>
          <input id="ent-email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="field">
          <label htmlFor="ent-company">{t("pricing.enterprise.company")}</label>
          <input id="ent-company" name="company" autoComplete="organization" required />
        </div>
        <div className="field">
          <label htmlFor="ent-size">{t("pricing.enterprise.teamSize")}</label>
          <input id="ent-size" name="teamSize" type="number" min={25} required />
        </div>
      </div>
      <input type="hidden" name="locale" value="it" />
      <div className="field">
        <label htmlFor="ent-needs">{t("pricing.enterprise.needs")}</label>
        <textarea id="ent-needs" name="needs" minLength={10} required placeholder={t("pricing.enterprise.needsPlaceholder")} />
      </div>
      <button className="btn primary" disabled={busy}>
        {busy ? <span className="spinner" /> : null}
        {t("pricing.enterprise.submit")}
      </button>
      {state.ok && (
        <div className="notice" role="status">
          <div className="notice-body">
            {state.ok}
            {state.bookingUrl && (
              <>
                {" "}
                <a href={state.bookingUrl} target="_blank" rel="noreferrer">
                  {t("pricing.enterprise.book")}
                </a>
              </>
            )}
          </div>
        </div>
      )}
      {state.error && (
        <div className="notice error" role="alert">
          <div className="notice-body">{state.error}</div>
        </div>
      )}
    </form>
  );
}
