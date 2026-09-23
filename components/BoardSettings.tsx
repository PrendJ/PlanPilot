"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "./Icon";
import { useI18n } from "./I18nProvider";
import { api, Avatar, useFeedback } from "./ui";

type Column = { id: string; title: string; description: string; cards: number };
type Member = { id: string; name: string; email: string; role: string };
type Invite = { id: string; email: string; role: string; expiresAt: string; invitedBy: { name: string } };
type Webhook = {
  id: string;
  url: string;
  format: string;
  events: string[];
  active: boolean;
  lastStatus: number | null;
  lastError: string | null;
};
type Props = {
  slug: string;
  isOwner: boolean;
  meId: string;
  general: { name: string; locale: string; dictationEnabled: boolean; planModel: string };
  models: Array<{ id: string; label: string; note: string; recommended?: boolean }>;
  columns: Column[];
  members: Member[];
  guestsAllowed: boolean;
};

const LANGUAGES = [
  ["it", "Italiano"],
  ["en", "English"],
  ["de", "Deutsch"],
  ["fr", "Français"],
  ["es", "Español"],
  ["ru", "Русский"],
  ["pl", "Polski"],
] as const;

export function BoardSettings({
  slug,
  isOwner,
  meId,
  general: initialGeneral,
  models,
  columns: initialColumns,
  members: initialMembers,
  guestsAllowed,
}: Props) {
  const { t, tag } = useI18n();
  const { toast, confirm } = useFeedback();
  const router = useRouter();
  const [general, setGeneral] = useState(initialGeneral);
  const [columns, setColumns] = useState(initialColumns);
  const [members, setMembers] = useState(initialMembers);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [webhookEvents, setWebhookEvents] = useState<string[]>([]);
  const [secret, setSecret] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [busy, setBusy] = useState("");
  const fail = useCallback((message?: string) => toast({ message: message || t("errors.SERVER_ERROR"), tone: "error" }), [toast, t]);

  const loadExtras = useCallback(async () => {
    const [inviteList, hooks] = await Promise.all([
      api<{ invites: Invite[] }>(`/api/workspaces/${slug}/invites`),
      api<{ webhooks: Webhook[]; events: string[] }>(`/api/workspaces/${slug}/webhooks`),
    ]);
    if (inviteList.ok) setInvites(inviteList.data.invites);
    if (hooks.ok) {
      setWebhooks(hooks.data.webhooks);
      setWebhookEvents(hooks.data.events);
    }
  }, [slug]);
  useEffect(() => {
    void loadExtras();
  }, [loadExtras]);

  async function saveGeneral(event: React.FormEvent) {
    event.preventDefault();
    setBusy("general");
    const response = await api(`/api/workspaces/${slug}`, { method: "PATCH", json: { action: "settings", ...general } });
    setBusy("");
    if (response.ok) {
      toast({ message: t("settings.saved") });
      router.refresh();
    } else fail(response.data.error);
  }

  async function saveColumn(column: Column, form: HTMLFormElement) {
    const data = new FormData(form);
    const response = await api<{ column: Column }>(`/api/workspaces/${slug}/columns/${column.id}`, {
      method: "PATCH",
      json: { title: data.get("title"), description: data.get("description") },
    });
    if (response.ok) {
      setColumns(current =>
        current.map(item =>
          item.id === column.id ? { ...item, title: String(data.get("title")), description: String(data.get("description") || "") } : item,
        ),
      );
      toast({ message: t("settings.saved") });
    } else fail(response.data.error);
  }

  async function moveColumn(index: number, direction: number) {
    const next = [...columns];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setColumns(next);
    const response = await api(`/api/workspaces/${slug}/columns`, { method: "PATCH", json: { columnIds: next.map(column => column.id) } });
    if (!response.ok) {
      setColumns(columns);
      fail(response.data.error);
    }
  }

  async function removeColumn(column: Column) {
    const destination = columns.find(item => item.id !== column.id);
    if (!destination) return;
    const ok = await confirm({
      title: t("settings.columns.deleteTitle", { title: column.title }),
      message: column.cards ? t("settings.columns.deleteMove", { count: column.cards, destination: destination.title }) : undefined,
      confirmLabel: t("common.delete"),
      danger: true,
    });
    if (!ok) return;
    const response = await api(`/api/workspaces/${slug}/columns/${column.id}`, {
      method: "DELETE",
      json: { destinationColumnId: column.cards ? destination.id : undefined },
    });
    if (response.ok) setColumns(current => current.filter(item => item.id !== column.id));
    else fail(response.data.error);
  }

  async function addColumn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const response = await api<{ column: Column }>(`/api/workspaces/${slug}/columns`, {
      method: "POST",
      json: { title: data.get("title"), description: data.get("description") || "" },
    });
    if (response.ok) {
      setColumns(current => [...current, { ...response.data.column, cards: 0 }]);
      form.reset();
    } else fail(response.data.error);
  }

  async function invite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy("invite");
    const response = await api<{ invite: Invite; inviteUrl: string | null; emailed: boolean }>(`/api/workspaces/${slug}/invites`, {
      method: "POST",
      json: { email: data.get("email"), role: data.get("role") },
    });
    setBusy("");
    if (!response.ok) {
      fail(response.data.error);
      return;
    }
    form.reset();
    setInviteLink(response.data.inviteUrl || "");
    toast({ message: response.data.emailed ? t("settings.members.invited") : t("settings.members.invitedNoEmail") });
    void loadExtras();
  }

  async function resend(item: Invite) {
    const response = await api<{ inviteUrl: string | null }>(`/api/workspaces/${slug}/invites/${item.id}`, { method: "POST", json: {} });
    if (response.ok) {
      setInviteLink(response.data.inviteUrl || "");
      toast({ message: t("settings.members.resent") });
      void loadExtras();
    } else fail(response.data.error);
  }

  async function revoke(item: Invite) {
    if (
      !(await confirm({
        title: t("settings.members.revokeTitle", { email: item.email }),
        confirmLabel: t("settings.members.revoke"),
        danger: true,
      }))
    )
      return;
    const response = await api(`/api/workspaces/${slug}/invites/${item.id}`, { method: "DELETE" });
    if (response.ok) setInvites(current => current.filter(entry => entry.id !== item.id));
    else fail(response.data.error);
  }

  async function changeRole(member: Member, role: string) {
    const response = await api(`/api/workspaces/${slug}/members/${member.id}`, { method: "PATCH", json: { role } });
    if (response.ok) {
      setMembers(current => current.map(item => (item.id === member.id ? { ...item, role } : item)));
      toast({ message: t("settings.members.roleChanged") });
    } else fail(response.data.error);
  }

  async function removeMember(member: Member) {
    if (
      !(await confirm({
        title: t("settings.members.removeTitle", { name: member.name }),
        message: t("settings.members.removeBody"),
        confirmLabel: t("settings.members.remove"),
        danger: true,
      }))
    )
      return;
    const response = await api(`/api/workspaces/${slug}/members/${member.id}`, { method: "DELETE" });
    if (response.ok) setMembers(current => current.filter(item => item.id !== member.id));
    else fail(response.data.error);
  }

  async function importFile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const file = data.get("file");
    const format = String(data.get("format"));
    if (!(file instanceof File) || !file.size) return;
    setBusy("import");
    const response = await api<{ createdCards: number; createdColumns: number }>(`/api/workspaces/${slug}/import`, {
      method: "POST",
      json: { format, content: await file.text() },
    });
    setBusy("");
    if (response.ok) {
      toast({ message: t("home.create.imported", { count: response.data.createdCards }) });
      router.refresh();
    } else fail(response.data.error);
  }

  async function addWebhook(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const response = await api<{ webhook: Webhook; secret: string }>(`/api/workspaces/${slug}/webhooks`, {
      method: "POST",
      json: { url: data.get("url"), format: data.get("format"), events: data.getAll("events") },
    });
    if (!response.ok) {
      fail(response.data.error);
      return;
    }
    setWebhooks(current => [response.data.webhook, ...current]);
    setSecret(response.data.secret);
    form.reset();
  }

  async function webhookAction(hook: Webhook, body: { active?: boolean; test?: boolean }) {
    const response = await api<{ webhook: Partial<Webhook> }>(`/api/workspaces/${slug}/webhooks/${hook.id}`, {
      method: "PATCH",
      json: body,
    });
    if (!response.ok) {
      fail(response.data.error);
      return;
    }
    setWebhooks(current => current.map(item => (item.id === hook.id ? { ...item, ...response.data.webhook } : item)));
    if (body.test)
      toast({
        message: response.data.webhook.lastError
          ? t("settings.webhooks.testFailed", { error: response.data.webhook.lastError })
          : t("settings.webhooks.testOk"),
      });
  }

  async function deleteWebhook(hook: Webhook) {
    if (!(await confirm({ title: t("settings.webhooks.deleteTitle"), confirmLabel: t("common.delete"), danger: true }))) return;
    const response = await api(`/api/workspaces/${slug}/webhooks/${hook.id}`, { method: "DELETE" });
    if (response.ok) setWebhooks(current => current.filter(item => item.id !== hook.id));
    else fail(response.data.error);
  }

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ message: t("common.copied") });
    } catch {
      /* clipboard blocked */
    }
  };
  const sections = ["general", "columns", "members", "import", "integrations"] as const;
  return (
    <div className="settings-layout">
      <nav className="settings-nav" aria-label={t("settings.sections")}>
        {sections.map(section => (
          <a key={section} href={`#${section}`}>
            {t(`settings.nav.${section}`)}
          </a>
        ))}
      </nav>
      <div className="settings-stack">
        <section id="general" className="panel">
          <div className="panel-head">
            <div>
              <h2>{t("settings.nav.general")}</h2>
              <p>{t("settings.general.description")}</p>
            </div>
          </div>
          <form onSubmit={saveGeneral} className="stack">
            <div className="form-grid">
              <div className="field">
                <label htmlFor="set-name">{t("home.create.name")}</label>
                <input
                  id="set-name"
                  value={general.name}
                  onChange={event => setGeneral({ ...general, name: event.target.value })}
                  required
                  maxLength={100}
                />
              </div>
              <div className="field">
                <label htmlFor="set-locale">{t("home.create.language")}</label>
                <select id="set-locale" value={general.locale} onChange={event => setGeneral({ ...general, locale: event.target.value })}>
                  {LANGUAGES.map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </select>
                <small>{t("settings.general.languageHint")}</small>
              </div>
            </div>
            <label className="switch">
              <span>
                <strong>{t("settings.general.dictation")}</strong>
                <span>{t("settings.general.dictationHint")}</span>
              </span>
              <input
                type="checkbox"
                checked={general.dictationEnabled}
                onChange={event => setGeneral({ ...general, dictationEnabled: event.target.checked })}
              />
            </label>
            <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="field-label">{t("settings.general.model")}</legend>
              <small>{t("settings.general.modelHint")}</small>
              <div className="stack" style={{ gap: 8, marginTop: 8 }}>
                {models.map(model => (
                  <label key={model.id} className="check" style={{ alignItems: "flex-start" }}>
                    <input
                      type="radio"
                      name="planModel"
                      checked={general.planModel === model.id}
                      onChange={() => setGeneral({ ...general, planModel: model.id })}
                    />
                    <span>
                      <strong>{model.label}</strong>
                      {model.recommended && (
                        <span className="badge primary" style={{ marginLeft: 6 }}>
                          {t("settings.general.recommended")}
                        </span>
                      )}
                      <br />
                      <span className="subtle">{model.note}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <button className="btn primary" disabled={busy === "general"}>
                {t("common.save")}
              </button>
            </div>
          </form>
        </section>

        <section id="columns" className="panel">
          <div className="panel-head">
            <div>
              <h2>{t("settings.nav.columns")}</h2>
              <p>{t("settings.columns.description")}</p>
            </div>
            <span className="badge">{columns.length}/12</span>
          </div>
          <div>
            {columns.map((column, index) => (
              <form
                key={column.id}
                className="column-row"
                onSubmit={event => {
                  event.preventDefault();
                  void saveColumn(column, event.currentTarget);
                }}
              >
                <span className="row" style={{ gap: 2 }}>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => void moveColumn(index, -1)}
                    disabled={index === 0}
                    aria-label={t("settings.columns.moveLeft")}
                  >
                    <Icon name="chevronUp" size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => void moveColumn(index, 1)}
                    disabled={index === columns.length - 1}
                    aria-label={t("settings.columns.moveRight")}
                  >
                    <Icon name="chevronDown" size={16} />
                  </button>
                </span>
                <input name="title" defaultValue={column.title} required maxLength={80} aria-label={t("settings.columns.title")} />
                <input
                  name="description"
                  defaultValue={column.description}
                  maxLength={500}
                  aria-label={t("settings.columns.descriptionField")}
                  placeholder={t("settings.columns.descriptionPlaceholder")}
                />
                <button className="btn sm">{t("common.save")}</button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => void removeColumn(column)}
                  disabled={columns.length === 1}
                  aria-label={t("settings.columns.delete", { title: column.title })}
                >
                  <Icon name="trash" size={16} />
                </button>
              </form>
            ))}
          </div>
          {columns.length < 12 && (
            <form onSubmit={addColumn} className="column-row" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1.4fr) auto" }}>
              <input
                name="title"
                required
                maxLength={80}
                placeholder={t("settings.columns.newTitle")}
                aria-label={t("settings.columns.newTitle")}
              />
              <input
                name="description"
                maxLength={500}
                placeholder={t("settings.columns.descriptionPlaceholder")}
                aria-label={t("settings.columns.descriptionField")}
              />
              <button className="btn sm">
                <Icon name="plus" size={15} />
                {t("settings.columns.add")}
              </button>
            </form>
          )}
        </section>

        <section id="members" className="panel">
          <div className="panel-head">
            <div>
              <h2>{t("settings.nav.members")}</h2>
              <p>{t("settings.members.description")}</p>
            </div>
          </div>
          <form className="invite-form" onSubmit={invite}>
            <input name="email" type="email" required placeholder="nome@azienda.it" aria-label={t("settings.members.email")} />
            <select name="role" defaultValue="MEMBER" aria-label={t("settings.members.role")}>
              <option value="MEMBER">
                {t("roles.MEMBER")} · {t("roles.MEMBER_hint")}
              </option>
              <option value="ADMIN">
                {t("roles.ADMIN")} · {t("roles.ADMIN_hint")}
              </option>
              {guestsAllowed && (
                <option value="GUEST">
                  {t("roles.GUEST")} · {t("roles.GUEST_hint")}
                </option>
              )}
            </select>
            <button className="btn primary" disabled={busy === "invite"}>
              <Icon name="mail" size={15} />
              {t("settings.members.invite")}
            </button>
          </form>
          {!guestsAllowed && (
            <p className="subtle" style={{ marginTop: 8 }}>
              {t("settings.members.guestsUpsell")}
            </p>
          )}
          {inviteLink && (
            <div className="secret-box" style={{ marginTop: 10 }}>
              <span style={{ flex: 1 }}>{inviteLink}</span>
              <button type="button" className="btn sm" onClick={() => void copy(inviteLink)}>
                <Icon name="copy" size={14} />
                {t("common.copy")}
              </button>
            </div>
          )}
          <div style={{ marginTop: 16 }}>
            {members.map(member => (
              <div key={member.id} className="member-row">
                <Avatar name={member.name} />
                <div className="who">
                  <strong>
                    {member.name}
                    {member.id === meId && ` (${t("settings.members.you")})`}
                  </strong>
                  <span>{member.email}</span>
                </div>
                {isOwner && member.id !== meId ? (
                  <>
                    <select
                      value={member.role}
                      onChange={event => void changeRole(member, event.target.value)}
                      aria-label={t("settings.members.roleOf", { name: member.name })}
                    >
                      {["OWNER", "ADMIN", "MEMBER", ...(guestsAllowed || member.role === "GUEST" ? ["GUEST"] : [])].map(role => (
                        <option key={role} value={role}>
                          {t(`roles.${role}`)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => void removeMember(member)}
                      aria-label={t("settings.members.removeTitle", { name: member.name })}
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </>
                ) : (
                  <span className="badge">{t(`roles.${member.role}`)}</span>
                )}
              </div>
            ))}
          </div>
          {invites.length > 0 && (
            <>
              <h3 style={{ marginTop: 20, fontSize: 14 }}>{t("settings.members.pending")}</h3>
              {invites.map(item => (
                <div key={item.id} className="member-row">
                  <span className="avatar">
                    <Icon name="mail" size={13} />
                  </span>
                  <div className="who">
                    <strong>{item.email}</strong>
                    <span>
                      {t(`roles.${item.role}`)} ·{" "}
                      {t("settings.members.expires", {
                        date: new Date(item.expiresAt).toLocaleDateString(tag, { day: "numeric", month: "short" }),
                      })}
                    </span>
                  </div>
                  <button type="button" className="btn sm" onClick={() => void resend(item)}>
                    {t("settings.members.resend")}
                  </button>
                  <button type="button" className="btn sm danger" onClick={() => void revoke(item)}>
                    {t("settings.members.revoke")}
                  </button>
                </div>
              ))}
            </>
          )}
        </section>

        <section id="import" className="panel">
          <div className="panel-head">
            <div>
              <h2>{t("settings.nav.import")}</h2>
              <p>{t("settings.import.description")}</p>
            </div>
          </div>
          <form onSubmit={importFile} className="form-grid">
            <div className="field">
              <label htmlFor="import-format">{t("settings.import.format")}</label>
              <select id="import-format" name="format" defaultValue="trello">
                <option value="trello">{t("home.create.importTrello")}</option>
                <option value="csv">{t("home.create.importCsv")}</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="import-file">{t("home.create.importFile")}</label>
              <input id="import-file" name="file" type="file" accept=".json,.csv,application/json,text/csv" required />
            </div>
            <div>
              <button className="btn" disabled={busy === "import"}>
                <Icon name="upload" size={15} />
                {t("settings.import.cta")}
              </button>
            </div>
          </form>
          <p className="subtle" style={{ marginTop: 10 }}>
            {t("home.create.csvHint")}
          </p>
        </section>

        <section id="integrations" className="panel">
          <div className="panel-head">
            <div>
              <h2>{t("settings.nav.integrations")}</h2>
              <p>{t("settings.webhooks.description")}</p>
            </div>
          </div>
          <form onSubmit={addWebhook} className="stack">
            <div className="form-grid">
              <div className="field">
                <label htmlFor="hook-url">URL</label>
                <input id="hook-url" name="url" type="url" required placeholder="https://hooks.slack.com/services/…" />
              </div>
              <div className="field">
                <label htmlFor="hook-format">{t("settings.webhooks.format")}</label>
                <select id="hook-format" name="format" defaultValue="json">
                  <option value="json">{t("settings.webhooks.json")}</option>
                  <option value="slack">{t("settings.webhooks.slack")}</option>
                </select>
              </div>
            </div>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="field-label">{t("settings.webhooks.events")}</legend>
              <div className="row" style={{ marginTop: 6 }}>
                {webhookEvents.map(name => (
                  <label key={name} className="check">
                    <input type="checkbox" name="events" value={name} defaultChecked />
                    {t(`settings.webhooks.eventNames.${name.replace(/\./g, "_")}`)}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <button className="btn">
                <Icon name="plus" size={15} />
                {t("settings.webhooks.add")}
              </button>
            </div>
          </form>
          {secret && (
            <div className="notice info" style={{ marginTop: 12 }}>
              <Icon name="key" />
              <div className="notice-body">
                {t("settings.webhooks.secret")}
                <div className="secret-box" style={{ marginTop: 6 }}>
                  <span style={{ flex: 1 }}>{secret}</span>
                  <button type="button" className="btn sm" onClick={() => void copy(secret)}>
                    {t("common.copy")}
                  </button>
                </div>
              </div>
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            {webhooks.map(hook => (
              <div key={hook.id} className="member-row">
                <span className="avatar">
                  <Icon name="link" size={13} />
                </span>
                <div className="who">
                  <strong style={{ overflowWrap: "anywhere" }}>{hook.url}</strong>
                  <span>
                    {hook.format === "slack" ? "Slack/Teams" : "JSON"} ·{" "}
                    {hook.active ? t("settings.webhooks.active") : t("settings.webhooks.paused")}
                    {hook.lastStatus ? ` · HTTP ${hook.lastStatus}` : ""}
                  </span>
                </div>
                <button type="button" className="btn sm" onClick={() => void webhookAction(hook, { test: true })}>
                  {t("settings.webhooks.test")}
                </button>
                <button type="button" className="btn sm" onClick={() => void webhookAction(hook, { active: !hook.active })}>
                  {hook.active ? t("settings.webhooks.pause") : t("settings.webhooks.resume")}
                </button>
                <button type="button" className="icon-btn" onClick={() => void deleteWebhook(hook)} aria-label={t("common.delete")}>
                  <Icon name="trash" size={16} />
                </button>
              </div>
            ))}
          </div>
          <p className="subtle" style={{ marginTop: 12 }}>
            {t("settings.webhooks.apiHint")}
          </p>
        </section>
      </div>
    </div>
  );
}
