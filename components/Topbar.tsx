"use client";
import { Brand } from "./Brand";
import { useRouter } from "next/navigation";

export function Topbar({ loggedIn = false }: { loggedIn?: boolean }) {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }
  return <div className="topbar"><Brand/><div className="top-actions">{loggedIn ? <><button className="btn ghost" onClick={() => router.push("/app")}>Workspaces</button><button className="btn" onClick={logout}>Logout</button></> : <><button className="btn ghost" onClick={() => router.push("/login")}>Login</button><button className="btn primary" onClick={() => router.push("/login")}>Open board</button></>}</div></div>;
}
