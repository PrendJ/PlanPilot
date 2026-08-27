"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Workspace = { id:string; name:string; slug:string; role:string; organizationId:string; organizationName:string; lifecycleStatus:string };
type Organization = { id:string; name:string; plan:string; locale:string; isDefault:boolean };
const presets = [["GENERAL","Generico"],["SOFTWARE","Sviluppo software"],["MARKETING","Marketing"],["PROJECT","Project management"],["CONSULTING","Consulenza / Clienti"]];
const languages = [["it","Italiano"],["en","English"],["de","Deutsch"],["fr","Français"],["es","Español"],["ru","Русский"],["pl","Polski"]];

export function WorkspaceList({ workspaces: initialWorkspaces, organizations, defaultOrganizationId }: { workspaces: Workspace[]; organizations: Organization[]; defaultOrganizationId:string }) {
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
    try {
      const response = await fetch("/api/workspaces", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({name:data.get("name"),organizationId:data.get("organizationId"),presetKey:data.get("presetKey"),locale:data.get("locale")}) });
      const body = await response.json().catch(()=>({}));
      if (!response.ok) return setError(body.error || "Non è stato possibile creare la board. Controlla i dati e riprova.");
      router.push(`/app/${body.workspace.slug}`); router.refresh();
    } catch {
      setError("Connessione non disponibile. La board non è stata creata: riprova.");
    } finally {
      setBusy("");
    }
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
    {organizations.length>0&&<form id="new-workspace" className="create-box" onSubmit={create}><div className="create-box-head"><div><span className="eyebrow">NUOVA BOARD</span><h2>Cosa vuoi organizzare?</h2><p>Uno spazio di lavoro raccoglie colonne e card di un progetto. Per iniziare basta il nome.</p></div></div><div className="field workspace-name-field"><label htmlFor="workspace-name">Nome della board</label><input id="workspace-name" name="name" placeholder="Es. Lancio del nuovo sito" required minLength={2} maxLength={100}/><small>Scegli un nome riconoscibile anche per chi inviterai.</small></div>{organizations.length===1?<input type="hidden" name="organizationId" value={organizations[0].id}/>:<div className="field"><label htmlFor="workspace-organization">Dove crearla?</label><select id="workspace-organization" name="organizationId" required defaultValue={defaultOrganizationId}>{organizations.map(org=><option value={org.id} key={org.id}>{org.name}{org.isDefault?" · predefinita":""}</option>)}</select></div>}<details className="advanced-options"><summary>Personalizza il punto di partenza</summary><p>Scegli un modello di colonne e la lingua. Potrai cambiare entrambi in seguito.</p><div className="create-workspace-grid"><label htmlFor="workspace-preset">Modello<select id="workspace-preset" name="presetKey" defaultValue="GENERAL">{presets.map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label><label htmlFor="workspace-locale">Lingua<select id="workspace-locale" name="locale" defaultValue={organizations.find(org=>org.id===defaultOrganizationId)?.locale||"it"}>{languages.map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label></div></details><button className="btn accent create-workspace-submit" disabled={busy==="create"}>{busy==="create"?"Creo la board…":"Crea e apri la board"}</button></form>}
  </div>;
}
