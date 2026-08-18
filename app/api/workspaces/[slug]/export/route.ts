import { NextResponse } from "next/server";
import { getCurrentUser, canAccessWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { slug } = await params;
  const workspace = await prisma.workspace.findUnique({ where: { slug }, include: { columns: { orderBy: { position: "asc" }, include: { cards: { where: { archived: false }, orderBy: { position: "asc" } } } } } });
  if (!workspace || !(await canAccessWorkspace(user.id, workspace.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const url = new URL(request.url);
  const format = url.searchParams.get("format") || "json";
  const plan = { workspace: workspace.name, exportedAt: new Date().toISOString(), columns: workspace.columns.map((c) => ({ title: c.title, description: c.description, cards: c.cards.map((x) => ({ title: x.title, description: x.description, priority: x.priority, dueDate: x.dueDate, tags: x.tags })) })) };
  if (format === "md") {
    const md = [`# ${workspace.name}`, "", ...workspace.columns.flatMap((c) => [`## ${c.title}`, "", ...(c.cards.length ? c.cards.map((x) => `- **${x.title}**${x.description ? ` — ${x.description}` : ""}`) : ["- _Empty_"]), ""])].join("\n");
    return new NextResponse(md, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${slug}.md"` } });
  }
  return new NextResponse(JSON.stringify(plan, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${slug}.json"` } });
}
