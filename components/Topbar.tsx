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
  return <div className="topbar"><Brand/><div className="top-actions"><ThemeToggle/>{loggedIn ? <><button className="btn ghost" onClick={() => router.push("/app")}>Home</button><button className="btn ghost" onClick={() => router.push("/workspaces")}>Workspace</button><button className="btn ghost" onClick={()=>router.push("/account")}>Account</button><button className="btn" onClick={logout}>Logout</button></> : <><button className="btn ghost" onClick={()=>router.push("/pricing")}>Prezzi</button><button className="btn ghost" onClick={() => router.push("/login")}>Login</button><button className="btn accent" onClick={() => router.push("/register")}>Prova gratis</button></>}</div></div>;
}
