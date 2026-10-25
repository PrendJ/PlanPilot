/** Suppliers (sub-processors) that process data for BoardCue; shown inside the Privacy Policy, section "Fornitori". */
const rows = [
  [
    "Hosting e database",
    process.env.HOSTING_PROVIDER || "Da indicare (server del titolare gestito con Coolify)",
    process.env.HOSTING_LOCATION || "UE",
    "Erogazione del servizio, database PostgreSQL, backup",
    "Tutti i dati del servizio",
  ],
  [
    "OpenRouter, Inc.",
    "Stati Uniti",
    "UE / USA (in transito, zero data retention)",
    "Instradamento delle richieste AI verso i provider di modelli",
    "Testo dell’aggiornamento, contesto ridotto della board, audio (non conservato)",
  ],
  [
    "Provider di modelli scelti da OpenRouter tra gli endpoint a zero conservazione (ad esempio OpenAI, Microsoft Azure, Mistral AI)",
    "Stati Uniti / Francia",
    "UE / USA (solo endpoint con zero data retention)",
    "Interpretazione degli aggiornamenti e trascrizione della dettatura",
    "Come sopra, senza conservazione",
  ],
  [
    "Stripe Payments Europe, Ltd.",
    "Dublino, Irlanda",
    "UE / USA (DPF)",
    "Pagamenti, abbonamenti, imposte, fatture",
    "Dati di fatturazione e di pagamento",
  ],
  [
    process.env.SMTP_PROVIDER_NAME || "Provider email transazionali",
    process.env.SMTP_PROVIDER_LOCATION || "Da indicare",
    "—",
    "Email di verifica, inviti, promemoria, riepiloghi",
    "Nome, email, contenuto del messaggio",
  ],
] as const;

export function SupplierTable() {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Fornitore</th>
            <th>Sede</th>
            <th>Luogo del trattamento</th>
            <th>Finalità</th>
            <th>Dati</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row[0]}>
              {row.map(cell => (
                <td key={cell}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
