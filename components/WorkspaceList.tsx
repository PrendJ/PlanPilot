"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Workspace = { id:string; name:string; slug:string; role:string; organizationId:string; organizationName:string; lifecycleStatus:string };
type Organization = { id:string; name:string; plan:string; locale:string };
const presets = [["GENERAL","Generico"],["SOFTWARE","Sviluppo software"],["MARKETING","Marketing"],["PROJECT","Project management"],["CONSULTING","Consulenza / Clienti"]];
const languages = [["it","Italiano"],["en","English"],["de","Deutsch"],["fr","Français"],["es","Español"],["ru","Русский"],["pl","Polski"]];

export function WorkspaceList({ workspaces: initialWorkspaces, organizations }: { workspaces: Workspace[]; organizations: Organization[] }) {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState(initialWorkspaces);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; items: Workspace[] }>();
    for (const workspace of workspaces.filter(item => item.lifecycleStatus === (showArchived ? "ARCHIVED" : "ACTIVE"))) {
      const group = map.get(workspace.organizationId) || { name: workspace.organizationName, items: [] };
      group.items.push(workspace); map.set(workspace.organizationId, group);
    }
    return [...map.entries()];
  }, [workspaces, showArchived]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy("create"); setError("");
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/workspaces", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({name:data.get("name"),organizationId:data.get("organizationId"),presetKey:data.get("presetKey"),locale:data.get("locale")}) });
    const body = await response.json(); setBusy("");
    if (!response.ok) return setError(body.error || "Creazione non riuscita");
    router.push(`/app/${body.workspace.slug}`); router.refresh();
  }

  async function change(workspace: Workspace, action: "rename" | "archive" | "restore") {
    let name: string | undefined;
    if (action === "rename") { const value = window.prompt("Nuovo nome del workspace", workspace.name)?.trim(); if (!value || value === workspace.name) return; name = value; }
    if (action === "archive" && !window.confirm(`Archiviare “${workspace.name}”? Potrai ripristinarlo in seguito.`)) return;
    setBusy(workspace.id); setError("");
    const response = await fetch(`/api/workspaces/${workspace.slug}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({action,...(name&&{name})}) });
    const body = await response.json(); setBusy("");
    if (!response.ok) return setError(body.error || "Aggiornamento non riuscito");
    setWorkspaces(current => current.map(item => item.id === workspace.id ? {...item,name:body.workspace.name,lifecycleStatus:body.workspace.lifecycleStatus} : item));
    router.refresh();
  }

  return <div className="workspace-manager">
    <div className="workspace-manager-toolbar"><div className="workspace-view-toggle"><button className={`btn ${!showArchived?"accent":"ghost"}`} onClick={()=>setShowArchived(false)}>Attivi</button><button className={`btn ${showArchived?"accent":"ghost"}`} onClick={()=>setShowArchived(true)}>Archiviati</button></div><span>{workspaces.filter(item=>item.lifecycleStatus===(showArchived?"ARCHIVED":"ACTIVE")).length} workspace</span></div>
    {error&&<div className="status error">{error}</div>}
    <div className="workspace-groups">{grouped.map(([organizationId,group])=><section className="workspace-group" key={organizationId}><div className="settings-head"><div><h2>{group.name}</h2><p>{group.items.length} workspace {showArchived?"archiviati":"attivi"}</p></div></div><div className="workspace-grid">{group.items.map(workspace=><article className="workspace-tile managed" key={workspace.id}><div><span className="pill">{workspace.role}</span><h3>{workspace.name}</h3><p>{workspace.organizationName}</p></div><div className="workspace-tile-actions">{workspace.lifecycleStatus==="ACTIVE"&&<a className="btn accent" href={`/app/${workspace.slug}`}>Apri</a>}{["OWNER","ADMIN"].includes(workspace.role)&&workspace.lifecycleStatus==="ACTIVE"&&<><button className="btn ghost" disabled={busy===workspace.id} onClick={()=>change(workspace,"rename")}>Rinomina</button><a className="btn ghost" href={`/app/${workspace.slug}/settings`}>Impostazioni</a></>}{workspace.role==="OWNER"&&(workspace.lifecycleStatus==="ARCHIVED"?<button className="btn" disabled={busy===workspace.id} onClick={()=>change(workspace,"restore")}>Ripristina</button>:<button className="btn danger" disabled={busy===workspace.id} onClick={()=>change(workspace,"archive")}>Archivia</button>)}</div></article>)}</div></section>)}{!grouped.length&&<div className="empty-state"><h3>{showArchived?"Nessun workspace archiviato":"Nessun workspace attivo"}</h3><p>{showArchived?"Gli elementi archiviati compariranno qui.":"Crea un workspace per iniziare."}</p></div>}</div>
    {organizations.length>0&&<form className="create-box" onSubmit={create}><div className="create-box-head"><div><h2>Nuovo workspace</h2><p>Crea una board usando uno dei flussi preconfigurati.</p></div><span className="pill">NUOVO</span></div><div className="create-workspace-grid"><label>Organizzazione<select name="organizationId" required>{organizations.map(org=><option value={org.id} key={org.id}>{org.name} · {org.plan}</option>)}</select></label><label>Nome<input name="name" placeholder="Es. Progetto cliente" required maxLength={100}/></label><label>Preset<select name="presetKey" defaultValue="GENERAL">{presets.map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label><label>Lingua<select name="locale" defaultValue={organizations[0]?.locale||"it"}>{languages.map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label></div><button className="btn accent" disabled={busy==="create"}>{busy==="create"?"Creo…":"Crea workspace"}</button></form>}
  </div>;
}
