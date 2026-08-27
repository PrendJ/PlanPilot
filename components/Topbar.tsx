"use client";
import { Brand } from "./Brand";
import { ThemeToggle } from "./ThemeToggle";
import { useRouter } from "next/navigation";

export function Topbar({ loggedIn = false }: { loggedIn?: boolean }) {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }
  return <header className={`topbar ${loggedIn ? "authenticated" : "public"}`}><a href={loggedIn ? "/app" : "/"} aria-label="BoardCue AI, home"><Brand/></a><nav className="top-actions" aria-label={loggedIn ? "Navigazione account" : "Navigazione principale"}><ThemeToggle/>{loggedIn ? <><button className="btn ghost nav-home" onClick={() => router.push("/app")}>Home</button><button className="btn ghost" onClick={() => router.push("/workspaces")}>Board</button><button className="btn ghost" onClick={()=>router.push("/account")}>Account</button><button className="btn" onClick={logout}>Esci</button></> : <><button className="btn ghost" onClick={()=>router.push("/pricing")}>Prezzi</button><button className="btn ghost" onClick={() => router.push("/login")}>Accedi</button><button className="btn accent" onClick={() => router.push("/register")}>Prova gratis</button></>}</nav></header>;
}
