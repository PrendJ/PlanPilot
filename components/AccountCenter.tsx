"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { useI18n } from "./I18nProvider";
import { api, useFeedback } from "./ui";

type Team = {
  id: string;
  name: string;
  slug: string;
  role: string;
  isDefault: boolean;
  plan: string;
  seatBased: boolean;
  seats: number;
  seatLimit: number | null;
  boards: number;
  price: number | null;
  interval: string | null;
  readOnly: boolean;
  trialEndsAt: string | null;
  renewsAt: string | null;
  cancelAtPeriodEnd: boolean;
  subscriptionStatus: string | null;
  hasBillingAccount: boolean;
  usage: { used: number; included: number | null; credits: number; percent: number } | null;
  require2fa: boolean;
  canEnforce2fa: boolean;
  fiscal: {
    billingName: string | null;
    vatNumber: string | null;
    fiscalCode: string | null;
    sdiCode: string | null;
    pecEmail: string | null;
  };
};
type User = {
  name: string;
  email: string;
  locale: "it" | "en";
  verified: boolean;
  twoFactor: boolean;
  autoApplyAi: boolean;
  autoSendDictation: boolean;
  emailDigest: boolean;
  referralCode: string | null;
};
type Token = { id: string; name: string; prefix: string; lastUsedAt: string | null; createdAt: string };

export function AccountCenter({
  user,
  teams,
  billingEnabled,
  notices,
}: {
  user: User;
  teams: Team[];
  billingEnabled: boolean;
  notices: { require2fa: boolean; credits: string | null };
}) {
  const { t, tag } = useI18n();
  const { toast, confirm } = useFeedback();
  const router = useRouter();
  const [prefs, setPrefs] = useState({
    name: user.name,
    autoApplyAi: user.autoApplyAi,
    autoSendDictation: user.autoSendDictation,
    emailDigest: user.emailDigest,
  });
  const [twoFactor, setTwoFactor] = useState(user.twoFactor);
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [recovery, setRecovery] = useState<string[]>([]);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [newToken, setNewToken] = useState("");
  const [busy, setBusy] = useState("");
  const fail = (message?: string) => toast({ message: message || t("errors.SERVER_ERROR"), tone: "error" });
  const date = (value: string) => new Date(value).toLocaleDateString(tag, { day: "numeric", month: "long", year: "numeric" });

  useEffect(() => {
    void api<{ tokens: Token[] }>("/api/account/tokens").then(response => {
      if (response.ok) setTokens(response.data.tokens);
    });
  }, []);

  async function savePrefs(patch: Partial<typeof prefs>) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    const response = await api("/api/account/preferences", { method: "PATCH", json: patch });
    if (!response.ok) fail(response.data.error);
    else if (patch.name) {
      toast({ message: t("settings.saved") });
      router.refresh();
    }
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy("password");
    const response = await api("/api/account/password", { method: "POST", json: { current: data.get("current"), next: data.get("next") } });
    setBusy("");
    if (response.ok) {
      form.reset();
      toast({ message: t("account.security.passwordChanged") });
    } else fail(response.data.error);
  }

  async function startSetup() {
    setBusy("2fa");
    const response = await api<{ secret: string; qr: string }>("/api/account/2fa");
    setBusy("");
    if (response.ok) setSetup(response.data);
    else fail(response.data.error);
  }

  async function confirmSetup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") || "");
    const response = await api<{ recoveryCodes: string[] }>("/api/account/2fa", { method: "POST", json: { code } });
    if (!response.ok) {
      fail(response.data.error);
      return;
    }
    setTwoFactor(true);
    setSetup(null);
    setRecovery(response.data.recoveryCodes);
    toast({ message: t("account.security.twoFactorOn") });
  }

  async function regenerateCodes(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const code = String(new FormData(form).get("code") || "");
    const response = await api<{ recoveryCodes: string[] }>("/api/account/2fa", { method: "POST", json: { code } });
    if (response.ok) {
      setRecovery(response.data.recoveryCodes);
      form.reset();
    } else fail(response.data.error);
  }

  async function disable2fa(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const response = await api("/api/account/2fa", { method: "DELETE", json: { password: data.get("password"), code: data.get("code") } });
    if (response.ok) {
      setTwoFactor(false);
      setRecovery([]);
      toast({ message: t("account.security.twoFactorOff") });
    } else fail(response.data.error);
  }

  async function createToken(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const response = await api<{ token: Token; secret: string }>("/api/account/tokens", {
      method: "POST",
      json: { name: new FormData(form).get("name") },
    });
    if (!response.ok) {
      fail(response.data.error);
      return;
    }
    setTokens(current => [response.data.token, ...current]);
    setNewToken(response.data.secret);
    form.reset();
  }

  async function revokeToken(token: Token) {
    if (
      !(await confirm({ title: t("account.api.revokeTitle", { name: token.name }), confirmLabel: t("account.api.revoke"), danger: true }))
    )
      return;
    const response = await api(`/api/account/tokens/${token.id}`, { method: "DELETE" });
    if (response.ok) setTokens(current => current.filter(item => item.id !== token.id));
    else fail(response.data.error);
  }

  async function billingPortal(team: Team) {
    setBusy(team.id);
    const response = await api<{ url: string }>("/api/billing/portal", { method: "POST", json: { organizationId: team.id } });
    setBusy("");
    if (response.ok) location.href = response.data.url;
    else fail(response.data.error);
  }

  async function buyCredits(team: Team) {
    setBusy(`credits-${team.id}`);
    const response = await api<{ url: string }>("/api/billing/credits", { method: "POST", json: { organizationId: team.id, packs: 1 } });
    setBusy("");
    if (response.ok) location.href = response.data.url;
    else fail(response.data.error);
  }

  async function updateTeam(team: Team, patch: { name?: string; require2fa?: boolean }) {
    const response = await api(`/api/organizations/${team.id}`, { method: "PATCH", json: patch });
    if (response.ok) {
      toast({ message: t("settings.saved") });
      router.refresh();
    } else fail(response.data.error);
  }

  async function deleteTeam(team: Team, event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (
      !(await confirm({
        title: t("account.teams.deleteTitle", { name: team.name }),
        message: t("account.teams.deleteBody"),
        confirmLabel: t("account.teams.deleteCta"),
        danger: true,
      }))
    )
      return;
    const response = await api(`/api/organizations/${team.id}`, {
      method: "DELETE",
      json: { password: data.get("password"), confirmSlug: data.get("confirmSlug") },
    });
    if (response.ok) router.refresh();
    else fail(response.data.error);
  }

  async function deleteAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get("password");
    if (
      !(await confirm({
        title: t("account.delete.confirmTitle"),
        message: t("account.delete.confirmBody"),
        confirmLabel: t("account.delete.cta"),
        danger: true,
      }))
    )
      return;
    const response = await api("/api/account", { method: "DELETE", json: { password } });
    if (response.ok) {
      router.push("/");
      router.refresh();
    } else fail(response.data.error);
  }

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ message: t("common.copied") });
    } catch {
      /* blocked */
    }
  };
  return (
    <div className="settings-layout">
      <nav className="settings-nav" aria-label={t("settings.sections")}>
        {(["profile", "security", "api", "teams", "danger"] as const).map(section => (
          <a key={section} href={`#${section}`}>
            {t(`account.nav.${section}`)}
          </a>
        ))}
      </nav>
      <div className="settings-stack">
        {notices.require2fa && (
          <div className="notice warning" role="alert">
            <Icon name="shield" />
            <div className="notice-body">{t("errors.TWO_FACTOR_SETUP_REQUIRED")}</div>
          </div>
        )}
        {notices.credits === "success" && (
          <div className="notice" role="status">
            <Icon name="checkCircle" />
            <div className="notice-body">{t("account.teams.creditsAdded")}</div>
          </div>
        )}

        <section id="profile" className="panel">
          <div className="panel-head">
            <div>
              <h2>{t("account.nav.profile")}</h2>
              <p>
                {user.email}
                {!user.verified && (
                  <>
                    {" "}
                    · <span className="badge warning">{t("account.profile.unverified")}</span>
                  </>
                )}
              </p>
            </div>
          </div>
          <form
            className="form-grid"
            onSubmit={event => {
              event.preventDefault();
              void savePrefs({ name: String(new FormData(event.currentTarget).get("name") || "") });
            }}
          >
            <div className="field">
              <label htmlFor="acc-name">{t("account.profile.name")}</label>
              <input id="acc-name" name="name" defaultValue={prefs.name} required minLength={2} maxLength={100} />
            </div>
            <div style={{ alignSelf: "end" }}>
              <button className="btn">{t("common.save")}</button>
            </div>
          </form>
          <div style={{ marginTop: 16 }}>
            <label className="switch">
              <span>
                <strong>{t("account.prefs.autoApply")}</strong>
                <span>{t("account.prefs.autoApplyHint")}</span>
              </span>
              <input
                type="checkbox"
                checked={prefs.autoApplyAi}
                onChange={event => void savePrefs({ autoApplyAi: event.target.checked })}
              />
            </label>
            <label className="switch">
              <span>
                <strong>{t("account.prefs.autoSend")}</strong>
                <span>{t("account.prefs.autoSendHint")}</span>
              </span>
              <input
                type="checkbox"
                checked={prefs.autoSendDictation}
                onChange={event => void savePrefs({ autoSendDictation: event.target.checked })}
              />
            </label>
            <label className="switch">
              <span>
                <strong>{t("account.prefs.digest")}</strong>
                <span>{t("account.prefs.digestHint")}</span>
              </span>
              <input
                type="checkbox"
                checked={prefs.emailDigest}
                onChange={event => void savePrefs({ emailDigest: event.target.checked })}
              />
            </label>
          </div>
          {user.referralCode && (
            <p className="subtle" style={{ marginTop: 12 }}>
              {t("account.referral", { code: user.referralCode })}{" "}
              <button
                type="button"
                className="text-button"
                onClick={() => void copy(`${location.origin}/register?ref=${user.referralCode}`)}
              >
                {t("account.referralCopy")}
              </button>
            </p>
          )}
        </section>

        <section id="security" className="panel">
          <div className="panel-head">
            <div>
              <h2>{t("account.nav.security")}</h2>
              <p>{t("account.security.description")}</p>
            </div>
            {twoFactor ? (
              <span className="badge success">
                <Icon name="shield" size={12} />
                {t("account.security.protected")}
              </span>
            ) : (
              <span className="badge warning">{t("account.security.notProtected")}</span>
            )}
          </div>
          <h3>{t("account.security.twoFactor")}</h3>
          <p className="subtle" style={{ margin: "4px 0 12px" }}>
            {t("account.security.twoFactorHint")}
          </p>
          {!twoFactor && !setup && (
            <button type="button" className="btn primary" onClick={() => void startSetup()} disabled={busy === "2fa"}>
              <Icon name="shield" size={16} />
              {t("account.security.enable")}
            </button>
          )}
          {setup && (
            <div className="stack">
              <ol className="subtle" style={{ paddingLeft: 18, display: "grid", gap: 4 }}>
                <li>{t("account.security.step1")}</li>
                <li>{t("account.security.step2")}</li>
                <li>{t("account.security.step3")}</li>
              </ol>
              <div className="row" style={{ alignItems: "flex-start", gap: 16 }}>
                <div className="qr-box" role="img" aria-label={t("account.security.qr")} dangerouslySetInnerHTML={{ __html: setup.qr }} />
                <div className="stack" style={{ flex: 1, minWidth: 220 }}>
                  <div>
                    <span className="subtle">{t("account.security.manualKey")}</span>
                    <div className="secret-box">
                      <span style={{ flex: 1 }}>{setup.secret.match(/.{1,4}/g)?.join(" ")}</span>
                      <button type="button" className="btn sm" onClick={() => void copy(setup.secret)}>
                        {t("common.copy")}
                      </button>
                    </div>
                  </div>
                  <form onSubmit={confirmSetup} className="row">
                    <input
                      name="code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9 ]{6,7}"
                      required
                      placeholder="123 456"
                      className="otp-input"
                      style={{ maxWidth: 200 }}
                      aria-label={t("account.security.code")}
                    />
                    <button className="btn primary">{t("account.security.verify")}</button>
                    <button type="button" className="btn ghost" onClick={() => setSetup(null)}>
                      {t("common.cancel")}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          )}
          {recovery.length > 0 && (
            <div className="notice warning" style={{ marginTop: 12 }}>
              <Icon name="key" />
              <div className="notice-body">
                <strong>{t("account.security.recoveryTitle")}</strong>
                <p>{t("account.security.recoveryBody")}</p>
                <div className="recovery-codes" style={{ marginTop: 8 }}>
                  {recovery.map(code => (
                    <span key={code}>{code}</span>
                  ))}
                </div>
                <div className="row" style={{ marginTop: 8 }}>
                  <button type="button" className="btn sm" onClick={() => void copy(recovery.join("\n"))}>
                    <Icon name="copy" size={14} />
                    {t("common.copy")}
                  </button>
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => {
                      const blob = new Blob([`BoardCue — ${user.email}\n\n${recovery.join("\n")}\n`], { type: "text/plain" });
                      const link = document.createElement("a");
                      link.href = URL.createObjectURL(blob);
                      link.download = "boardcue-recovery-codes.txt";
                      link.click();
                    }}
                  >
                    <Icon name="download" size={14} />
                    {t("account.security.download")}
                  </button>
                </div>
              </div>
            </div>
          )}
          {twoFactor && (
            <div className="form-grid" style={{ marginTop: 12 }}>
              <form onSubmit={regenerateCodes} className="field">
                <label htmlFor="regen-code">{t("account.security.regenerate")}</label>
                <div className="row">
                  <input
                    id="regen-code"
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    placeholder="123 456"
                    style={{ maxWidth: 160 }}
                  />
                  <button className="btn sm">{t("account.security.newCodes")}</button>
                </div>
              </form>
              <details>
                <summary className="subtle" style={{ cursor: "pointer" }}>
                  {t("account.security.disable")}
                </summary>
                <form onSubmit={disable2fa} className="stack" style={{ marginTop: 8 }}>
                  <input
                    name="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    placeholder={t("account.security.currentPassword")}
                    aria-label={t("account.security.currentPassword")}
                  />
                  <input
                    name="code"
                    required
                    placeholder={t("account.security.codeOrRecovery")}
                    aria-label={t("account.security.codeOrRecovery")}
                  />
                  <button className="btn sm danger">{t("account.security.disableCta")}</button>
                </form>
              </details>
            </div>
          )}
          <hr className="divider" />
          <h3>{t("account.security.password")}</h3>
          <form onSubmit={changePassword} className="form-grid" style={{ marginTop: 10 }}>
            <div className="field">
              <label htmlFor="pw-current">{t("account.security.currentPassword")}</label>
              <input id="pw-current" name="current" type="password" required autoComplete="current-password" />
            </div>
            <div className="field">
              <label htmlFor="pw-next">{t("account.security.newPassword")}</label>
              <input id="pw-next" name="next" type="password" required minLength={10} autoComplete="new-password" />
              <small>{t("auth.passwordHint")}</small>
            </div>
            <div>
              <button className="btn" disabled={busy === "password"}>
                {t("account.security.changePassword")}
              </button>
            </div>
          </form>
          <hr className="divider" />
          <div className="row">
            <div style={{ flex: 1 }}>
              <h3>{t("account.security.sessions")}</h3>
              <p className="subtle">{t("account.security.sessionsHint")}</p>
            </div>
            <button
              type="button"
              className="btn"
              onClick={async () => {
                await api("/api/auth/logout", { method: "POST", json: { all: true } });
                router.push("/login");
              }}
            >
              {t("account.security.signOutAll")}
            </button>
          </div>
        </section>

        <section id="api" className="panel">
          <div className="panel-head">
            <div>
              <h2>{t("account.nav.api")}</h2>
              <p>{t("account.api.description")}</p>
            </div>
          </div>
          <form onSubmit={createToken} className="row">
            <input
              name="name"
              required
              maxLength={60}
              placeholder={t("account.api.namePlaceholder")}
              aria-label={t("account.api.name")}
              style={{ maxWidth: 320 }}
            />
            <button className="btn" disabled={!user.verified}>
              <Icon name="key" size={15} />
              {t("account.api.create")}
            </button>
          </form>
          {!user.verified && (
            <p className="subtle" style={{ marginTop: 6 }}>
              {t("errors.EMAIL_NOT_VERIFIED")}
            </p>
          )}
          {newToken && (
            <div className="notice info" style={{ marginTop: 12 }}>
              <Icon name="key" />
              <div className="notice-body">
                {t("account.api.shownOnce")}
                <div className="secret-box" style={{ marginTop: 6 }}>
                  <span style={{ flex: 1 }}>{newToken}</span>
                  <button type="button" className="btn sm" onClick={() => void copy(newToken)}>
                    {t("common.copy")}
                  </button>
                </div>
              </div>
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            {tokens.map(token => (
              <div key={token.id} className="member-row">
                <span className="avatar">
                  <Icon name="key" size={13} />
                </span>
                <div className="who">
                  <strong>{token.name}</strong>
                  <span>
                    {token.prefix}… ·{" "}
                    {token.lastUsedAt ? t("account.api.lastUsed", { date: date(token.lastUsedAt) }) : t("account.api.neverUsed")}
                  </span>
                </div>
                <button type="button" className="btn sm danger" onClick={() => void revokeToken(token)}>
                  {t("account.api.revoke")}
                </button>
              </div>
            ))}
          </div>
          <p className="subtle" style={{ marginTop: 10 }}>
            {t("account.api.docs")} <code>GET /api/v1/boards</code>, <code>POST /api/v1/boards/:slug/cards</code>,{" "}
            <code>POST /api/v1/boards/:slug/updates</code>
          </p>
        </section>

        <section id="teams" className="settings-stack">
          <div>
            <h2>{t("account.nav.teams")}</h2>
            <p className="subtle">{t("account.teams.description")}</p>
          </div>
          {teams.map(team => (
            <article key={team.id} className="panel">
              <div className="panel-head">
                <div>
                  <h3>
                    {team.name}
                    {team.isDefault && (
                      <span className="badge outline" style={{ marginLeft: 8 }}>
                        {t("account.teams.default")}
                      </span>
                    )}
                  </h3>
                  <p>
                    {t(`roles.${team.role}`)} · {t("account.teams.boards", { count: team.boards })}
                  </p>
                </div>
                <span className={`plan-badge plan-${team.plan}`}>{t(`plans.${team.plan}`)}</span>
              </div>
              {team.readOnly && (
                <div className="notice warning" style={{ marginBottom: 12 }}>
                  <Icon name="lock" />
                  <div className="notice-body">{t("home.frozen")}</div>
                </div>
              )}
              <div className="stat-list">
                {team.price !== null && team.price > 0 && (
                  <div>
                    <span>{t("account.teams.price")}</span>
                    <strong>
                      €{team.price.toFixed(2).replace(".00", "")} {t("pricing.perMonth")}
                      {team.interval === "year" ? ` · ${t("pricing.billedYearly")}` : ""}
                    </strong>
                  </div>
                )}
                <div>
                  <span>{t("home.plan.seats")}</span>
                  <strong>
                    {team.seats} / {team.seatLimit ?? "∞"}
                  </strong>
                </div>
                {team.usage && (
                  <div>
                    <span>{t("home.plan.aiUpdates")}</span>
                    <strong>
                      {team.usage.included === null ? "∞" : `${team.usage.used} / ${team.usage.included}`}
                      {team.usage.credits > 0 ? ` + ${team.usage.credits} ${t("account.teams.credits")}` : ""}
                    </strong>
                  </div>
                )}
                {team.trialEndsAt && (
                  <div>
                    <span>{t("account.teams.trialEnds")}</span>
                    <strong>{date(team.trialEndsAt)}</strong>
                  </div>
                )}
                {team.renewsAt && (
                  <div>
                    <span>{team.cancelAtPeriodEnd ? t("account.teams.activeUntil") : t("account.teams.renews")}</span>
                    <strong>{date(team.renewsAt)}</strong>
                  </div>
                )}
                {team.subscriptionStatus === "past_due" && (
                  <div>
                    <span>{t("account.teams.payment")}</span>
                    <strong className="badge danger">{t("account.teams.pastDue")}</strong>
                  </div>
                )}
              </div>
              {team.role === "OWNER" && (
                <>
                  <div className="row" style={{ marginTop: 16 }}>
                    {team.hasBillingAccount && billingEnabled && (
                      <button type="button" className="btn" disabled={busy === team.id} onClick={() => void billingPortal(team)}>
                        <Icon name="card" size={15} />
                        {t("account.teams.manageBilling")}
                      </button>
                    )}
                    {(team.plan === "TRIAL" || team.readOnly) && (
                      <Link className="btn primary" href="/pricing">
                        {t("home.plan.choose")}
                      </Link>
                    )}
                    {!team.readOnly && team.plan !== "TRIAL" && billingEnabled && (
                      <button type="button" className="btn" disabled={busy === `credits-${team.id}`} onClick={() => void buyCredits(team)}>
                        <Icon name="zap" size={15} />
                        {t("account.teams.buyCredits")}
                      </button>
                    )}
                    <a className="btn ghost" href={`/api/organizations/${team.id}/export`}>
                      <Icon name="download" size={15} />
                      {t("account.teams.export")}
                    </a>
                  </div>
                  {team.canEnforce2fa ? (
                    <label className="switch" style={{ marginTop: 12 }}>
                      <span>
                        <strong>{t("account.teams.require2fa")}</strong>
                        <span>{t("account.teams.require2faHint")}</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={team.require2fa}
                        onChange={event => void updateTeam(team, { require2fa: event.target.checked })}
                      />
                    </label>
                  ) : (
                    <p className="subtle" style={{ marginTop: 12 }}>
                      {t("account.teams.require2faUpsell")}
                    </p>
                  )}
                  {(team.fiscal.vatNumber || team.fiscal.fiscalCode || team.fiscal.sdiCode || team.fiscal.pecEmail) && (
                    <details style={{ marginTop: 12 }}>
                      <summary className="subtle" style={{ cursor: "pointer" }}>
                        {t("account.teams.fiscal")}
                      </summary>
                      <div className="stat-list">
                        {team.fiscal.billingName && (
                          <div>
                            <span>{t("account.teams.billingName")}</span>
                            <strong>{team.fiscal.billingName}</strong>
                          </div>
                        )}
                        {team.fiscal.vatNumber && (
                          <div>
                            <span>P.IVA</span>
                            <strong>{team.fiscal.vatNumber}</strong>
                          </div>
                        )}
                        {team.fiscal.fiscalCode && (
                          <div>
                            <span>C.F.</span>
                            <strong>{team.fiscal.fiscalCode}</strong>
                          </div>
                        )}
                        {team.fiscal.sdiCode && (
                          <div>
                            <span>SDI</span>
                            <strong>{team.fiscal.sdiCode}</strong>
                          </div>
                        )}
                        {team.fiscal.pecEmail && (
                          <div>
                            <span>PEC</span>
                            <strong>{team.fiscal.pecEmail}</strong>
                          </div>
                        )}
                      </div>
                      <p className="subtle" style={{ marginTop: 6 }}>
                        {t("account.teams.fiscalHint")}
                      </p>
                    </details>
                  )}
                  <details style={{ marginTop: 12 }}>
                    <summary className="subtle" style={{ cursor: "pointer" }}>
                      {t("account.teams.rename")}
                    </summary>
                    <form
                      className="row"
                      style={{ marginTop: 8 }}
                      onSubmit={event => {
                        event.preventDefault();
                        void updateTeam(team, { name: String(new FormData(event.currentTarget).get("name") || "") });
                      }}
                    >
                      <input
                        name="name"
                        defaultValue={team.name}
                        required
                        minLength={2}
                        maxLength={100}
                        style={{ maxWidth: 320 }}
                        aria-label={t("account.teams.rename")}
                      />
                      <button className="btn sm">{t("common.save")}</button>
                    </form>
                  </details>
                  {!team.isDefault && (
                    <details style={{ marginTop: 12 }}>
                      <summary className="subtle" style={{ cursor: "pointer", color: "var(--danger)" }}>
                        {t("account.teams.deleteTitle", { name: team.name })}
                      </summary>
                      <form className="stack" style={{ marginTop: 8, maxWidth: 420 }} onSubmit={event => void deleteTeam(team, event)}>
                        <p className="subtle">{t("account.teams.deleteConfirm", { slug: team.slug })}</p>
                        <input name="confirmSlug" required placeholder={team.slug} aria-label={t("account.teams.slug")} />
                        <input
                          name="password"
                          type="password"
                          required
                          placeholder={t("account.security.currentPassword")}
                          aria-label={t("account.security.currentPassword")}
                        />
                        <button className="btn danger">{t("account.teams.deleteCta")}</button>
                      </form>
                    </details>
                  )}
                </>
              )}
            </article>
          ))}
        </section>

        <section id="danger" className="panel">
          <div className="panel-head">
            <div>
              <h2>{t("account.nav.danger")}</h2>
              <p>{t("account.delete.description")}</p>
            </div>
          </div>
          <form onSubmit={deleteAccount} className="row">
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder={t("account.security.currentPassword")}
              aria-label={t("account.security.currentPassword")}
              style={{ maxWidth: 280 }}
            />
            <button className="btn danger">
              <Icon name="trash" size={15} />
              {t("account.delete.cta")}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
