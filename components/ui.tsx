"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { Icon } from "./Icon";
import { useT } from "./I18nProvider";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal: role="dialog", aria-modal, labelled by its title, focus trapped and restored,
 * closes on Escape and backdrop click — unless `confirmClose` returns false (e.g. unsaved changes).
 */
export function Dialog({
  title,
  description,
  onClose,
  children,
  footer,
  wide,
  confirmClose,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
  confirmClose?: () => boolean;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const requestClose = useCallback(() => {
    if (!confirmClose || confirmClose()) onClose();
  }, [confirmClose, onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const first = node?.querySelector<HTMLElement>("[data-autofocus]") || node?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        requestClose();
      }
      if (event.key !== "Tab" || !node) return;
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(item => item.offsetParent !== null);
      if (!items.length) return;
      const [start, end] = [items[0], items[items.length - 1]];
      if (event.shiftKey && document.activeElement === start) {
        event.preventDefault();
        end.focus();
      } else if (!event.shiftKey && document.activeElement === end) {
        event.preventDefault();
        start.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [requestClose]);
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={event => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div
        ref={ref}
        className={`dialog ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
      >
        <div className="dialog-head">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descriptionId}>{description}</p>}
          </div>
          <button type="button" className="icon-btn" onClick={requestClose} aria-label={t("common.close")}>
            <Icon name="x" />
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </div>
  );
}

type Toast = { id: number; message: string; tone?: "error" | "default"; action?: { label: string; onClick: () => void } };
type ConfirmRequest = {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
  input?: { label: string; defaultValue?: string; placeholder?: string };
  resolve: (value: string | boolean | null) => void;
};

const FeedbackContext = createContext<{
  toast: (toast: Omit<Toast, "id">) => void;
  confirm: (request: Omit<ConfirmRequest, "resolve" | "input">) => Promise<boolean>;
  prompt: (request: Omit<ConfirmRequest, "resolve"> & { input: NonNullable<ConfirmRequest["input"]> }) => Promise<string | null>;
}>({
  toast: () => undefined,
  confirm: async () => false,
  prompt: async () => null,
});

/** Toasts (with optional action such as "Undo") and promise-based confirm/prompt dialogs. */
export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const t = useT();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const [value, setValue] = useState("");
  const counter = useRef(0);
  const toast = useCallback((input: Omit<Toast, "id">) => {
    const id = ++counter.current;
    setToasts(current => [...current.slice(-2), { ...input, id }]);
    setTimeout(() => setToasts(current => current.filter(item => item.id !== id)), input.action ? 8000 : 4500);
  }, []);
  const confirm = useCallback(
    (input: Omit<ConfirmRequest, "resolve" | "input">) =>
      new Promise<boolean>(resolve => setRequest({ ...input, resolve: result => resolve(Boolean(result)) })),
    [],
  );
  const prompt = useCallback(
    (input: Omit<ConfirmRequest, "resolve"> & { input: NonNullable<ConfirmRequest["input"]> }) =>
      new Promise<string | null>(resolve => {
        setValue(input.input.defaultValue || "");
        setRequest({ ...input, resolve: result => resolve(typeof result === "string" ? result : null) });
      }),
    [],
  );
  const close = (result: string | boolean | null) => {
    request?.resolve(result);
    setRequest(null);
  };
  return (
    <FeedbackContext.Provider value={{ toast, confirm, prompt }}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toasts.map(item => (
          <div key={item.id} className={`toast ${item.tone === "error" ? "error" : ""}`}>
            <span>{item.message}</span>
            {item.action && (
              <button
                type="button"
                onClick={() => {
                  item.action!.onClick();
                  setToasts(current => current.filter(entry => entry.id !== item.id));
                }}
              >
                {item.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
      {request && (
        <Dialog
          title={request.title}
          description={request.message}
          onClose={() => close(request.input ? null : false)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => close(request.input ? null : false)}>
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className={`btn ${request.danger ? "danger solid" : "primary"}`}
                onClick={() => close(request.input ? value.trim() || null : true)}
                disabled={Boolean(request.input) && !value.trim()}
              >
                {request.confirmLabel || t("common.confirm")}
              </button>
            </>
          }
        >
          {request.input ? (
            <form
              onSubmit={event => {
                event.preventDefault();
                if (value.trim()) close(value.trim());
              }}
              className="field"
            >
              <label htmlFor="prompt-input">{request.input.label}</label>
              <input
                id="prompt-input"
                data-autofocus
                value={value}
                placeholder={request.input.placeholder}
                onChange={event => setValue(event.target.value)}
                maxLength={180}
              />
            </form>
          ) : null}
        </Dialog>
      )}
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  return useContext(FeedbackContext);
}

/** Popover menu with outside-click and Escape handling. */
export function MenuButton({
  label,
  icon,
  children,
  align = "right",
  className = "icon-btn",
  buttonContent,
}: {
  label: string;
  icon?: Parameters<typeof Icon>[0]["name"];
  children: (close: () => void) => React.ReactNode;
  align?: "left" | "right";
  className?: string;
  buttonContent?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLElement>(".menu .menu-item")?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="menu-wrap" ref={ref}>
      <button
        type="button"
        className={className}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen(value => !value)}
      >
        {buttonContent ?? (icon && <Icon name={icon} />)}
      </button>
      {open && (
        <div id={menuId} className={`menu ${align === "left" ? "left" : ""}`} role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0])
      .join("")
      .toUpperCase() || "?"
  );
}

export function Avatar({ name, size }: { name: string; size?: "sm" | "lg" }) {
  return (
    <span className={`avatar ${size || ""}`} title={name} aria-label={name}>
      {initials(name)}
    </span>
  );
}

/** Fetch wrapper for JSON APIs: returns { ok, data, status } and never throws on network errors. */
export async function api<T = Record<string, unknown>>(
  url: string,
  init?: RequestInit & { json?: unknown },
): Promise<{ ok: boolean; status: number; data: T & { error?: string; code?: string } }> {
  try {
    const response = await fetch(url, {
      ...init,
      headers: { ...(init?.json !== undefined ? { "Content-Type": "application/json" } : {}), ...(init?.headers || {}) },
      body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, status: 0, data: { code: "NETWORK" } as T & { code: string } };
  }
}
