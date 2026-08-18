"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Workspace = { id:string; name:string; slug:string; role:string; organizationId:string };
type Organization = { id:string; name:string; plan:string; locale:string };
const presets = [["GENERAL","Generico"],["SOFTWARE","Sviluppo software"],["MARKETING","Marketing"],["PROJECT","Project management"],["CONSULTING","Consulenza / Clienti"]];
export function WorkspaceList({ workspaces, organizations }: { workspaces: Workspace[]; organizations: Organization[] }) {
  const router = useRouter(); const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError("");
    const fd=new FormData(e.currentTarget);
    const r=await fetch("/api/workspaces",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:fd.get("name"),organizationId:fd.get("organizationId"),presetKey:fd.get("presetKey"),locale:fd.get("locale")})}); const b=await r.json(); setBusy(false);
    if(!r.ok) return setError(b.error||"Errore");
    router.push(`/app/${b.workspace.slug}`); router.refresh();
  }
  return <><div className="workspace-grid">{workspaces.map(w=><a className="workspace-tile" href={`/app/${w.slug}`} key={w.id}><span className="pill">{w.role}</span><h3>{w.name}</h3><p>{organizations.find(o=>o.id===w.organizationId)?.name || "Organizzazione"}</p></a>)}</div>{organizations.length>0 && <form className="create-box" onSubmit={create}><div style={{fontWeight:750,marginBottom:10}}>Nuovo workspace</div><div className="create-workspace-grid"><label>Organizzazione<select name="organizationId" required>{organizations.map(o=><option value={o.id} key={o.id}>{o.name} · {o.plan}</option>)}</select></label><label>Nome<input name="name" placeholder="Es. Progetto cliente" required/></label><label>Preset<select name="presetKey" defaultValue="GENERAL">{presets.map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label><label>Lingua<select name="locale" defaultValue={organizations[0]?.locale || "it"}>{[["it","Italiano"],["en","English"],["de","Deutsch"],["fr","Français"],["es","Español"],["ru","Русский"],["pl","Polski"]].map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label></div><button className="btn accent" disabled={busy}>{busy?"Creo…":"Crea workspace"}</button>{error&&<div className="form-error">{error}</div>}</form>}</>;
}
