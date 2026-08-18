import nodemailer from "nodemailer";

function transport() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === "true", auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined });
}

export async function sendEmail(input: { to: string; subject: string; text?: string; html?: string }) {
  const sender = process.env.SMTP_FROM || process.env.EMAIL_FROM || "BoardCue AI <noreply@boardcue.draftapps.it>";
  const smtp = transport();
  if (!smtp) {
    if (process.env.NODE_ENV !== "production") console.info(`[email preview] ${input.to} | ${input.subject}\n${input.text || input.html || ""}`);
    return { preview: true };
  }
  return smtp.sendMail({ from: sender, ...input, text: input.text || input.html?.replace(/<[^>]+>/g, " ") });
}

export function appUrl(path = "") {
  return `${(process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "")}${path}`;
}
