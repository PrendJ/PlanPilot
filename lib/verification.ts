import { createOpaqueToken, hashToken } from "@/lib/auth";
import { appUrl, escapeHtml, sendEmail } from "@/lib/email";
import { safeNextPath } from "@/lib/navigation";
import { prisma } from "@/lib/prisma";

export async function issueVerificationEmail(user: { id: string; email: string; name: string }, request: Request, next?: string) {
  const token = createOpaqueToken();
  await prisma.$transaction([
    prisma.verificationToken.deleteMany({ where: { userId: user.id } }),
    prisma.verificationToken.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 24 * 60 * 60_000) } }),
  ]);
  const destination = safeNextPath(next, "/app");
  const query = new URLSearchParams({ token });
  if (destination !== "/app") query.set("next", destination);
  const verificationUrl = appUrl(`/api/auth/verify?${query.toString()}`, request);
  try {
    const delivery = await sendEmail({
      to: user.email,
      subject: "Verifica il tuo account BoardCue",
      html: `<p>Ciao ${escapeHtml(user.name)},</p><p>Conferma il tuo indirizzo per attivare BoardCue:</p><p><a href="${escapeHtml(verificationUrl)}">Verifica email</a></p><p>Il link scade tra 24 ore. Se non hai richiesto tu l’account, ignora questa email.</p>`,
    });
    return delivery.preview ? "preview" as const : "sent" as const;
  } catch (error) {
    console.error("Verification email delivery failed", error);
    return "retry" as const;
  }
}

export async function issueExistingAccountEmail(user: { email: string; name: string }, request: Request, next?: string) {
  const destination = safeNextPath(next, "/app");
  const loginQuery = destination === "/app" ? "" : `?next=${encodeURIComponent(destination)}`;
  const loginUrl = appUrl(`/login${loginQuery}`, request);
  const recoveryUrl = appUrl("/forgot-password", request);
  try {
    const delivery = await sendEmail({
      to: user.email,
      subject: "Il tuo account BoardCue è già attivo",
      html: `<p>Ciao ${escapeHtml(user.name)},</p><p>È stata richiesta una registrazione con questo indirizzo, ma l’account è già attivo.</p><p><a href="${escapeHtml(loginUrl)}">Accedi a BoardCue</a> oppure <a href="${escapeHtml(recoveryUrl)}">recupera la password</a>.</p><p>Se non hai fatto tu la richiesta, puoi ignorare questa email.</p>`,
    });
    return delivery.preview ? "preview" as const : "sent" as const;
  } catch (error) {
    console.error("Existing account email delivery failed", error);
    return "retry" as const;
  }
}
