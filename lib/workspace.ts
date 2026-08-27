import { prisma } from "@/lib/prisma";

export const SUPPORTED_LOCALES = ["it", "en", "de", "fr", "es", "ru", "pl"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export type PresetKey = "GENERAL" | "SOFTWARE" | "MARKETING" | "PROJECT" | "CONSULTING";
type PresetColumn = { title: string; description: string; semanticKey: string };

const PRESETS: Record<PresetKey, PresetColumn[]> = {
  GENERAL: [
    { title: "Inbox", description: "Nuove idee e attività ancora da organizzare", semanticKey: "INBOX" },
    { title: "Da fare", description: "Attività pronte per essere iniziate", semanticKey: "READY" },
    { title: "In corso", description: "Lavoro attualmente in esecuzione", semanticKey: "ACTIVE" },
    { title: "Bloccato", description: "Attività che non possono avanzare", semanticKey: "BLOCKED" },
    { title: "Completato", description: "Lavoro concluso", semanticKey: "DONE" },
  ],
  SOFTWARE: [
    { title: "Backlog", description: "Funzionalità e bug non ancora pianificati", semanticKey: "BACKLOG" },
    { title: "Pronto", description: "Attività definite e pronte allo sviluppo", semanticKey: "READY" },
    { title: "Sviluppo", description: "Codice in lavorazione", semanticKey: "ACTIVE" },
    { title: "Code review", description: "Modifiche in revisione", semanticKey: "REVIEW" },
    { title: "QA", description: "Verifica e test", semanticKey: "QA" },
    { title: "Fatto", description: "Sviluppo completato", semanticKey: "DONE" },
  ],
  MARKETING: [
    { title: "Idee / Brief", description: "Idee, richieste e brief iniziali", semanticKey: "INBOX" },
    { title: "Pianificato", description: "Attività approvate e programmate", semanticKey: "READY" },
    { title: "In produzione", description: "Contenuti e campagne in lavorazione", semanticKey: "ACTIVE" },
    { title: "Approvazione", description: "Materiali in revisione o approvazione", semanticKey: "REVIEW" },
    { title: "Programmato", description: "Contenuti pronti con data di pubblicazione", semanticKey: "SCHEDULED" },
    { title: "Pubblicato", description: "Campagne e contenuti pubblicati", semanticKey: "DONE" },
  ],
  PROJECT: [
    { title: "Backlog", description: "Attività non ancora pianificate", semanticKey: "BACKLOG" },
    { title: "Pianificato", description: "Lavoro inserito nel piano", semanticKey: "READY" },
    { title: "In corso", description: "Attività attualmente in esecuzione", semanticKey: "ACTIVE" },
    { title: "Bloccato", description: "Attività ferme per dipendenze o problemi", semanticKey: "BLOCKED" },
    { title: "Verifica", description: "Output in controllo o accettazione", semanticKey: "REVIEW" },
    { title: "Completato", description: "Attività concluse", semanticKey: "DONE" },
  ],
  CONSULTING: [
    { title: "Richieste", description: "Nuove richieste del cliente", semanticKey: "INBOX" },
    { title: "Qualificato", description: "Richieste comprese e confermate", semanticKey: "QUALIFIED" },
    { title: "Pianificato", description: "Attività concordate e pianificate", semanticKey: "READY" },
    { title: "In lavorazione", description: "Lavoro attualmente in corso", semanticKey: "ACTIVE" },
    { title: "In attesa cliente", description: "Serve un input o un'approvazione del cliente", semanticKey: "BLOCKED" },
    { title: "Consegnato", description: "Output consegnato al cliente", semanticKey: "DONE" },
  ],
};

const TITLES: Record<Exclude<SupportedLocale, "it">, Record<PresetKey, string[]>> = {
  en: { GENERAL: ["Inbox", "To do", "In progress", "Blocked", "Completed"], SOFTWARE: ["Backlog", "Ready", "Development", "Code review", "QA", "Done"], MARKETING: ["Ideas / Brief", "Planned", "In production", "Approval", "Scheduled", "Published"], PROJECT: ["Backlog", "Planned", "In progress", "Blocked", "Review", "Completed"], CONSULTING: ["Requests", "Qualified", "Planned", "In progress", "Waiting for client", "Delivered"] },
  de: { GENERAL: ["Eingang", "Zu erledigen", "In Arbeit", "Blockiert", "Erledigt"], SOFTWARE: ["Backlog", "Bereit", "Entwicklung", "Code-Review", "QA", "Erledigt"], MARKETING: ["Ideen / Briefing", "Geplant", "In Produktion", "Freigabe", "Eingeplant", "Veröffentlicht"], PROJECT: ["Backlog", "Geplant", "In Arbeit", "Blockiert", "Prüfung", "Erledigt"], CONSULTING: ["Anfragen", "Qualifiziert", "Geplant", "In Arbeit", "Warten auf Kunde", "Geliefert"] },
  fr: { GENERAL: ["Boîte de réception", "À faire", "En cours", "Bloqué", "Terminé"], SOFTWARE: ["Backlog", "Prêt", "Développement", "Revue de code", "QA", "Terminé"], MARKETING: ["Idées / Brief", "Planifié", "En production", "Approbation", "Programmé", "Publié"], PROJECT: ["Backlog", "Planifié", "En cours", "Bloqué", "Vérification", "Terminé"], CONSULTING: ["Demandes", "Qualifié", "Planifié", "En cours", "En attente du client", "Livré"] },
  es: { GENERAL: ["Bandeja de entrada", "Por hacer", "En curso", "Bloqueado", "Completado"], SOFTWARE: ["Backlog", "Listo", "Desarrollo", "Revisión de código", "QA", "Hecho"], MARKETING: ["Ideas / Brief", "Planificado", "En producción", "Aprobación", "Programado", "Publicado"], PROJECT: ["Backlog", "Planificado", "En curso", "Bloqueado", "Revisión", "Completado"], CONSULTING: ["Solicitudes", "Cualificado", "Planificado", "En curso", "Esperando al cliente", "Entregado"] },
  ru: { GENERAL: ["Входящие", "К выполнению", "В работе", "Заблокировано", "Завершено"], SOFTWARE: ["Бэклог", "Готово", "Разработка", "Проверка кода", "QA", "Готово"], MARKETING: ["Идеи / Бриф", "Запланировано", "В производстве", "Согласование", "В расписании", "Опубликовано"], PROJECT: ["Бэклог", "Запланировано", "В работе", "Заблокировано", "Проверка", "Завершено"], CONSULTING: ["Запросы", "Квалифицировано", "Запланировано", "В работе", "Ожидание клиента", "Передано"] },
  pl: { GENERAL: ["Skrzynka", "Do zrobienia", "W toku", "Zablokowane", "Ukończone"], SOFTWARE: ["Backlog", "Gotowe", "Programowanie", "Przegląd kodu", "QA", "Zrobione"], MARKETING: ["Pomysły / Brief", "Zaplanowane", "W produkcji", "Akceptacja", "W harmonogramie", "Opublikowane"], PROJECT: ["Backlog", "Zaplanowane", "W toku", "Zablokowane", "Weryfikacja", "Ukończone"], CONSULTING: ["Zgłoszenia", "Zakwalifikowane", "Zaplanowane", "W toku", "Oczekiwanie na klienta", "Dostarczone"] },
};

const DESCRIPTIONS: Record<Exclude<SupportedLocale, "it">, Record<string, string>> = {
  en: { INBOX: "New ideas and requests to organize", READY: "Work ready to begin", ACTIVE: "Work currently in progress", BLOCKED: "Work waiting for an input or dependency", DONE: "Completed or delivered work", BACKLOG: "Work not yet planned", REVIEW: "Work awaiting review or approval", QA: "Work being verified and tested", SCHEDULED: "Approved work scheduled for publication", QUALIFIED: "Requests understood and confirmed" },
  de: { INBOX: "Neue Ideen und Anfragen zur Einordnung", READY: "Arbeitsbereit", ACTIVE: "Derzeit in Bearbeitung", BLOCKED: "Wartet auf Eingabe oder Abhängigkeit", DONE: "Abgeschlossene oder gelieferte Arbeit", BACKLOG: "Noch nicht geplante Arbeit", REVIEW: "Wartet auf Prüfung oder Freigabe", QA: "In Prüfung und Test", SCHEDULED: "Zur Veröffentlichung eingeplant", QUALIFIED: "Verstandene und bestätigte Anfragen" },
  fr: { INBOX: "Nouvelles idées et demandes à organiser", READY: "Travail prêt à commencer", ACTIVE: "Travail actuellement en cours", BLOCKED: "En attente d’une entrée ou dépendance", DONE: "Travail terminé ou livré", BACKLOG: "Travail pas encore planifié", REVIEW: "En attente de revue ou d’approbation", QA: "En cours de vérification et de test", SCHEDULED: "Publication approuvée et programmée", QUALIFIED: "Demandes comprises et confirmées" },
  es: { INBOX: "Nuevas ideas y solicitudes por organizar", READY: "Trabajo listo para comenzar", ACTIVE: "Trabajo actualmente en curso", BLOCKED: "En espera de una entrada o dependencia", DONE: "Trabajo completado o entregado", BACKLOG: "Trabajo aún no planificado", REVIEW: "En espera de revisión o aprobación", QA: "En verificación y pruebas", SCHEDULED: "Publicación aprobada y programada", QUALIFIED: "Solicitudes comprendidas y confirmadas" },
  ru: { INBOX: "Новые идеи и запросы для организации", READY: "Работа готова к началу", ACTIVE: "Работа выполняется сейчас", BLOCKED: "Ожидает данных или зависимости", DONE: "Завершённая или переданная работа", BACKLOG: "Ещё не запланированная работа", REVIEW: "Ожидает проверки или согласования", QA: "Проверка и тестирование", SCHEDULED: "Одобрено и запланировано к публикации", QUALIFIED: "Запросы поняты и подтверждены" },
  pl: { INBOX: "Nowe pomysły i zgłoszenia do uporządkowania", READY: "Praca gotowa do rozpoczęcia", ACTIVE: "Praca obecnie w toku", BLOCKED: "Oczekuje na dane lub zależność", DONE: "Praca ukończona lub dostarczona", BACKLOG: "Praca jeszcze niezaplanowana", REVIEW: "Oczekuje na przegląd lub akceptację", QA: "W trakcie weryfikacji i testów", SCHEDULED: "Zatwierdzone i zaplanowane do publikacji", QUALIFIED: "Zgłoszenia zrozumiane i potwierdzone" },
};

export const PRESET_LABELS: Record<PresetKey, string> = { GENERAL: "Generico", SOFTWARE: "Sviluppo software", MARKETING: "Marketing", PROJECT: "Project management", CONSULTING: "Consulenza / Clienti" };

export function normalizeLocale(value?: string): SupportedLocale {
  return SUPPORTED_LOCALES.includes(value as SupportedLocale) ? value as SupportedLocale : "it";
}

export function getPreset(key: string = "GENERAL", locale: string = "it") {
  const presetKey = (Object.keys(PRESETS).includes(key) ? key : "GENERAL") as PresetKey;
  const base = PRESETS[presetKey];
  const language = normalizeLocale(locale);
  const translated = language === "it" ? null : TITLES[language][presetKey];
  return base.map((column, position) => ({ ...column, title: translated?.[position] || column.title, description: language === "it" ? column.description : DESCRIPTIONS[language][column.semanticKey] || column.description, position }));
}

export function slugify(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 48);
}

async function uniqueSlug(base: string, model: "workspace" | "organization") {
  const root = slugify(base) || model;
  for (let i = 0; i < 100; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const found = model === "workspace" ? await prisma.workspace.findUnique({ where: { slug: candidate }, select: { id: true } }) : await prisma.organization.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!found) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

export async function createOrganization(input: { name: string; userId: string; locale?: string; legalType?: string }) {
  const locale = normalizeLocale(input.locale);
  const creator = await prisma.user.findUnique({ where: { id: input.userId }, select: { lifetimeFree: true } });
  const lifetime = Boolean(creator?.lifetimeFree);
  return prisma.organization.create({ data: { name: input.name, slug: await uniqueSlug(input.name, "organization"), legalType: input.legalType === "PERSONAL" ? "PERSONAL" : "BUSINESS", locale, plan: lifetime ? "LIFETIME" : "TRIAL", licenseSource: lifetime ? "LIFETIME" : "TRIAL", trialEndsAt: lifetime ? null : new Date(Date.now() + 7 * 86400000), createdById: input.userId, members: { create: { userId: input.userId, role: "OWNER" } } } });
}

export async function createWorkspace(input: { name: string; slug?: string; userId: string; organizationId?: string; presetKey?: string; locale?: string; openrouterKeyEnv?: string; planModel?: string; transcriptionModel?: string }) {
  const locale = normalizeLocale(input.locale);
  let organizationId = input.organizationId;
  if (!organizationId) organizationId = (await createOrganization({ name: input.name, userId: input.userId, locale })).id;
  const slug = input.slug || await uniqueSlug(input.name, "workspace");
  return prisma.workspace.create({ data: { organizationId, name: input.name, slug, presetKey: input.presetKey || "GENERAL", locale, openrouterKeyEnv: input.openrouterKeyEnv || "OPENROUTER_API_KEY", planModel: input.planModel || "openai/gpt-5-nano", transcriptionModel: input.transcriptionModel || "openai/whisper-large-v3-turbo", createdById: input.userId, members: { create: { userId: input.userId, role: "OWNER" } }, columns: { create: getPreset(input.presetKey, locale) } } });
}

export function getWorkspaceApiKey(workspace: { slug: string; openrouterKeyEnv: string }) {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  if (workspace.openrouterKeyEnv && process.env[workspace.openrouterKeyEnv]) return process.env[workspace.openrouterKeyEnv]!;
  if (process.env.OPENROUTER_WORKSPACE_KEYS) {
    try { const map = JSON.parse(process.env.OPENROUTER_WORKSPACE_KEYS) as Record<string, string>; if (map[workspace.slug]) return map[workspace.slug]; } catch {}
  }
  return null;
}
