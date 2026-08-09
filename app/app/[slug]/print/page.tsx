import { getCurrentUser, canAccessWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { PrintActions } from "@/components/PrintActions";

function formatDate(value: Date | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", year: "numeric" }).format(value);
}

function readableTags(tags: unknown) {
  return Array.isArray(tags) ? tags.map(String).filter(Boolean).slice(0, 6) : [];
}

export default async function PrintWorkspacePage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { slug } = await params;
  const workspace = await prisma.workspace.findUnique({
    where: { slug },
    include: {
      columns: {
        orderBy: { position: "asc" },
        include: { cards: { where: { archived: false }, orderBy: { position: "asc" } } },
      },
    },
  });

  if (!workspace || !(await canAccessWorkspace(user.id, workspace.id))) notFound();

  const exportedAt = new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  const totalCards = workspace.columns.reduce((sum, column) => sum + column.cards.length, 0);

  return (
    <main className="print-page">
      <style>{`
        .print-page{min-height:100vh;background:#eef2f6;color:#172033;padding:28px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
        .print-sheet{max-width:1500px;margin:0 auto;background:#fff;border:1px solid #dbe2ea;border-radius:20px;padding:30px;box-shadow:0 18px 60px rgba(15,23,42,.12)}
        .print-toolbar{max-width:1500px;margin:0 auto 14px;display:flex;justify-content:space-between;align-items:center;gap:12px}
        .print-back,.print-button{border:1px solid #cbd5e1;border-radius:999px;padding:10px 16px;font:inherit;font-weight:650;text-decoration:none;cursor:pointer}
        .print-back{background:#fff;color:#334155}.print-button{background:#172033;color:#fff;border-color:#172033}
        .print-header{display:flex;justify-content:space-between;gap:30px;align-items:flex-start;padding-bottom:22px;border-bottom:2px solid #e2e8f0}
        .print-brand{display:flex;align-items:center;gap:14px}.print-mark{width:44px;height:44px;border-radius:13px;display:grid;place-items:center;background:linear-gradient(135deg,#6ae0ff,#9b7cff);color:#0b0c10;font-weight:850;font-size:22px}
        .print-header h1{margin:0;font-size:28px;letter-spacing:-.04em}.print-subtitle{margin:5px 0 0;color:#64748b;font-size:13px}
        .print-meta{display:grid;grid-template-columns:auto auto;gap:6px 16px;font-size:12px;color:#64748b;text-align:right}.print-meta strong{color:#334155;font-weight:700}
        .print-summary{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0 22px}.print-chip{padding:7px 10px;border:1px solid #dbe2ea;border-radius:999px;font-size:11px;color:#475569;background:#f8fafc}
        .print-board{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;align-items:start}
        .print-column{border:1px solid #dbe2ea;border-radius:14px;padding:11px;background:#f8fafc;break-inside:avoid;page-break-inside:avoid}
        .print-column-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:9px;font-size:12px;font-weight:800;color:#334155;text-transform:uppercase;letter-spacing:.04em}.print-count{min-width:24px;height:24px;border-radius:999px;background:#e2e8f0;display:grid;place-items:center;font-size:10px}
        .print-card{background:#fff;border:1px solid #dbe2ea;border-radius:10px;padding:10px;margin:0 0 8px;break-inside:avoid;page-break-inside:avoid}.print-card:last-child{margin-bottom:0}.print-card-title{font-size:12px;line-height:1.35;font-weight:750;color:#172033}.print-card-desc{font-size:10px;line-height:1.45;color:#64748b;margin-top:5px;white-space:pre-wrap}.print-card-meta{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}.print-tag{font-size:9px;line-height:1;padding:4px 6px;border:1px solid #dbe2ea;border-radius:999px;color:#475569;background:#f8fafc}.print-priority{font-weight:750;color:#172033}.print-due{font-size:9px;color:#64748b;margin-top:7px}.print-empty{font-size:10px;color:#94a3b8;font-style:italic;padding:6px 2px 2px}
        .print-footer{display:flex;justify-content:space-between;gap:20px;margin-top:22px;padding-top:14px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8}
        @media(max-width:900px){.print-page{padding:14px}.print-sheet{padding:18px}.print-header{flex-direction:column}.print-meta{text-align:left}.print-board{grid-template-columns:1fr}.print-toolbar{padding:0}.print-button,.print-back{font-size:13px}}
        @page{size:A4 landscape;margin:9mm}
        @media print{
          html,body{background:#fff!important;color:#172033!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
          body{margin:0!important}.print-page{padding:0;background:#fff;min-height:auto}.print-toolbar{display:none!important}.print-sheet{max-width:none;margin:0;border:0;border-radius:0;box-shadow:none;padding:0}.print-board{grid-template-columns:repeat(3,minmax(0,1fr));gap:8mm 5mm}.print-column{border-color:#d6dce4;padding:3mm}.print-card{padding:2.5mm;margin-bottom:2mm}.print-header{padding-bottom:4mm}.print-summary{margin:4mm 0 5mm}.print-footer{margin-top:5mm;padding-top:3mm}
        }
      `}</style>

      <PrintActions slug={slug} />

      <section className="print-sheet">
        <header className="print-header">
          <div className="print-brand">
            <div className="print-mark">B</div>
            <div>
              <h1>{workspace.name}</h1>
              <p className="print-subtitle">BoardCue AI · Snapshot della board</p>
            </div>
          </div>
          <div className="print-meta">
            <span>Esportato</span><strong>{exportedAt}</strong>
            <span>Planning model</span><strong>{workspace.planModel}</strong>
            <span>Voice model</span><strong>{workspace.dictationEnabled ? workspace.transcriptionModel : "Disattivato"}</strong>
          </div>
        </header>

        <div className="print-summary">
          <span className="print-chip">{workspace.columns.length} colonne</span>
          <span className="print-chip">{totalCards} card attive</span>
          <span className="print-chip">Workspace: {workspace.slug}</span>
        </div>

        <div className="print-board">
          {workspace.columns.map((column) => (
            <section className="print-column" key={column.id}>
              <div className="print-column-head"><span>{column.title}</span><span className="print-count">{column.cards.length}</span></div>
              {column.cards.length === 0 && <div className="print-empty">Nessuna card</div>}
              {column.cards.map((card) => {
                const tags = readableTags(card.tags);
                const due = formatDate(card.dueDate);
                return (
                  <article className="print-card" key={card.id}>
                    <div className="print-card-title">{card.title}</div>
                    {card.description && <div className="print-card-desc">{card.description}</div>}
                    {(card.priority !== "NORMAL" || tags.length > 0) && (
                      <div className="print-card-meta">
                        {card.priority !== "NORMAL" && <span className="print-tag print-priority">{card.priority.toLowerCase()}</span>}
                        {tags.map((tag) => <span className="print-tag" key={tag}>{tag}</span>)}
                      </div>
                    )}
                    {due && <div className="print-due">Scadenza: {due}</div>}
                  </article>
                );
              })}
            </section>
          ))}
        </div>

        <footer className="print-footer">
          <span>BoardCue AI · Talk. Update. Repeat.</span>
          <span>Snapshot generato da boardcue.draftapps.it</span>
        </footer>
      </section>
    </main>
  );
}
