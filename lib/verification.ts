import { createOpaqueToken, hashToken } from "@/lib/auth";
import { appUrl, escapeHtml, renderEmail, sendEmail } from "@/lib/email";
import { safeNextPath } from "@/lib/navigation";
import { prisma } from "@/lib/prisma";

export async function issueVerificationEmail(user: { id: string; email: string; name: string }, request: Request, next?: string, reminder = false) {
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
      subject: reminder ? "Il tuo account BoardCue aspetta la conferma" : "Verifica il tuo account BoardCue",
      html: renderEmail({
        title: reminder ? "Conferma il tuo account" : "Un ultimo passaggio",
        preheader: reminder ? "Conferma l’email per attivare il tuo spazio BoardCue." : "Conferma il tuo indirizzo email per iniziare con BoardCue.",
        paragraphs: reminder
          ? [`Ciao ${escapeHtml(user.name)},`, "Il tuo spazio BoardCue è pronto, ma per proteggerlo ci manca ancora la conferma del tuo indirizzo email.", "Se non completi la verifica entro le prossime 12 ore, elimineremo automaticamente l’account non attivato."]
          : [`Ciao ${escapeHtml(user.name)},`, "Hai creato il tuo spazio BoardCue. Conferma il tuo indirizzo email per attivarlo e iniziare la prova gratuita.", "Per la tua sicurezza, il link è valido per 24 ore."],
        action: { label: "Verifica email", href: verificationUrl },
        note: "Se non hai creato tu questo account, puoi ignorare questo messaggio.",
      }),
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
      html: renderEmail({
        title: "Il tuo account è già attivo",
        preheader: "Accedi al tuo spazio BoardCue oppure reimposta la password.",
        paragraphs: [`Ciao ${escapeHtml(user.name)},`, "È stata richiesta una registrazione con questo indirizzo, ma esiste già un account BoardCue attivo."],
        action: { label: "Accedi a BoardCue", href: loginUrl },
        note: `Hai dimenticato la password? <a href="${escapeHtml(recoveryUrl)}" style="color:#42d8ed">Reimpostala in sicurezza</a>. Se non hai fatto tu la richiesta, puoi ignorare questo messaggio.`,
      }),
    });
    return delivery.preview ? "preview" as const : "sent" as const;
  } catch (error) {
    console.error("Existing account email delivery failed", error);
    return "retry" as const;
  }
}
