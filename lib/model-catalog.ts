export type ModelOption = {
  id: string;
  label: string;
  price: string;
  context?: string;
  note: string;
  recommended?: boolean;
  baseline?: boolean;
};

export const PLAN_MODELS: ModelOption[] = [
  {
    id: "openai/gpt-oss-120b",
    label: "GPT-OSS 120B",
    price: "~$0.03 input / ~$0.17 output per 1M token",
    context: "131K",
    note: "Consigliato: modello molto più grande di Nano, supporta structured output e costa meno sia in input sia in output.",
    recommended: true,
  },
  {
    id: "openai/gpt-oss-20b",
    label: "GPT-OSS 20B",
    price: "~$0.03 input / ~$0.14 output per 1M token",
    context: "131K",
    note: "Scelta economica e veloce; supporta structured output ed è adatto agli aggiornamenti semplici della board.",
  },
  {
    id: "qwen/qwen-2.5-7b-instruct",
    label: "Qwen2.5 7B Instruct",
    price: "$0.04 input / $0.10 output per 1M token",
    context: "33K su OpenRouter",
    note: "Molto economico, multilingua e forte su JSON/structured data; meno intelligente dei modelli OSS più grandi e con contesto inferiore.",
  },
  {
    id: "openrouter/free",
    label: "OpenRouter Free Router",
    price: "$0",
    context: "fino a ~200K, dipende dal modello scelto",
    note: "OpenRouter sceglie automaticamente un modello gratuito compatibile con lo structured output richiesto. Qualità, latenza e disponibilità possono variare.",
  },
  {
    id: "openai/gpt-5-nano",
    label: "GPT-5 Nano — benchmark attuale",
    price: "$0.05 input / $0.40 output per 1M token",
    context: "400K",
    note: "Modello attualmente usato. Rimane selezionabile per confronto e compatibilità con i workspace esistenti.",
    baseline: true,
  },
];

export const TRANSCRIPTION_MODELS: ModelOption[] = [
  {
    id: "openai/whisper-large-v3-turbo",
    label: "Whisper Large V3 Turbo",
    price: "$0.04/ora (~$0.00067/min)",
    note: "Consigliato per costo: 99+ lingue, ottimizzato per velocità e trascrizione ad alto volume.",
    recommended: true,
  },
  {
    id: "nvidia/parakeet-tdt-0.6b-v3",
    label: "NVIDIA Parakeet TDT 0.6B v3",
    price: "$0.0015/min ($0.09/ora)",
    note: "Molto economico, supporta tutte le lingue ufficiali UE, rilevamento lingua automatico, punteggiatura e timestamp.",
  },
  {
    id: "openai/whisper-large-v3",
    label: "Whisper Large V3",
    price: "$0.0015/min (~$0.09/ora)",
    note: "Whisper completo, 99+ lingue, robusto sul rumore e leggermente più accurato della variante Turbo.",
  },
  {
    id: "mistralai/voxtral-mini-transcribe",
    label: "Voxtral Mini Transcribe",
    price: "$0.003/min ($0.18/ora)",
    note: "Modello Mistral dedicato alla trascrizione di note vocali, meeting, podcast e parlato generale.",
  },
  {
    id: "openai/whisper-1",
    label: "Whisper 1",
    price: "$0.006/min ($0.36/ora)",
    note: "Modello Whisper classico e stabile, più costoso delle alternative recenti.",
  },
  {
    id: "openai/gpt-4o-mini-transcribe",
    label: "GPT-4o Mini Transcribe — attuale",
    price: "$1.25/M input token + $5/M output token",
    context: "128K",
    note: "Modello di dettatura attualmente configurato; il costo è a token anziché a durata.",
    baseline: true,
  },
];

export const PLAN_MODEL_IDS = new Set(PLAN_MODELS.map((model) => model.id));
export const TRANSCRIPTION_MODEL_IDS = new Set(TRANSCRIPTION_MODELS.map((model) => model.id));
