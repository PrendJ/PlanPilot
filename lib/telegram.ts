import { createHash, timingSafeEqual } from "node:crypto";
import { MAX_AUDIO_BYTES, openRouterBaseUrl, openRouterHeaders, providerPolicy } from "@/lib/ai-config";
import { canWriteCards, workspaceReadOnly } from "@/lib/board";
import { platformModels } from "@/lib/platform-ai";
import { getUsageStatus, recordUsage } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { getWorkspaceApiKey } from "@/lib/workspace";

/** Automatic retries stop here (cron); manual retries from the home inbox stop at the hard cap. */
export const AUTO_CAPTURE_ATTEMPTS = 3;
export const MAX_CAPTURE_ATTEMPTS = 6;

const REPLIES = {
  it: {
    linkExpired: "Link scaduto. Generane uno nuovo dalle integrazioni di BoardCue.",
    chatTaken: "Questa chat è già collegata a un altro account. Usa /unlink prima di collegarne uno nuovo.",
    linked: "Telegram collegato. Inviami un messaggio o un audio: lo troverai nella casella della home di BoardCue.",
    linkFailed: "Collegamento non riuscito. Riprova da BoardCue.",
    unlinked: "Chat scollegata da BoardCue.",
    notLinked: "Apri BoardCue → Integrazioni per collegare questa chat.",
    help: "Inviami un messaggio di testo o un audio: lo salvo nella casella della home di BoardCue. Usa /unlink per scollegare questa chat.",
    videoNote: "Posso ricevere solo messaggi vocali o file audio, non videomessaggi.",
    audioTooLarge: "Audio troppo grande: il limite è 8 MB.",
    unsupportedFormat: "Formato audio non supportato. Usa OGG/Opus, MP3, M4A, WAV o WebM.",
    rateLimited: "Hai inviato molti messaggi nell’ultima ora. Riprova più tardi.",
    audioReceived: "Audio ricevuto. Lo trascrivo e lo salvo nella casella della home di BoardCue.",
    saved: "Salvato nella casella della home di BoardCue. Apri la home per organizzarlo e approvare le modifiche.",
    transcribed: "Audio trascritto e salvato nella casella della home di BoardCue. Apri la home per organizzarlo e approvare le modifiche.",
    retrying: "Non sono riuscito a trascrivere l’audio. Riproverò automaticamente; puoi anche riprovare dalla home di BoardCue.",
    failed: "Non sono riuscito a trascrivere l’audio. Apri la home di BoardCue per riprovare.",
  },
  en: {
    linkExpired: "This link has expired. Create a new one from BoardCue integrations.",
    chatTaken: "This chat is already linked to another account. Use /unlink before linking a new one.",
    linked: "Telegram linked. Send me a message or a voice note: you will find it in your BoardCue home inbox.",
    linkFailed: "Linking failed. Try again from BoardCue.",
    unlinked: "Chat disconnected from BoardCue.",
    notLinked: "Open BoardCue → Integrations to link this chat.",
    help: "Send me a text message or a voice note: I will save it to your BoardCue home inbox. Use /unlink to disconnect this chat.",
    videoNote: "I can only receive voice messages or audio files, not video messages.",
    audioTooLarge: "Audio too large: the limit is 8 MB.",
    unsupportedFormat: "Unsupported audio format. Use OGG/Opus, MP3, M4A, WAV or WebM.",
    rateLimited: "You have sent a lot of messages in the last hour. Please try again later.",
    audioReceived: "Audio received. I will transcribe it and save it to your BoardCue home inbox.",
    saved: "Saved to your BoardCue home inbox. Open the home to organize it and approve the changes.",
    transcribed: "Audio transcribed and saved to your BoardCue home inbox. Open the home to organize it and approve the changes.",
    retrying: "I could not transcribe the audio. I will retry automatically; you can also retry from the BoardCue home.",
    failed: "I could not transcribe the audio. Open the BoardCue home to retry.",
  },
} as const;

export type TelegramReply = keyof (typeof REPLIES)["en"];

export function telegramReply(locale: string | null | undefined, key: TelegramReply) {
  return REPLIES[locale?.toLowerCase().startsWith("it") ? "it" : "en"][key];
}

export function telegramConfigured() {
  return Boolean(
    process.env.TELEGRAM_BOT_TOKEN &&
    /^[A-Za-z0-9_]{5,32}$/.test((process.env.TELEGRAM_BOT_USERNAME || "").replace(/^@/, "")) &&
    /^[A-Za-z0-9_-]{1,256}$/.test(process.env.TELEGRAM_WEBHOOK_SECRET || ""),
  );
}

export function telegramTokenHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function validTelegramSecret(actual: string | null) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || !actual) return false;
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

export async function telegramApi<T>(method: string, body: object): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_NOT_CONFIGURED");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await response.json();
  if (!response.ok || !data?.ok) throw new Error(`TELEGRAM_${method}_FAILED`);
  return data.result as T;
}

export async function telegramSay(chatId: string, text: string) {
  await telegramApi("sendMessage", { chat_id: chatId, text, disable_web_page_preview: true }).catch(error =>
    console.error("Telegram message failed", error),
  );
}

export type AudioFormat = "ogg" | "mp3" | "m4a" | "wav" | "webm";

const EXTENSION_FORMATS: Record<string, AudioFormat | "unsupported"> = {
  ogg: "ogg",
  oga: "ogg",
  opus: "ogg",
  mp3: "mp3",
  m4a: "m4a",
  mp4: "m4a",
  aac: "m4a",
  wav: "wav",
  webm: "webm",
  flac: "unsupported",
};

/**
 * Maps a Telegram file name/path (or, failing that, its mime type) to a format the transcription endpoint accepts.
 * "unsupported" for audio it rejects (FLAC), null when nothing is recognizable.
 */
export function audioFormatFor(name?: string | null, mime?: string | null): AudioFormat | "unsupported" | null {
  const extension = /\.([A-Za-z0-9]{2,5})$/.exec(name || "")?.[1]?.toLowerCase();
  if (extension && EXTENSION_FORMATS[extension]) return EXTENSION_FORMATS[extension];
  const type = (mime || "").toLowerCase();
  if (type.includes("flac")) return "unsupported";
  if (type.includes("webm")) return "webm";
  if (type.includes("ogg") || type.includes("opus")) return "ogg";
  if (type.includes("mpeg") || type.includes("mp3")) return "mp3";
  if (type.includes("mp4") || type.includes("m4a") || type.includes("aac")) return "m4a";
  if (type.includes("wav") || type.includes("wave")) return "wav";
  return null;
}

/** Documents count as audio when Telegram reports an audio mime type or the file name has an audio extension. */
export function isAudioDocument(document: { mime_type?: string; file_name?: string }) {
  return (document.mime_type || "").toLowerCase().startsWith("audio/") || audioFormatFor(document.file_name) !== null;
}

type TranscriptionCandidate = {
  role: string;
  workspace: Parameters<typeof workspaceReadOnly>[0] &
    Parameters<typeof getWorkspaceApiKey>[0] & {
      id: string;
      organizationId: string;
      createdAt: Date;
      dictationEnabled: boolean;
      organization: { members?: { role: string }[] };
    };
};

/** Bills the default organization first, then organizations the user manages, then the rest; oldest board wins ties. */
export function chooseTranscriptionWorkspace<T extends TranscriptionCandidate>(memberships: T[], defaultOrganizationId: string | null) {
  const rank = (item: T) =>
    item.workspace.organizationId === defaultOrganizationId
      ? 0
      : ["OWNER", "ADMIN"].includes(item.workspace.organization.members?.[0]?.role || "")
        ? 1
        : 2;
  return (
    memberships
      .filter(
        item =>
          item.workspace.dictationEnabled &&
          canWriteCards(item.role) &&
          !workspaceReadOnly(item.workspace) &&
          getWorkspaceApiKey(item.workspace),
      )
      .sort(
        (a, b) =>
          rank(a) - rank(b) ||
          a.workspace.createdAt.getTime() - b.workspace.createdAt.getTime() ||
          a.workspace.id.localeCompare(b.workspace.id),
      )[0] || null
  );
}

/** Runs after the webhook response; the capture remains retryable if transcription fails. */
export async function processTelegramAudio(captureId: string) {
  const stale = new Date(Date.now() - 5 * 60_000);
  const claimed = await prisma.externalCapture.updateMany({
    where: {
      id: captureId,
      attempts: { lt: MAX_CAPTURE_ATTEMPTS },
      OR: [{ status: { in: ["PENDING", "FAILED"] } }, { status: "PROCESSING", updatedAt: { lt: stale } }],
    },
    data: { status: "PROCESSING", attempts: { increment: 1 } },
  });
  if (!claimed.count) return;
  const capture = await prisma.externalCapture.findUnique({ where: { id: captureId } });
  if (!capture) return;
  if (!capture.telegramFileId) {
    await prisma.externalCapture.updateMany({ where: { id: captureId }, data: { status: "FAILED" } });
    return;
  }
  const connection = await prisma.telegramConnection.findUnique({ where: { userId: capture.userId }, include: { user: true } });
  if (!connection || connection.user.lifecycleStatus !== "ACTIVE") {
    await prisma.externalCapture.deleteMany({ where: { id: captureId } });
    return;
  }
  const locale = connection.user.locale;
  try {
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: capture.userId, workspace: { lifecycleStatus: "ACTIVE", dictationEnabled: true } },
      include: {
        workspace: {
          include: { organization: { include: { members: { where: { userId: capture.userId }, select: { role: true }, take: 1 } } } },
        },
      },
    });
    const choice = chooseTranscriptionWorkspace(memberships, connection.user.defaultOrganizationId);
    if (!choice) throw new Error("NO_DICTATION_BOARD");
    const workspace = choice.workspace;
    const quota = await getUsageStatus(workspace.organizationId);
    if (!quota || quota.status === "PAUSED") throw new Error("QUOTA_EXHAUSTED");
    const file = await telegramApi<{ file_path?: string; file_size?: number }>("getFile", { file_id: capture.telegramFileId });
    if (
      !file.file_path ||
      !/^[A-Za-z0-9_.\/-]+$/.test(file.file_path) ||
      file.file_path.split("/").includes("..") ||
      (file.file_size || 0) > MAX_AUDIO_BYTES
    )
      throw new Error("AUDIO_UNAVAILABLE");
    const format = audioFormatFor(file.file_path) ?? "ogg";
    if (format === "unsupported") throw new Error("UNSUPPORTED_AUDIO_FORMAT");
    const response = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`, {
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok || Number(response.headers.get("content-length") || 0) > MAX_AUDIO_BYTES) throw new Error("AUDIO_UNAVAILABLE");
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > MAX_AUDIO_BYTES) throw new Error("AUDIO_UNAVAILABLE");
    const model = (await platformModels()).transcriptionModel;
    const transcribed = await fetch(`${openRouterBaseUrl()}/audio/transcriptions`, {
      method: "POST",
      signal: AbortSignal.timeout(60_000),
      headers: openRouterHeaders(getWorkspaceApiKey(workspace)!),
      body: JSON.stringify({
        model,
        input_audio: { data: buffer.toString("base64"), format },
        language: workspace.locale,
        provider: providerPolicy(),
      }),
    });
    const result = await transcribed.json().catch(() => null);
    if (!transcribed.ok || typeof result?.text !== "string" || !result.text.trim()) throw new Error("TRANSCRIPTION_FAILED");
    const caption = capture.text.trim();
    const saved = await prisma.externalCapture.updateMany({
      where: { id: captureId },
      data: {
        text: (caption ? `${caption}\n\n${result.text.trim()}` : result.text.trim()).slice(0, 12_000),
        status: "READY",
        telegramFileId: null,
      },
    });
    await recordUsage({
      organizationId: workspace.organizationId,
      workspaceId: workspace.id,
      userId: capture.userId,
      providerRequestId: result.id,
      category: "TRANSCRIPTION",
      model,
      costUsd: result?.usage?.cost,
    });
    if (saved.count) await telegramSay(connection.chatId, telegramReply(locale, "transcribed"));
  } catch (error) {
    console.error("Telegram audio processing failed", error);
    const unsupported = error instanceof Error && error.message === "UNSUPPORTED_AUDIO_FORMAT";
    // updateMany: the user may have deleted the capture while it was being processed.
    const failed = await prisma.externalCapture
      .updateMany({ where: { id: captureId }, data: unsupported ? { status: "FAILED", telegramFileId: null } : { status: "FAILED" } })
      .catch(() => ({ count: 0 }));
    if (!failed.count) return;
    const attempts = capture.attempts;
    if (unsupported) await telegramSay(connection.chatId, telegramReply(locale, "unsupportedFormat"));
    else if (attempts === 1) await telegramSay(connection.chatId, telegramReply(locale, "retrying"));
    else if (attempts === AUTO_CAPTURE_ATTEMPTS) await telegramSay(connection.chatId, telegramReply(locale, "failed"));
  }
}
