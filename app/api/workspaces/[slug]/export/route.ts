import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { boardContext, isResponse } from "@/lib/api-context";
import { toCsv } from "@/lib/import-export";
import { checklistProgress } from "@/lib/card-schema";

/** Board export: CSV (opens in Excel), Markdown, or complete JSON (cards incl. archived, assignees, checklist, comments). */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await boardContext(request, slug);
  if (isResponse(ctx)) return ctx;
  const format = new URL(request.url).searchParams.get("format") || "csv";
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: ctx.workspace.id },
    include: {
      columns: {
        orderBy: { position: "asc" },
        include: {
          cards: {
            orderBy: [{ archived: "asc" }, { position: "asc" }],
            include: {
              assignees: { include: { user: { select: { name: true, email: true } } } },
              comments: { where: { deletedAt: null }, orderBy: { createdAt: "asc" }, include: { user: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });
  const date = new Date().toISOString().slice(0, 10);
  const filename = `${slug}-${date}`;
  if (format === "csv") {
    const rows = workspace.columns.flatMap(column =>
      column.cards.map(card => ({
        titolo: card.title,
        colonna: column.title,
        descrizione: card.description,
        priorita: card.priority,
        scadenza: card.dueDate ? card.dueDate.toISOString().slice(0, 10) : "",
        tag: Array.isArray(card.tags) ? card.tags.join(", ") : "",
        assegnatari: card.assignees.map(item => item.user.name).join(", "),
        checklist: (() => {
          const progress = checklistProgress(card.checklist);
          return progress.total ? `${progress.done}/${progress.total}` : "";
        })(),
        commenti: card.comments.length,
        archiviata: card.archived ? "sì" : "no",
        creata: card.createdAt.toISOString().slice(0, 10),
        aggiornata: card.updatedAt.toISOString().slice(0, 10),
      })),
    );
    const csv = toCsv(rows, [
      "titolo",
      "colonna",
      "descrizione",
      "priorita",
      "scadenza",
      "tag",
      "assegnatari",
      "checklist",
      "commenti",
      "archiviata",
      "creata",
      "aggiornata",
    ]);
    return new NextResponse(csv, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}.csv"` },
    });
  }
  if (format === "md") {
    const md = [
      `# ${workspace.name}`,
      "",
      ...workspace.columns.flatMap(c => [
        `## ${c.title}`,
        "",
        ...(c.cards.filter(x => !x.archived).length
          ? c.cards
              .filter(x => !x.archived)
              .map(
                x =>
                  `- **${x.title}**${x.dueDate ? ` (scadenza ${x.dueDate.toISOString().slice(0, 10)})` : ""}${x.description ? ` — ${x.description.replace(/\n+/g, " ")}` : ""}`,
              )
          : ["- _Vuota_"]),
        "",
      ]),
    ].join("\n");
    return new NextResponse(md, {
      headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}.md"` },
    });
  }
  const plan = {
    format: "boardcue.board.v2",
    workspace: workspace.name,
    locale: workspace.locale,
    exportedAt: new Date().toISOString(),
    columns: workspace.columns.map(c => ({
      title: c.title,
      description: c.description,
      cards: c.cards.map(x => ({
        title: x.title,
        description: x.description,
        priority: x.priority,
        dueDate: x.dueDate,
        tags: x.tags,
        checklist: x.checklist,
        archived: x.archived,
        assignees: x.assignees.map(item => ({ name: item.user.name, email: item.user.email })),
        comments: x.comments.map(comment => ({ author: comment.user.name, body: comment.body, createdAt: comment.createdAt })),
        createdAt: x.createdAt,
        updatedAt: x.updatedAt,
      })),
    })),
  };
  return new NextResponse(JSON.stringify(plan, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${filename}.json"` },
  });
}
