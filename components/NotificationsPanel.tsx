"use client";
import { useEffect, useState } from "react";

export function NotificationsPanel({ registration, ios, standalone }: { registration: ServiceWorkerRegistration | null; ios: boolean; standalone: boolean }) {
  const [config, setConfig] = useState<{ enabled: boolean; publicKey: string | null; subscribed: boolean } | null>(null);
  const [message, setMessage] = useState("Caricamento preferenze…");
  const [busy, setBusy] = useState(false);
  const supported = typeof window !== "undefined" && "PushManager" in window && "Notification" in window && isSecureContext;
  useEffect(() => {
    let active = true;
    fetch("/api/notifications/subscription", { cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error(response.status === 401 ? "Accedi per attivare le notifiche dei progetti." : "Preferenze non disponibili. Riprova più tardi.");
      const value = await response.json(); if (active) { setConfig(value); setMessage(""); }
    }).catch(error => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, []);
  async function enable() {
    if (!registration || !config?.publicKey) return;
    setBusy(true); setMessage("");
    let created: PushSubscription | null = null;
    try {
      // Permission prompt must remain directly attached to this explicit user gesture (iOS).
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Notifiche non autorizzate. Puoi cambiare il permesso nelle impostazioni del browser.");
      const key = Uint8Array.from(atob(config.publicKey.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
      let subscription = await registration.pushManager.getSubscription();
      if (subscription && subscription.options.applicationServerKey && !sameKey(new Uint8Array(subscription.options.applicationServerKey), key)) {
        await subscription.unsubscribe(); subscription = null;
      }
      if (!subscription) { subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }); created = subscription; }
      const response = await fetch("/api/notifications/subscription", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription.toJSON()) });
      if (!response.ok) throw new Error("Iscrizione non salvata. Riprova oppure accedi nuovamente.");
      setConfig({ ...config, subscribed: true }); setMessage("Notifiche attivate su questo dispositivo.");
    } catch (error) { if (created) await created.unsubscribe().catch(() => {}); setMessage(error instanceof Error ? error.message : "Attivazione non riuscita."); }
    finally { setBusy(false); }
  }
  async function disable() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/notifications/subscription", { method: "DELETE" });
      if (!response.ok) throw new Error("Disattivazione non salvata. Verifica la connessione e riprova.");
      if (config) setConfig({ ...config, subscribed: false });
      const subscription = await registration?.pushManager.getSubscription(); await subscription?.unsubscribe();
      setMessage("Notifiche disattivate su questo dispositivo.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Disattivazione non riuscita."); }
    finally { setBusy(false); }
  }
  return <section aria-labelledby="push-title"><h3 id="push-title">Notifiche dei progetti</h3>
    <p>Ricevi un avviso per gli aggiornamenti dei colleghi nei progetti a cui hai accesso, anche quando l’app è chiusa. Gli avvisi non includono nomi o contenuti delle attività. Uscendo dall’account si disattivano.</p>
    {ios && !standalone ? <p>Su iPhone e iPad installa prima l’app nella schermata Home e aprila da lì. Le notifiche richiedono iOS o iPadOS 16.4 o successivo.</p> : !supported ? <p>Questo browser non supporta le notifiche dell’app.</p> : null}
    {config && !config.enabled && <p>Le notifiche non sono ancora abilitate dal gestore del servizio.</p>}
    {config?.enabled && (config.subscribed ? <button className="btn" disabled={busy} onClick={disable}>Disattiva notifiche</button> : <button className="btn" disabled={busy || !supported || !registration?.active || (ios && !standalone)} onClick={enable}>Attiva notifiche</button>)}
    {message && <p role="status">{message}</p>}
  </section>;
}
function sameKey(a: Uint8Array, b: Uint8Array) { return a.length === b.length && a.every((value, index) => value === b[index]); }
