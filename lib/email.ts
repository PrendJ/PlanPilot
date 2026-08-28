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

type EmailAction = { label: string; href: string };

/** Shared, email-client-safe presentation for every message sent by BoardCue. */
export function renderEmail(input: {
  title: string;
  preheader: string;
  paragraphs: string[];
  action?: EmailAction;
  note?: string;
}) {
  const action = input.action
    ? `<tr><td style="padding:8px 0 28px"><a href="${escapeHtml(input.action.href)}" style="display:inline-block;background:#6256e8;border:1px solid #8278ff;border-radius:4px;color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:700;line-height:20px;padding:13px 20px;text-decoration:none">${escapeHtml(input.action.label)}</a></td></tr>`
    : "";
  const note = input.note
    ? `<tr><td style="border-top:1px solid #303038;color:#aaa9b5;font-family:Arial,sans-serif;font-size:12px;line-height:18px;padding:20px 0 0">${input.note}</td></tr>`
    : "";

  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(input.title)}</title></head><body style="background:#101010;margin:0;padding:0"><span style="display:none!important;color:#101010;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${escapeHtml(input.preheader)}</span><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#101010"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#1a1a1d;border:1px solid #303038;max-width:600px"><tr><td style="border-bottom:3px solid #42d8ed;padding:24px 32px 20px"><div style="color:#42d8ed;font-family:Arial,sans-serif;font-size:12px;font-weight:800;letter-spacing:1.4px">BOARDCUE AI</div><div style="color:#ffffff;font-family:Arial,sans-serif;font-size:22px;font-weight:800;letter-spacing:-0.4px;margin-top:8px">${escapeHtml(input.title)}</div></td></tr><tr><td style="padding:28px 32px 32px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${input.paragraphs.map(paragraph => `<tr><td style="color:#edecf0;font-family:Arial,sans-serif;font-size:15px;line-height:24px;padding:0 0 16px">${paragraph}</td></tr>`).join("")}${action}${note}</table></td></tr></table><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px"><tr><td style="color:#777681;font-family:Arial,sans-serif;font-size:11px;line-height:16px;padding:16px 8px;text-align:center">BoardCue AI · Pianifica con chiarezza, aggiorna con parole tue.</td></tr></table></td></tr></table></body></html>`;
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
