import { prisma } from "@/lib/prisma";
import { createWorkspace, normalizeLocale } from "@/lib/workspace";

type Sample = { column: string; title: string; description: string; priority?: "HIGH" | "NORMAL"; tags: string[]; dueInDays?: number };

/** Sample content keyed by the semantic column of the GENERAL preset, so it lands in the right place in any language. */
const SAMPLES: Record<"it" | "en", { name: string; cards: Sample[] }> = {
  it: {
    name: "La mia prima board",
    cards: [
      {
        column: "INBOX",
        title: "Organizzare la riunione di lancio",
        description: "Scegliere data, invitati e ordine del giorno.",
        tags: ["team"],
      },
      {
        column: "READY",
        title: "Preparare la presentazione per il cliente",
        description: "Slide con obiettivi, tempi e budget.",
        priority: "HIGH",
        tags: ["cliente"],
        dueInDays: 3,
      },
      { column: "ACTIVE", title: "Aggiornare il sito web", description: "Nuova home page e pagina contatti.", tags: ["sito"] },
      {
        column: "BLOCKED",
        title: "Ricevere i testi dal cliente",
        description: "Servono per completare le pagine del sito.",
        tags: ["cliente"],
      },
    ],
  },
  en: {
    name: "My first board",
    cards: [
      { column: "INBOX", title: "Organize the kickoff meeting", description: "Pick a date, attendees and agenda.", tags: ["team"] },
      {
        column: "READY",
        title: "Prepare the client presentation",
        description: "Slides with goals, timeline and budget.",
        priority: "HIGH",
        tags: ["client"],
        dueInDays: 3,
      },
      { column: "ACTIVE", title: "Update the website", description: "New home page and contact page.", tags: ["website"] },
      { column: "BLOCKED", title: "Get copy from the client", description: "Needed to finish the website pages.", tags: ["client"] },
    ],
  },
};

export { WELCOME_EXAMPLES } from "@/lib/welcome";

/** Creates a ready-to-use board so the first minute is spent trying the AI loop, not configuring. */
export async function createStarterBoard(input: { userId: string; organizationId: string; locale: string }) {
  const locale = normalizeLocale(input.locale);
  const language = locale === "it" ? "it" : "en";
  const sample = SAMPLES[language];
  const workspace = await createWorkspace({
    name: sample.name,
    userId: input.userId,
    organizationId: input.organizationId,
    presetKey: "GENERAL",
    locale,
  });
  const columns = await prisma.boardColumn.findMany({ where: { workspaceId: workspace.id }, select: { id: true, semanticKey: true } });
  const bySemantic = new Map(columns.map(column => [column.semanticKey, column.id]));
  let position = 0;
  for (const card of sample.cards) {
    const columnId = bySemantic.get(card.column) || columns[0].id;
    await prisma.card.create({
      data: {
        workspaceId: workspace.id,
        columnId,
        title: card.title,
        description: card.description,
        priority: card.priority || "NORMAL",
        tags: card.tags,
        position: position++,
        dueDate: card.dueInDays ? new Date(Date.now() + card.dueInDays * 86400000) : null,
      },
    });
  }
  return workspace;
}
