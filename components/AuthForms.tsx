"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { useI18n } from "./I18nProvider";
import { api } from "./ui";
import { safeNextPath } from "@/lib/navigation";

function PasswordInput({
  id,
  name,
  autoComplete,
  minLength,
  describedBy,
  autoFocus,
}: {
  id: string;
  name: string;
  autoComplete: string;
  minLength?: number;
  describedBy?: string;
  autoFocus?: boolean;
}) {
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  return (
    <div className="password-field">
      <input
        id={id}
        name={name}
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        required
        minLength={minLength}
        maxLength={200}
        aria-describedby={describedBy}
        autoFocus={autoFocus}
      />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setShow(value => !value)}
        aria-label={show ? t("auth.hidePassword") : t("auth.showPassword")}
      >
        {show ? t("auth.hide") : t("auth.show")}
      </button>
    </div>
  );
}

function Notice({ tone, children }: { tone: "success" | "error" | "info"; children: React.ReactNode }) {
  return (
    <div className={`notice ${tone === "error" ? "error" : tone === "info" ? "info" : ""}`} role={tone === "error" ? "alert" : "status"}>
      <Icon name={tone === "error" ? "alert" : tone === "info" ? "info" : "checkCircle"} />
      <div className="notice-body">{children}</div>
    </div>
  );
}

export function LoginForm({
  next = "/app",
  notice,
  twoFactorPending = false,
}: {
  next?: string;
  notice?: { tone: "success" | "error"; message: string };
  twoFactorPending?: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const destination = safeNextPath(next, "/app");
  const [mode, setMode] = useState<"password" | "magic" | "twofactor">(twoFactorPending ? "twofactor" : "password");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [magicSent, setMagicSent] = useState(false);

  async function submitPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const data = new FormData(event.currentTarget);
    const response = await api<{ twoFactorRequired: boolean }>("/api/auth/login", {
      method: "POST",
      json: { email: data.get("email"), password: data.get("password") },
    });
    setBusy(false);
    if (!response.ok) {
      setError(response.data.error || t("errors.SERVER_ERROR"));
      return;
    }
    if (response.data.twoFactorRequired) {
      setMode("twofactor");
      return;
    }
    router.replace(destination);
    router.refresh();
  }

  async function submitCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const response = await api<{ expired?: boolean }>("/api/auth/login/2fa", {
      method: "POST",
      json: { code: new FormData(event.currentTarget).get("code") },
    });
    setBusy(false);
    if (!response.ok) {
      if (response.data.expired) setMode("password");
      setError(response.data.error || t("errors.TWO_FACTOR_INVALID"));
      return;
    }
    router.replace(destination);
    router.refresh();
  }

  async function submitMagic(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const response = await api("/api/auth/magic-link", {
      method: "POST",
      json: { email: new FormData(event.currentTarget).get("email"), ...(destination !== "/app" && { next: destination }) },
    });
    setBusy(false);
    if (!response.ok) {
      setError(response.data.error || t("errors.SERVER_ERROR"));
      return;
    }
    setMagicSent(true);
  }

  if (mode === "twofactor") {
    return (
      <form onSubmit={submitCode}>
        <Notice tone="info">{t("auth.twoFactor.explain")}</Notice>
        <div className="field">
          <label htmlFor="otp">{t("auth.twoFactor.code")}</label>
          <input
            id="otp"
            name="code"
            className="otp-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            minLength={6}
            maxLength={20}
            autoFocus
            placeholder="123 456"
          />
          <small>{t("auth.twoFactor.recoveryHint")}</small>
        </div>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <button className="btn primary auth-submit" disabled={busy}>
          {busy ? <span className="spinner" /> : null}
          {t("auth.twoFactor.verify")}
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setMode("password");
            setError("");
          }}
        >
          {t("auth.twoFactor.back")}
        </button>
      </form>
    );
  }

  if (mode === "magic") {
    return magicSent ? (
      <div className="auth-state">
        <span className="auth-state-icon">
          <Icon name="mail" />
        </span>
        <h2>{t("auth.magic.sentTitle")}</h2>
        <p className="subtle">{t("auth.magic.sentBody")}</p>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setMagicSent(false);
            setMode("password");
          }}
        >
          {t("auth.magic.usePassword")}
        </button>
      </div>
    ) : (
      <form onSubmit={submitMagic}>
        <div className="field">
          <label htmlFor="magic-email">{t("auth.email")}</label>
          <input
            id="magic-email"
            name="email"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoComplete="email"
            required
            autoFocus
            placeholder="nome@azienda.it"
          />
        </div>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <button className="btn primary auth-submit" disabled={busy}>
          {busy ? <span className="spinner" /> : <Icon name="mail" size={16} />}
          {t("auth.magic.send")}
        </button>
        <button type="button" className="text-button" onClick={() => setMode("password")}>
          {t("auth.magic.usePassword")}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submitPassword}>
      {notice && <Notice tone={notice.tone}>{notice.message}</Notice>}
      <div className="field">
        <label htmlFor="login-email">{t("auth.email")}</label>
        <input
          id="login-email"
          name="email"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="email"
          placeholder="nome@azienda.it"
          required
          autoFocus
        />
      </div>
      <div className="field">
        <label htmlFor="login-password">{t("auth.password")}</label>
        <PasswordInput id="login-password" name="password" autoComplete="current-password" minLength={8} />
      </div>
      {error && (
        <div className="form-error" role="alert" aria-live="assertive">
          {error}
        </div>
      )}
      <button className="btn primary auth-submit" disabled={busy}>
        {busy ? <span className="spinner" /> : null}
        {t("auth.login.submit")}
      </button>
      <div className="auth-links">
        <Link href="/forgot-password">{t("auth.login.forgot")}</Link>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setMode("magic");
            setError("");
          }}
        >
          {t("auth.magic.cta")}
        </button>
      </div>
    </form>
  );
}

export function RegisterForm({ next, referral, defaultLocale }: { next: string; referral?: string; defaultLocale: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [timeZoneLocale, setTimeZoneLocale] = useState(defaultLocale);
  useEffect(() => {
    if (!defaultLocale) setTimeZoneLocale(navigator.language.slice(0, 2));
  }, [defaultLocale]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const data = new FormData(event.currentTarget);
    const locale = ["it", "en", "de", "fr", "es", "ru", "pl"].includes(timeZoneLocale) ? timeZoneLocale : "it";
    const response = await api<{ session: boolean; destination?: string }>("/api/auth/register", {
      method: "POST",
      json: {
        name: data.get("name"),
        email: data.get("email"),
        password: data.get("password"),
        locale,
        ...(next !== "/app" && { next }),
        ...(referral && { ref: referral }),
      },
    });
    setBusy(false);
    if (!response.ok) {
      setError(response.data.error || t("errors.SERVER_ERROR"));
      return;
    }
    if (response.data.session && response.data.destination) {
      router.replace(response.data.destination);
      router.refresh();
      return;
    }
    setSent(String(data.get("email")));
  }

  if (sent)
    return (
      <div className="auth-state">
        <span className="auth-state-icon">
          <Icon name="mail" />
        </span>
        <h2>{t("auth.register.checkEmail")}</h2>
        <p className="subtle">{t("auth.register.existing", { email: sent })}</p>
        <Link className="btn" href="/login">
          {t("auth.login.submit")}
        </Link>
      </div>
    );
  return (
    <form onSubmit={submit}>
      <div className="field">
        <label htmlFor="register-name">{t("auth.register.name")}</label>
        <input
          id="register-name"
          name="name"
          autoComplete="name"
          placeholder={t("auth.register.namePlaceholder")}
          required
          minLength={2}
          maxLength={100}
          autoFocus
        />
      </div>
      <div className="field">
        <label htmlFor="register-email">{t("auth.email")}</label>
        <input
          id="register-email"
          name="email"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="email"
          placeholder="nome@azienda.it"
          required
        />
      </div>
      <div className="field">
        <label htmlFor="register-password">{t("auth.register.password")}</label>
        <PasswordInput
          id="register-password"
          name="password"
          autoComplete="new-password"
          minLength={10}
          describedBy="register-password-hint"
        />
        <small id="register-password-hint">{t("auth.passwordHint")}</small>
      </div>
      <p className="form-consent">
        {t("auth.register.consentBefore")}{" "}
        <Link href="/terms" target="_blank">
          {t("legal.terms")}
        </Link>{" "}
        {t("auth.register.consentMiddle")}{" "}
        <Link href="/privacy" target="_blank">
          {t("legal.privacy")}
        </Link>
        .
      </p>
      {error && (
        <div className="form-error" role="alert" aria-live="assertive">
          {error}
        </div>
      )}
      <button className="btn primary auth-submit" disabled={busy}>
        {busy ? <span className="spinner" /> : null}
        {t("auth.register.submit")}
      </button>
    </form>
  );
}

export function ForgotForm() {
  const { t } = useI18n();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    await api("/api/auth/forgot-password", { method: "POST", json: { email: new FormData(event.currentTarget).get("email") } });
    setBusy(false);
    setSent(true);
  }
  if (sent)
    return (
      <div className="auth-state">
        <span className="auth-state-icon">
          <Icon name="mail" />
        </span>
        <h2>{t("auth.forgot.sentTitle")}</h2>
        <p className="subtle">{t("auth.forgot.sentBody")}</p>
        <Link className="btn" href="/login">
          {t("auth.backToLogin")}
        </Link>
      </div>
    );
  return (
    <form onSubmit={submit}>
      <div className="field">
        <label htmlFor="forgot-email">{t("auth.email")}</label>
        <input
          id="forgot-email"
          name="email"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoComplete="email"
          required
          autoFocus
          placeholder="nome@azienda.it"
        />
      </div>
      <button className="btn primary auth-submit" disabled={busy}>
        {busy ? <span className="spinner" /> : null}
        {t("auth.forgot.submit")}
      </button>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [state, setState] = useState<"checking" | "valid" | "invalid">(token ? "checking" : "invalid");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!token) return;
    void api<{ valid: boolean }>(`/api/auth/reset-password?token=${encodeURIComponent(token)}`).then(response =>
      setState(response.ok && response.data.valid ? "valid" : "invalid"),
    );
  }, [token]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await api("/api/auth/reset-password", {
      method: "POST",
      json: { token, password: new FormData(event.currentTarget).get("password") },
    });
    setBusy(false);
    if (!response.ok) {
      setError(response.data.error || t("errors.SERVER_ERROR"));
      return;
    }
    router.replace("/login?reset=1");
  }
  if (state === "checking")
    return (
      <p className="subtle" role="status">
        {t("common.loading")}
      </p>
    );
  if (state === "invalid")
    return (
      <div className="auth-state">
        <span className="auth-state-icon" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
          <Icon name="alert" />
        </span>
        <h2>{t("auth.reset.invalidTitle")}</h2>
        <p className="subtle">{t("auth.reset.invalidBody")}</p>
        <Link className="btn primary" href="/forgot-password">
          {t("auth.reset.newLink")}
        </Link>
      </div>
    );
  return (
    <form onSubmit={submit}>
      <div className="field">
        <label htmlFor="reset-password">{t("auth.reset.newPassword")}</label>
        <PasswordInput id="reset-password" name="password" autoComplete="new-password" minLength={10} describedBy="reset-hint" autoFocus />
        <small id="reset-hint">{t("auth.passwordHint")}</small>
      </div>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      <button className="btn primary auth-submit" disabled={busy}>
        {t("auth.reset.submit")}
      </button>
    </form>
  );
}

export function AcceptInvite({ token }: { token: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [wrongAccount, setWrongAccount] = useState(false);
  async function accept() {
    setBusy(true);
    setError("");
    setWrongAccount(false);
    const response = await api<{ destination: string }>("/api/invites/accept", { method: "POST", json: { token } });
    setBusy(false);
    if (!response.ok) {
      setError(response.data.error || t("errors.INVITE_INVALID"));
      setWrongAccount(response.data.code === "INVITE_WRONG_EMAIL");
      return;
    }
    router.replace(response.data.destination || "/app");
    router.refresh();
  }
  async function changeAccount() {
    await api("/api/auth/logout", { method: "POST", json: {} });
    router.replace(`/login?next=${encodeURIComponent(`/accept-invite?token=${encodeURIComponent(token)}`)}`);
    router.refresh();
  }
  return (
    <div className="stack">
      {error && (
        <div className="notice error" role="alert">
          <Icon name="alert" />
          <div className="notice-body">{error}</div>
        </div>
      )}
      <button type="button" className="btn primary auth-submit" onClick={() => void accept()} disabled={busy}>
        {busy ? <span className="spinner" /> : null}
        {t("invite.accept")}
      </button>
      {wrongAccount && (
        <button type="button" className="btn" onClick={() => void changeAccount()}>
          {t("invite.switchAccount")}
        </button>
      )}
    </div>
  );
}
