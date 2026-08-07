"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Workspace = { id:string; name:string; slug:string; role:string; openrouterKeyEnv:string };
export function WorkspaceList({ workspaces, canCreate }: { workspaces: Workspace[]; canCreate: boolean }) {
  const router = useRouter(); const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError("");
    const fd=new FormData(e.currentTarget); const name=String(fd.get("name")||"");
    const r=await fetch("/api/workspaces",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name})}); const b=await r.json(); setBusy(false);
    if(!r.ok) return setError(b.error||"Errore");
    router.push(`/app/${b.workspace.slug}`); router.refresh();
  }
  return <><div className="workspace-grid">{workspaces.map(w=><a className="workspace-tile" href={`/app/${w.slug}`} key={w.id}><span className="pill">{w.role}</span><h3>{w.name}</h3><p>{w.openrouterKeyEnv}</p></a>)}</div>{canCreate && <form className="create-box" onSubmit={create}><div style={{fontWeight:750,marginBottom:10}}>Nuovo workspace</div><div className="create-row"><input name="name" placeholder="Es. UNGUESS AI plan" required/><button className="btn accent" disabled={busy}>{busy?"Creo…":"Crea"}</button></div>{error&&<div className="form-error">{error}</div>}</form>}</>;
}
