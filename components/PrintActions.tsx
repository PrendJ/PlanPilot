"use client";

export function PrintActions({ slug }: { slug: string }) {
  return (
    <div className="print-toolbar" aria-label="Azioni export PDF">
      <a className="print-back" href={`/app/${slug}`}>← Torna alla board</a>
      <button type="button" className="print-button" onClick={() => window.print()}>Stampa / Salva PDF</button>
    </div>
  );
}
