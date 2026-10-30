"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, useFeedback } from "./ui";
import { useI18n } from "./I18nProvider";

type Member = { userId: string; role: string; user: { name: string; email: string } };
type Space = { id: string; name: string; members: Member[]; boards: Array<{ id: string; name: string; slug: string }> };
type Data = {
  enabled: boolean;
  canManage: boolean;
  spaces: Space[];
  members: Member[];
  boards: Array<{ id: string; name: string; spaceId: string | null }>;
};

export function SpacesManager({ organizationId }: { organizationId: string }) {
  const { locale } = useI18n();
  const it = locale === "it";
  const { toast, confirm } = useFeedback();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState("");
  const load = useCallback(async () => {
    const response = await api<Data>(`/api/spaces?organizationId=${organizationId}`);
    if (response.ok) {
      setData(response.data);
      setError("");
    } else setError(response.data.error || (it ? "Impossibile caricare i workspace." : "Could not load workspaces."));
  }, [organizationId, it]);
  useEffect(() => {
    void load();
  }, [load]);
  async function mutate(path: string, json: unknown, method: "POST" | "PATCH" = "PATCH") {
    setBusy(true);
    try {
      const response = await api<{ invitePath?: string }>(path, { method, json });
      if (!response.ok) {
        toast({ message: response.data.error || "Errore", tone: "error" });
        return false;
      }
      if (response.data.invitePath) setInvite(new URL(response.data.invitePath, location.origin).href);
      await load();
      return true;
    } finally {
      setBusy(false);
    }
  }
  const roleLabel = (role: string) =>
    role === "ADMIN"
      ? it
        ? "Amministratore delle board"
        : "Board administrator"
      : role === "GUEST"
        ? it
          ? "Ospite"
          : "Guest"
        : it
          ? "Membro"
          : "Member";
  if (error)
    return (
      <div role="alert">
        {error}{" "}
        <button className="btn" onClick={() => void load()}>
          {it ? "Riprova" : "Retry"}
        </button>
      </div>
    );
  if (!data) return <p role="status">{it ? "Caricamento…" : "Loading…"}</p>;
  return (
    <div className="settings-stack">
      <p>
        {it
          ? "Separa board e persone per reparto o progetto. Tutti i workspace condividono i posti acquistati e le quote del piano."
          : "Separate boards and people by department or project. All workspaces share the plan’s purchased seats and allowances."}
      </p>
      {!data.enabled && (
        <p className="notice">
          {it
            ? "La creazione di più workspace è disponibile con Family, Team e Business."
            : "Multiple workspaces are available with Family, Team and Business."}
        </p>
      )}
      {data.canManage && (
        <form
          className="panel row"
          onSubmit={async event => {
            event.preventDefault();
            const form = event.currentTarget;
            if (await mutate("/api/spaces", { organizationId, name: new FormData(form).get("name") }, "POST")) form.reset();
          }}
        >
          <label htmlFor="new-space">{it ? "Nuovo workspace" : "New workspace"}</label>
          <input id="new-space" name="name" required maxLength={100} placeholder={it ? "Es. Marketing" : "e.g. Marketing"} />
          <button className="btn primary" disabled={busy}>
            {it ? "Crea workspace" : "Create workspace"}
          </button>
        </form>
      )}
      {invite && (
        <div className="panel" role="status">
          <label htmlFor="space-invite">
            {it
              ? "Condividi questo invito con la persona indicata. Scade fra 7 giorni e sarà accettato solo se ci sono posti disponibili."
              : "Share this invitation with the named person. It expires in 7 days and can be accepted only if seats are available."}
          </label>
          <input id="space-invite" readOnly value={invite} onFocus={event => event.target.select()} />
        </div>
      )}
      {!data.spaces.length && <p>{it ? "Non ci sono ancora workspace." : "No workspaces yet."}</p>}
      {data.spaces.map(space => (
        <section className="panel settings-stack" key={space.id}>
          <h2>{space.name}</h2>
          {data.canManage && (
            <form
              className="row"
              onSubmit={event => {
                event.preventDefault();
                void mutate(`/api/spaces/${space.id}`, { action: "rename", name: new FormData(event.currentTarget).get("name") });
              }}
            >
              <input
                name="name"
                key={space.name}
                defaultValue={space.name}
                required
                maxLength={100}
                aria-label={it ? "Nome workspace" : "Workspace name"}
              />
              <button className="btn" disabled={busy}>
                {it ? "Rinomina" : "Rename"}
              </button>
            </form>
          )}
          <h3>{it ? "Persone" : "People"}</h3>
          <ul>
            {space.members.map(member => (
              <li key={member.userId} className="row">
                <span>
                  {member.user.name} <small>{member.user.email}</small>
                </span>
                {data.canManage ? (
                  <>
                    <select
                      aria-label={`${it ? "Ruolo di" : "Role for"} ${member.user.name}`}
                      value={member.role}
                      disabled={busy}
                      onChange={event =>
                        void mutate(`/api/spaces/${space.id}`, { action: "member", userId: member.userId, role: event.target.value })
                      }
                    >
                      {["ADMIN", "MEMBER", "GUEST"].map(role => (
                        <option key={role} value={role}>
                          {roleLabel(role)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn sm"
                      disabled={busy}
                      onClick={async () => {
                        if (
                          await confirm({
                            title: it ? `Rimuovere ${member.user.name} dal workspace?` : `Remove ${member.user.name} from the workspace?`,
                            message: it
                              ? "Gli accessi ereditati alle board verranno revocati. Gli inviti diretti alle singole board rimangono validi."
                              : "Inherited board access will be revoked. Direct board invitations remain valid.",
                          })
                        )
                          await mutate(`/api/spaces/${space.id}`, { action: "member", userId: member.userId, role: null });
                      }}
                    >
                      {it ? "Rimuovi" : "Remove"}
                    </button>
                  </>
                ) : (
                  <small>{roleLabel(member.role)}</small>
                )}
              </li>
            ))}
          </ul>
          {data.canManage && (
            <>
              <form
                className="row"
                onSubmit={event => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  void mutate(`/api/spaces/${space.id}`, { action: "member", userId: form.get("userId"), role: "MEMBER" });
                }}
              >
                <select
                  name="userId"
                  key={space.members.map(member => member.userId).join(",")}
                  required
                  aria-label={it ? "Persona da aggiungere" : "Person to add"}
                  defaultValue=""
                >
                  <option value="" disabled>
                    {it ? "Aggiungi una persona del piano" : "Add someone from the plan"}
                  </option>
                  {data.members
                    .filter(member => member.role !== "GUEST" && !space.members.some(item => item.userId === member.userId))
                    .map(member => (
                      <option key={member.userId} value={member.userId}>
                        {member.user.name} — {member.user.email}
                      </option>
                    ))}
                </select>
                <button className="btn" disabled={busy}>
                  {it ? "Aggiungi" : "Add"}
                </button>
              </form>
              <form
                className="row"
                onSubmit={event => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  void mutate(`/api/spaces/${space.id}`, { action: "invite", email: form.get("email"), role: form.get("role") });
                }}
              >
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="email"
                  aria-label={it ? "Email della persona da invitare" : "Invitee email"}
                />
                <select name="role" aria-label={it ? "Ruolo invito" : "Invitation role"}>
                  {["MEMBER", "ADMIN", "GUEST"].map(role => (
                    <option key={role} value={role}>
                      {roleLabel(role)}
                    </option>
                  ))}
                </select>
                <button className="btn" disabled={busy}>
                  {it ? "Crea invito" : "Create invitation"}
                </button>
              </form>
            </>
          )}
          <h3>Board</h3>
          <ul>
            {space.boards.map(board => (
              <li key={board.id} className="row">
                <Link href={`/app/${board.slug}`}>{board.name}</Link>
                {data.canManage && (
                  <button
                    className="btn sm"
                    disabled={busy}
                    onClick={() => void mutate(`/api/spaces/${space.id}`, { action: "board", boardId: board.id, remove: true })}
                  >
                    {it ? "Sposta fuori dal workspace" : "Move out of workspace"}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {data.canManage && (
            <form
              className="row"
              onSubmit={event => {
                event.preventDefault();
                void mutate(`/api/spaces/${space.id}`, { action: "board", boardId: new FormData(event.currentTarget).get("boardId") });
              }}
            >
              <select
                name="boardId"
                key={space.boards.map(board => board.id).join(",")}
                required
                defaultValue=""
                aria-label={it ? "Board da spostare" : "Board to move"}
              >
                <option value="" disabled>
                  {it ? "Sposta una board qui" : "Move a board here"}
                </option>
                {data.boards
                  .filter(board => board.spaceId !== space.id)
                  .map(board => (
                    <option key={board.id} value={board.id}>
                      {board.name}
                    </option>
                  ))}
              </select>
              <button className="btn" disabled={busy}>
                {it ? "Sposta" : "Move"}
              </button>
              <small>
                {it
                  ? "I membri del workspace riceveranno accesso. I membri invitati direttamente alla board manterranno il proprio accesso."
                  : "Workspace members will gain access. Direct board members will keep their access."}
              </small>
            </form>
          )}
          <Link className="btn" href={`/app?space=${space.id}`}>
            {it ? "Apri le board del workspace" : "Open workspace boards"}
          </Link>
        </section>
      ))}
    </div>
  );
}
