import nodemailer from "nodemailer";

const CANONICAL_APP_URL = "https://boardcue.draftapps.it";

function transport() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === "true", auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined });
}

export async function sendEmail(input: { to: string; subject: string; text?: string; html?: string }) {
  const sender = process.env.SMTP_FROM || "BoardCue AI <noreply@boardcue.draftapps.it>";
  const smtp = transport();
  if (!smtp) {
    if (process.env.NODE_ENV !== "production") console.info(`[email preview] ${input.to} | ${input.subject}\n${input.text || input.html || ""}`);
    return { preview: true };
  }
  await smtp.sendMail({ from: sender, ...input, text: input.text || input.html?.replace(/<[^>]+>/g, " ") });
  return { preview: false };
}

function usableOrigin(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const wildcard = url.hostname === "0.0.0.0" || url.hostname === "::" || url.hostname === "[::]";
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (wildcard || (process.env.NODE_ENV === "production" && local)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function appUrl(path = "", request?: Request) {
  const configured = usableOrigin(process.env.APP_URL);
  const requested = usableOrigin(request?.url);
  const base = configured || requested || (process.env.NODE_ENV === "production" ? CANONICAL_APP_URL : "http://localhost:3000");
  return new URL(path || "/", `${base}/`).toString().replace(/\/$/, path ? "" : "/");
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]!);
}
