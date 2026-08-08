"use client";
import { FormEvent, useState } from "react";
import type { ModelOption } from "@/lib/model-catalog";

type Workspace={name:string;slug:string;planModel:string;transcriptionModel:string;dictationEnabled:boolean};

function ModelCards({name,models,current}:{name:string;models:ModelOption[];current:string}){
  return <div className="model-grid">{models.map(m=><label className={`model-option ${current===m.id?"selected":""}`} key={m.id}><div className="model-radio"><input type="radio" name={name} value={m.id} defaultChecked={current===m.id}/><strong>{m.label}</strong>{m.recommended&&<span className="mini-badge">consigliato</span>}{m.baseline&&<span className="mini-badge neutral">attuale</span>}</div><div className="model-price">{m.price}</div>{m.context&&<div className="model-context">Contesto: {m.context}</div>}<p>{m.note}</p></label>)}</div>;
}

export function WorkspaceSettings({workspace,planModels,transcriptionModels}:{workspace:Workspace;planModels:ModelOption[];transcriptionModels:ModelOption[]}){
  const [saved,setSaved]=useState(""); const [error,setError]=useState(""); const [dictation,setDictation]=useState(workspace.dictationEnabled);
  async function save(e:FormEvent<HTMLFormElement>){e.preventDefault();setSaved("");setError("");const fd=new FormData(e.currentTarget);const r=await fetch(`/api/admin/workspaces/${workspace.slug}/settings`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({dictationEnabled:fd.get("dictationEnabled")==="on",planModel:fd.get("planModel"),transcriptionModel:fd.get("transcriptionModel")})});const b=await r.json();if(!r.ok)return setError(b.error||"Errore salvataggio");setSaved("Impostazioni salvate");}
  return <form className="settings-stack" onSubmit={save}><section className="settings-card"><div className="settings-head"><div><h2>Modello AI del piano</h2><p>Sono proposte soprattutto opzioni con costo inferiore a GPT-5 Nano; Nano resta disponibile come benchmark.</p></div></div><ModelCards name="planModel" models={planModels} current={workspace.planModel}/></section><section className="settings-card"><div className="settings-head"><div><h2>Dettatura</h2><p>La dettatura può essere disabilitata completamente per questo workspace.</p></div><label className="switch-row"><input name="dictationEnabled" type="checkbox" checked={dictation} onChange={e=>setDictation(e.target.checked)}/><span>{dictation?"Attiva":"Disattiva"}</span></label></div><div className={dictation?"":"disabled-section"}><ModelCards name="transcriptionModel" models={transcriptionModels} current={workspace.transcriptionModel}/></div></section>{saved&&<div className="status">{saved}</div>}{error&&<div className="status error">{error}</div>}<button className="btn accent" type="submit">Salva impostazioni</button></form>;
}
