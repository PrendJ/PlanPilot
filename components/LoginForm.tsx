"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(""); setLoading(true);
    const data = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: data.get("email"), password: data.get("password") }) });
    const body = await res.json(); setLoading(false);
    if (!res.ok) return setError(body.error || "Login failed");
    router.push(new URLSearchParams(window.location.search).get("next") || "/app"); router.refresh();
  }
  return <form onSubmit={submit}><div className="field"><label>Email</label><input name="email" type="email" autoComplete="email" required/></div><div className="field"><label>Password</label><input name="password" type="password" autoComplete="current-password" required minLength={8}/></div>{error && <div className="form-error">{error}</div>}<button className="btn accent" style={{width:"100%",marginTop:8}} disabled={loading}>{loading ? "Accesso…" : "Entra"}</button><div className="auth-links"><a href="/forgot-password">Password dimenticata?</a><a href="/register">Crea account</a></div></form>;
}
