import { createOpaqueToken, hashToken, UNVERIFIED_GRACE_DAYS } from "@/lib/auth";
import { appUrl, escapeHtml, renderEmail, sendEmail } from "@/lib/email";
import { safeNextPath } from "@/lib/navigation";
import { prisma } from "@/lib/prisma";

export async function issueVerificationEmail(
  user: { id: string; email: string; name: string },
  request: Request,
  next?: string,
  reminder = false,
) {
  const token = createOpaqueToken();
  await prisma.$transaction([
    prisma.verificationToken.deleteMany({ where: { userId: user.id } }),
    prisma.verificationToken.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + UNVERIFIED_GRACE_DAYS * 86400000) },
    }),
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
        preheader: reminder
          ? "Conferma l’email per attivare il tuo spazio BoardCue."
          : "Conferma il tuo indirizzo email per iniziare con BoardCue.",
        paragraphs: reminder
          ? [
              `Ciao ${escapeHtml(user.name)},`,
              "Il tuo spazio BoardCue è attivo, ma ci manca ancora la conferma del tuo indirizzo email.",
              "Se non completi la verifica entro 7 giorni dalla registrazione, l’account non confermato verrà eliminato automaticamente.",
            ]
          : [
              `Ciao ${escapeHtml(user.name)},`,
              "Hai creato il tuo spazio BoardCue: puoi già usarlo. Conferma il tuo indirizzo per invitare il team, scegliere un piano e proteggere l’account.",
              "Il link è valido per 7 giorni.",
            ],
        action: { label: "Verifica email", href: verificationUrl },
        note: "Se non hai creato tu questo account, puoi ignorare questo messaggio.",
      }),
    });
    return delivery.preview ? ("preview" as const) : ("sent" as const);
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
        paragraphs: [
          `Ciao ${escapeHtml(user.name)},`,
          "È stata richiesta una registrazione con questo indirizzo, ma esiste già un account BoardCue attivo.",
        ],
        action: { label: "Accedi a BoardCue", href: loginUrl },
        note: `Hai dimenticato la password? <a href="${escapeHtml(recoveryUrl)}" style="color:#4338E0">Reimpostala in sicurezza</a>. Se non hai fatto tu la richiesta, puoi ignorare questo messaggio.`,
      }),
    });
    return delivery.preview ? ("preview" as const) : ("sent" as const);
  } catch (error) {
    console.error("Existing account email delivery failed", error);
    return "retry" as const;
  }
}

export async function issueMagicLinkEmail(user: { id: string; email: string; name: string }, request: Request, next?: string) {
  const token = createOpaqueToken();
  await prisma.$transaction([
    prisma.loginToken.deleteMany({ where: { userId: user.id } }),
    prisma.loginToken.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 15 * 60_000) } }),
  ]);
  const destination = safeNextPath(next, "/app");
  const query = new URLSearchParams({ token });
  if (destination !== "/app") query.set("next", destination);
  try {
    await sendEmail({
      to: user.email,
      subject: "Il tuo link di accesso a BoardCue",
      html: renderEmail({
        title: "Accedi con un clic",
        preheader: "Il link è valido per 15 minuti e funziona una sola volta.",
        paragraphs: [
          `Ciao ${escapeHtml(user.name)},`,
          "Usa il pulsante qui sotto per entrare in BoardCue senza password. Il link è valido per 15 minuti e funziona una sola volta.",
        ],
        action: { label: "Entra in BoardCue", href: appUrl(`/api/auth/magic?${query.toString()}`, request) },
        note: "Se non hai richiesto tu l’accesso, ignora questo messaggio: nessuno può entrare senza aprire questo link.",
      }),
    });
  } catch (error) {
    console.error("Magic link delivery failed", error);
  }
}
