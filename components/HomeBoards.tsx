"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "./Icon";
import { useI18n } from "./I18nProvider";
import { api, Dialog, MenuButton, useFeedback } from "./ui";

type BoardSummary = {
  id: string;
  name: string;
  slug: string;
  role: string;
  organizationId: string;
  organizationName: string;
  lifecycleStatus: string;
  cards: number;
  members: number;
  lanes: number[];
  updatedAt: string;
};
type Team = { id: string; name: string; locale: string; canCreate: boolean };

const PRESETS = ["GENERAL", "SOFTWARE", "MARKETING", "PROJECT", "CONSULTING"] as const;
const LANGUAGES = [
  ["it", "Italiano"],
  ["en", "English"],
  ["de", "Deutsch"],
  ["fr", "Français"],
  ["es", "Español"],
  ["ru", "Русский"],
  ["pl", "Polski"],
] as const;

export function HomeBoards({
  boards: initial,
  teams,
  defaultTeamId,
  defaultLocale,
}: {
  boards: BoardSummary[];
  teams: Team[];
  defaultTeamId: string;
  defaultLocale: string;
}) {
  const { t, tag } = useI18n();
  const { confirm, prompt, toast } = useFeedback();
  const router = useRouter();
  const [boards, setBoards] = useState(initial);
  const [archivedView, setArchivedView] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [importKind, setImportKind] = useState<"none" | "trello" | "csv">("none");
  const [file, setFile] = useState<File | null>(null);
  const shown = boards.filter(board => board.lifecycleStatus === (archivedView ? "ARCHIVED" : "ACTIVE"));
  const canCreate = teams.some(team => team.canCreate);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    const response = await api<{ workspace: { slug: string } }>("/api/workspaces", {
      method: "POST",
      json: {
        name: form.get("name"),
        organizationId: form.get("organizationId") || defaultTeamId,
        presetKey: form.get("presetKey"),
        locale: form.get("locale"),
      },
    });
    if (!response.ok) {
      setBusy(false);
      toast({ message: response.data.error || t("errors.SERVER_ERROR"), tone: "error" });
      return;
    }
    const slug = response.data.workspace.slug;
    if (importKind !== "none" && file) {
      const content = await file.text();
      const imported = await api<{ createdCards: number }>(`/api/workspaces/${slug}/import`, {
        method: "POST",
        json: { format: importKind, content },
      });
      if (imported.ok) toast({ message: t("home.create.imported", { count: imported.data.createdCards }) });
      else toast({ message: imported.data.error || t("errors.IMPORT_INVALID"), tone: "error" });
    }
    router.push(`/app/${slug}`);
  }

  async function rename(board: BoardSummary) {
    const name = await prompt({
      title: t("home.rename.title"),
      input: { label: t("home.create.name"), defaultValue: board.name },
      confirmLabel: t("common.save"),
    });
    if (!name || name === board.name) return;
    const response = await api<{ workspace: { name: string } }>(`/api/workspaces/${board.slug}`, {
      method: "PATCH",
      json: { action: "rename", name },
    });
    if (response.ok)
      setBoards(current => current.map(item => (item.id === board.id ? { ...item, name: response.data.workspace.name } : item)));
    else toast({ message: response.data.error || t("errors.SERVER_ERROR"), tone: "error" });
  }

  async function lifecycle(board: BoardSummary, action: "archive" | "restore") {
    if (
      action === "archive" &&
      !(await confirm({
        title: t("home.archive.title", { name: board.name }),
        message: t("home.archive.body"),
        confirmLabel: t("home.archive.cta"),
      }))
    )
      return;
    const response = await api<{ workspace: { lifecycleStatus: string } }>(`/api/workspaces/${board.slug}`, {
      method: "PATCH",
      json: { action },
    });
    if (!response.ok) {
      toast({ message: response.data.error || t("errors.SERVER_ERROR"), tone: "error" });
      return;
    }
    setBoards(current =>
      current.map(item => (item.id === board.id ? { ...item, lifecycleStatus: response.data.workspace.lifecycleStatus } : item)),
    );
    toast({ message: action === "archive" ? t("home.archive.done") : t("home.archive.restored") });
  }

  return (
    <section aria-labelledby="boards-title">
      <div className="row" style={{ marginBottom: 12 }}>
        <h2 id="boards-title">{t("home.boards")}</h2>
        <span className="spacer" />
        <div className="segmented" role="tablist" aria-label={t("home.boards")}>
          <button type="button" role="tab" aria-selected={!archivedView} onClick={() => setArchivedView(false)}>
            {t("home.active")}
          </button>
          <button type="button" role="tab" aria-selected={archivedView} onClick={() => setArchivedView(true)}>
            {t("home.archived")}
          </button>
        </div>
      </div>
      <div className="board-grid">
        {shown.map(board => (
          <article key={board.id} className="board-tile">
            <Link
              href={board.lifecycleStatus === "ACTIVE" ? `/app/${board.slug}` : "#"}
              aria-disabled={board.lifecycleStatus !== "ACTIVE"}
              style={{ display: "grid", gap: 10, flex: 1 }}
            >
              <span className="mini-lanes" aria-hidden="true">
                {(board.lanes.length ? board.lanes : [0, 0, 0]).slice(0, 6).map((count, index) => (
                  <i key={index} style={{ height: 8 + Math.min(count, 8) * 3 }} />
                ))}
              </span>
              <h3>{board.name}</h3>
              <span className="board-tile-meta">
                <Icon name="file" size={13} />
                {t("home.cards", { count: board.cards })}
                <Icon name="users" size={13} />
                {board.members}
                <span className="spacer" />
                {new Date(board.updatedAt).toLocaleDateString(tag, { day: "numeric", month: "short" })}
              </span>
            </Link>
            <div className="board-tile-menu">
              <MenuButton label={t("home.boardActions", { name: board.name })} icon="more">
                {close => (
                  <>
                    {board.lifecycleStatus === "ACTIVE" && (
                      <Link className="menu-item" href={`/app/${board.slug}`} onClick={close}>
                        <Icon name="arrowRight" />
                        {t("common.open")}
                      </Link>
                    )}
                    {["OWNER", "ADMIN"].includes(board.role) && board.lifecycleStatus === "ACTIVE" && (
                      <>
                        <button
                          type="button"
                          className="menu-item"
                          onClick={() => {
                            close();
                            void rename(board);
                          }}
                        >
                          <Icon name="edit" />
                          {t("home.rename.cta")}
                        </button>
                        <Link className="menu-item" href={`/app/${board.slug}/settings`} onClick={close}>
                          <Icon name="settings" />
                          {t("board.settings")}
                        </Link>
                      </>
                    )}
                    {board.role === "OWNER" &&
                      (board.lifecycleStatus === "ACTIVE" ? (
                        <button
                          type="button"
                          className="menu-item danger"
                          onClick={() => {
                            close();
                            void lifecycle(board, "archive");
                          }}
                        >
                          <Icon name="archive" />
                          {t("home.archive.cta")}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="menu-item"
                          onClick={() => {
                            close();
                            void lifecycle(board, "restore");
                          }}
                        >
                          <Icon name="undo" />
                          {t("home.archive.restore")}
                        </button>
                      ))}
                  </>
                )}
              </MenuButton>
            </div>
          </article>
        ))}
        {!archivedView && canCreate && (
          <button type="button" className="board-tile new" onClick={() => setCreating(true)}>
            <Icon name="plus" size={22} />
            {t("home.create.cta")}
          </button>
        )}
      </div>
      {!shown.length && (archivedView || !canCreate) && (
        <div className="empty-state">
          <h3>{archivedView ? t("home.emptyArchived") : t("home.empty")}</h3>
        </div>
      )}
      {creating && (
        <Dialog
          title={t("home.create.title")}
          description={t("home.create.description")}
          onClose={() => setCreating(false)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setCreating(false)}>
                {t("common.cancel")}
              </button>
              <button type="submit" form="create-board" className="btn primary" disabled={busy || (importKind !== "none" && !file)}>
                {busy ? <span className="spinner" /> : null}
                {t("home.create.submit")}
              </button>
            </>
          }
        >
          <form id="create-board" onSubmit={create} className="stack">
            <div className="field">
              <label htmlFor="board-name">{t("home.create.name")}</label>
              <input
                id="board-name"
                name="name"
                data-autofocus
                required
                minLength={2}
                maxLength={100}
                placeholder={t("home.create.namePlaceholder")}
              />
            </div>
            {teams.length > 1 && (
              <div className="field">
                <label htmlFor="board-team">{t("home.create.team")}</label>
                <select id="board-team" name="organizationId" defaultValue={defaultTeamId}>
                  {teams
                    .filter(team => team.canCreate)
                    .map(team => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                </select>
              </div>
            )}
            <div className="form-grid">
              <div className="field">
                <label htmlFor="board-preset">{t("home.create.template")}</label>
                <select id="board-preset" name="presetKey" defaultValue="GENERAL">
                  {PRESETS.map(key => (
                    <option key={key} value={key}>
                      {t(`presets.${key}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="board-locale">{t("home.create.language")}</label>
                <select id="board-locale" name="locale" defaultValue={defaultLocale}>
                  {LANGUAGES.map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </select>
                <small>{t("home.create.languageHint")}</small>
              </div>
            </div>
            <div className="field">
              <label htmlFor="board-import">{t("home.create.import")}</label>
              <select
                id="board-import"
                value={importKind}
                onChange={event => {
                  setImportKind(event.target.value as typeof importKind);
                  setFile(null);
                }}
              >
                <option value="none">{t("home.create.importNone")}</option>
                <option value="trello">{t("home.create.importTrello")}</option>
                <option value="csv">{t("home.create.importCsv")}</option>
              </select>
              {importKind !== "none" && (
                <>
                  <input
                    type="file"
                    accept={importKind === "trello" ? "application/json,.json" : "text/csv,.csv"}
                    onChange={event => setFile(event.target.files?.[0] || null)}
                    aria-label={t("home.create.importFile")}
                  />
                  <small>{importKind === "trello" ? t("home.create.trelloHint") : t("home.create.csvHint")}</small>
                </>
              )}
            </div>
          </form>
        </Dialog>
      )}
    </section>
  );
}
