import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatform } from "@/lib/platform-access";
import { toCsv } from "@/lib/import-export";
import { monthlyPrice } from "@/lib/plans";

/**
 * Fiscal data of paying customers as CSV, to import into the e-invoicing software that transmits
 * invoices to the Italian SDI (BoardCue does not send electronic invoices itself).
 */
export async function GET() {
  const access = await requirePlatform("BILLING");
  if ("error" in access) return access.error;
  const organizations = await prisma.organization.findMany({
    where: { OR: [{ subscription: { status: { in: ["active", "trialing", "past_due"] } } }, { creditGrants: { some: {} } }] },
    include: { subscription: true, createdBy: { select: { email: true } } },
    orderBy: { name: "asc" },
  });
  const rows = organizations.map(organization => {
    const address = (organization.billingAddress || {}) as Record<string, string | null>;
    return {
      team: organization.name,
      ragione_sociale: organization.billingName || "",
      partita_iva: organization.vatNumber || "",
      codice_fiscale: organization.fiscalCode || "",
      codice_sdi: organization.sdiCode || "",
      pec: organization.pecEmail || "",
      indirizzo: [address.line1, address.line2].filter(Boolean).join(" "),
      cap: address.postal_code || "",
      citta: address.city || "",
      provincia: address.state || "",
      paese: address.country || "",
      email_owner: organization.createdBy.email,
      piano: organization.plan,
      posti: organization.seats ?? "",
      fatturazione: organization.billingInterval || "month",
      mrr_eur: monthlyPrice(organization) ?? "",
      cliente_stripe: organization.subscription?.stripeCustomerId || "",
    };
  });
  const columns = [
    "team",
    "ragione_sociale",
    "partita_iva",
    "codice_fiscale",
    "codice_sdi",
    "pec",
    "indirizzo",
    "cap",
    "citta",
    "provincia",
    "paese",
    "email_owner",
    "piano",
    "posti",
    "fatturazione",
    "mrr_eur",
    "cliente_stripe",
  ];
  return new NextResponse(toCsv(rows, columns), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="boardcue-dati-fiscali-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
