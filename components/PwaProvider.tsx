"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { NotificationsPanel } from "./NotificationsPanel";
import { usePathname } from "next/navigation";

type InstallEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };
type PwaContext = { open: () => void; block: (key: string, value: boolean) => void };
const Context = createContext<PwaContext>({ open: () => {}, block: () => {} });
export function InstallAppButton() {
  const { open } = useContext(Context);
  return <button className="btn ghost pwa-install" onClick={open}>App</button>;
}
export function useUpdateBlocker(key: string, active: boolean) {
  const { block } = useContext(Context);
  useEffect(() => { block(key, active); return () => block(key, false); }, [key, active, block]);
}

export function PwaProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [offline, setOffline] = useState(false);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [message, setMessage] = useState("");
  const [updating, setUpdating] = useState(false);
  const [opened, setOpened] = useState(false);
  const [ios, setIos] = useState(false);
  const blockers = useRef(new Set<string>());
  const dialog = useRef<HTMLDialogElement>(null);
  const updateRequested = useRef(false);
  const block = useCallback((key: string, value: boolean) => {
    if (value) blockers.current.add(key); else blockers.current.delete(key);
    setBlocked(blockers.current.size > 0);
  }, []);
  useEffect(() => { block("page-form", false); }, [pathname, block]);
  useEffect(() => {
    const media = matchMedia("(display-mode: standalone)");
    const installed = () => setStandalone(media.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    installed(); media.addEventListener("change", installed);
    setIos(/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
    const online = () => setOffline(!navigator.onLine); online();
    const prompt = (event: Event) => { event.preventDefault(); setInstall(event as InstallEvent); };
    const complete = () => { setInstall(null); installed(); };
    window.addEventListener("online", online); window.addEventListener("offline", online);
    window.addEventListener("beforeinstallprompt", prompt); window.addEventListener("appinstalled", complete);
    return () => {
      media.removeEventListener("change", installed);
      window.removeEventListener("online", online); window.removeEventListener("offline", online);
      window.removeEventListener("beforeinstallprompt", prompt); window.removeEventListener("appinstalled", complete);
    };
  }, []);
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !isSecureContext || !("serviceWorker" in navigator)) return;
    let disposed = false, lastCheck = 0, reg: ServiceWorkerRegistration | undefined;
    const cleanups: Array<() => void> = [];
    const inspect = () => { if (!disposed && reg?.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting); };
    const found = () => {
      const worker = reg?.installing;
      if (worker) { worker.addEventListener("statechange", inspect); cleanups.push(() => worker.removeEventListener("statechange", inspect)); }
    };
    const check = () => {
      if (reg && navigator.onLine && document.visibilityState === "visible" && Date.now() - lastCheck > 3600000) {
        lastCheck = Date.now(); reg.update().catch(() => {});
      }
    };
    const changed = () => {
      inspect();
      if (updateRequested.current && blockers.current.size === 0) window.location.reload();
      else if (updateRequested.current) { updateRequested.current = false; setUpdating(false); setMessage("Versione pronta. Completa la bozza prima di ricaricare la pagina."); }
    };
    navigator.serviceWorker.addEventListener("controllerchange", changed);
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then(async value => {
      if (disposed) return;
      reg = value; inspect(); found(); value.addEventListener("updatefound", found); check();
      const ready = await navigator.serviceWorker.ready;
      if (!disposed) setRegistration(ready);
    }).catch(() => { if (!disposed) setMessage("Servizi dell’app non disponibili. Puoi continuare dal browser e riprovare più tardi."); });
    document.addEventListener("visibilitychange", check); window.addEventListener("online", check);
    return () => { disposed = true; reg?.removeEventListener("updatefound", found); cleanups.forEach(fn => fn()); navigator.serviceWorker.removeEventListener("controllerchange", changed); document.removeEventListener("visibilitychange", check); window.removeEventListener("online", check); };
  }, []);
  // Also guard ordinary account/registration forms. Content is kept only in memory.
  useEffect(() => {
    const dirty = (event: Event) => {
      const target = event.target as HTMLElement;
      if (target.closest("form") && !target.closest("dialog,[role=\"dialog\"],.modal-card")) block("page-form", true);
    };
    document.addEventListener("input", dirty);
    return () => document.removeEventListener("input", dirty);
  }, [block]);
  const open = () => { setOpened(true); dialog.current?.showModal(); };
  async function installNow() {
    if (!install) return;
    try { await install.prompt(); const choice = await install.userChoice; setMessage(choice.outcome === "accepted" ? "Installazione richiesta al browser." : "Puoi installare l’app più tardi."); }
    catch { setMessage("Apri il menu del browser per installare l’app."); }
    setInstall(null);
  }
  async function checkUpdates() {
    if (!registration) { setMessage("Il servizio aggiornamenti richiede HTTPS e un browser compatibile."); return; }
    try { await registration.update(); setMessage(registration.waiting ? "È disponibile un aggiornamento." : "Controllo completato. Gli aggiornamenti pronti compariranno qui."); }
    catch { setMessage("Controllo non riuscito. Verifica la connessione e riprova."); }
  }
  function updateNow() {
    if (blockers.current.size || !waiting || offline) return;
    // Another tab may already have activated this worker; reload only after this tab's consent.
    if (waiting.state === "activated") { window.location.reload(); return; }
    updateRequested.current = true; setUpdating(true); waiting.postMessage({ type: "ACTIVATE_UPDATE" });
    window.setTimeout(() => {
      if (updateRequested.current) { updateRequested.current = false; setUpdating(false); setMessage("Aggiornamento non completato. Riprova quando hai terminato le modifiche."); }
    }, 12000);
  }
  const updateControls = waiting && <div className="pwa-update"><p>Una nuova versione è pronta.{blocked ? " Salva le modifiche e torna alla Home per aggiornare." : " Aggiornando, questa pagina verrà ricaricata."}</p><button className="btn accent" disabled={blocked || updating || offline} onClick={updateNow}>{updating ? "Aggiornamento…" : "Aggiorna ora"}</button></div>;
  return <Context.Provider value={{ open, block }}>{children}
    {(offline || waiting) && <aside className="pwa-status" aria-label="Stato app" aria-live="polite">{offline && <p>Sei offline. Mantieni aperta la pagina per conservare la bozza.</p>}{updateControls}</aside>}
    <dialog className="pwa-dialog" ref={dialog} onClose={() => setOpened(false)} aria-labelledby="pwa-title">
      <header><h2 id="pwa-title">BoardCue sul tuo dispositivo</h2><button className="btn" onClick={() => dialog.current?.close()} aria-label="Chiudi impostazioni app">Chiudi</button></header>
      <p>{standalone ? "Stai usando BoardCue come app installata." : "Apri BoardCue dalla schermata Home o dal desktop, in una finestra dedicata."}</p>
      {!standalone && (install ? <button className="btn accent" onClick={installNow}>Installa BoardCue</button> : <p>{ios ? "Su iPhone e iPad apri BoardCue in Safari, tocca Condividi e scegli Aggiungi alla schermata Home." : "Nel menu del browser cerca Installa app oppure Aggiungi alla schermata Home. Se l’opzione non compare, puoi continuare a usare BoardCue nel browser."}</p>)}
      <p>La lettura e il salvataggio dei progetti richiedono una connessione.</p>
      <h3>Aggiornamenti dell’app</h3>{updateControls}<button className="btn" disabled={updating || offline} onClick={checkUpdates}>Controlla aggiornamenti</button>
      {message && <p role="status">{message}</p>}
      {opened && <NotificationsPanel registration={registration} ios={ios} standalone={standalone} />}
    </dialog>
  </Context.Provider>;
}
