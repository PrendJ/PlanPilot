import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/security";
import {
  audioFormatFor,
  isAudioDocument,
  processTelegramAudio,
  telegramConfigured,
  telegramReply,
  telegramSay,
  telegramTokenHash,
  validTelegramSecret,
} from "@/lib/telegram";

export const maxDuration = 90;

type TelegramFile = { file_id?: string; file_size?: number; mime_type?: string; file_name?: string };

type TelegramMessage = {
  chat?: { id?: number; type?: string };
  from?: { language_code?: string };
  text?: string;
  caption?: string;
  voice?: TelegramFile;
  audio?: TelegramFile;
  document?: TelegramFile;
  video_note?: TelegramFile;
};

const HOUR = 3600_000;

export async function POST(request: Request) {
  if (!telegramConfigured()) return new Response("Not found", { status: 404 });
  if (!validTelegramSecret(request.headers.get("x-telegram-bot-api-secret-token"))) return new Response("Unauthorized", { status: 401 });
  const raw = await request.text();
  if (raw.length > 50_000) return new Response("Too large", { status: 413 });
  let update: { update_id?: number; message?: TelegramMessage };
  try {
    update = JSON.parse(raw);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const message = update.message;
  if (!message || message.chat?.type !== "private" || !Number.isSafeInteger(message.chat.id) || !Number.isSafeInteger(update.update_id))
    return new Response("OK");
  const chatId = String(message.chat.id);
  const value = message.text?.trim() || "";
  const start = /^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{43})$/.exec(value);
  if (start) {
    const request = await prisma.telegramLinkRequest.findUnique({
      where: { tokenHash: telegramTokenHash(start[1]) },
      include: { user: true },
    });
    if (!request || request.expiresAt <= new Date() || request.user.lifecycleStatus !== "ACTIVE" || !request.user.emailVerifiedAt) {
      await telegramSay(chatId, telegramReply(request?.user.locale || message.from?.language_code, "linkExpired"));
      return new Response("OK");
    }
    const locale = request.user.locale;
    const owner = await prisma.telegramConnection.findUnique({ where: { chatId } });
    if (owner && owner.userId !== request.userId) {
      await telegramSay(chatId, telegramReply(locale, "chatTaken"));
      return new Response("OK");
    }
    await prisma
      .$transaction(async tx => {
        const claimed = await tx.telegramLinkRequest.deleteMany({
          where: { id: request.id, tokenHash: request.tokenHash, expiresAt: { gt: new Date() } },
        });
        if (!claimed.count) throw new Error("TELEGRAM_LINK_EXPIRED");
        await tx.telegramConnection.upsert({
          where: { userId: request.userId },
          create: { userId: request.userId, chatId },
          update: { chatId },
        });
      })
      .catch(error => console.error("Telegram link failed", error));
    const connected = await prisma.telegramConnection.findUnique({ where: { chatId } });
    await telegramSay(chatId, telegramReply(locale, connected?.userId === request.userId ? "linked" : "linkFailed"));
    return new Response("OK");
  }
  const connection = await prisma.telegramConnection.findUnique({ where: { chatId }, include: { user: true } });
  const linked = connection?.user.lifecycleStatus === "ACTIVE" ? connection : null;
  const locale = linked?.user.locale || message.from?.language_code;
  const say = (key: Parameters<typeof telegramReply>[1]) => telegramSay(chatId, telegramReply(locale, key));
  if (/^\/unlink(?:@\w+)?$/.test(value)) {
    await prisma.telegramConnection.deleteMany({ where: { chatId } });
    await say("unlinked");
    return new Response("OK");
  }
  if (!linked) {
    await say("notLinked");
    return new Response("OK");
  }
  if (value.startsWith("/")) {
    await say("help");
    return new Response("OK");
  }
  if (message.video_note) {
    await say("videoNote");
    return new Response("OK");
  }
  const audio = message.voice || message.audio || (message.document && isAudioDocument(message.document) ? message.document : undefined);
  if (!value && !audio) {
    await say("help");
    return new Response("OK");
  }
  if (audio && (!audio.file_id || (audio.file_size || 0) > 8 * 1024 * 1024)) {
    await say("audioTooLarge");
    return new Response("OK");
  }
  if (audio && audioFormatFor(audio.file_name, audio.mime_type) === "unsupported") {
    await say("unsupportedFormat");
    return new Response("OK");
  }
  const existing = await prisma.externalCapture.findUnique({ where: { telegramUpdateId: String(update.update_id) }, select: { id: true } });
  if (existing) return new Response("OK");
  if (await rateLimit(audio ? `telegram-audio:${chatId}` : `telegram-text:${chatId}`, audio ? 20 : 60, HOUR)) {
    await say("rateLimited");
    return new Response("OK");
  }
  const capture = await prisma.externalCapture
    .create({
      data: {
        userId: linked.userId,
        source: "TELEGRAM",
        text: (audio ? message.caption?.trim() || "" : value).slice(0, 12_000),
        status: audio ? "PENDING" : "READY",
        telegramFileId: audio?.file_id || null,
        telegramUpdateId: String(update.update_id),
      },
    })
    .catch(async error => {
      // Telegram may retry an update while the first request is still finishing.
      if ((error as { code?: string }).code === "P2002") return null;
      throw error;
    });
  if (!capture) return new Response("OK");
  if (audio) {
    after(() => processTelegramAudio(capture.id));
    await say("audioReceived");
  } else await say("saved");
  return new Response("OK");
}
