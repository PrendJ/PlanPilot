import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ db: {} as any, after: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.db }));
vi.mock("@/lib/platform-ai", () => ({ platformModels: async () => ({ planModel: "plan", transcriptionModel: "voice" }) }));
vi.mock("next/server", async original => ({ ...(await original<typeof import("next/server")>()), after: mocks.after }));
import {
  audioFormatFor,
  chooseTranscriptionWorkspace,
  isAudioDocument,
  MAX_CAPTURE_ATTEMPTS,
  processTelegramAudio,
  telegramReply,
  telegramTokenHash,
  validTelegramSecret,
} from "../lib/telegram";
import { POST as telegramWebhook } from "../app/api/integrations/telegram/webhook/route";

const SECRET = "long_random_secret_123";
let sent: Array<{ chat_id: string; text: string }> = [];
let updateId = 100;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token");
  vi.stubEnv("TELEGRAM_BOT_USERNAME", "BoardCueTestBot");
  vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  sent = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ ok: true, result: {} }));
    }),
  );
  mocks.db.telegramConnection = {
    findUnique: vi.fn().mockResolvedValue({ userId: "user", chatId: "7", user: { lifecycleStatus: "ACTIVE", locale: "en" } }),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  mocks.db.externalCapture = {
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn(async ({ data }: any) => ({ id: "capture", ...data })),
  };
  mocks.db.$queryRaw = vi.fn().mockResolvedValue([{ count: 1, resetAt: new Date(Date.now() + 3600_000) }]);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const deliver = (message: object, secret: string | null = SECRET) =>
  telegramWebhook(
    new Request("https://example.com/api/integrations/telegram/webhook", {
      method: "POST",
      headers: secret ? { "x-telegram-bot-api-secret-token": secret } : {},
      body: JSON.stringify({ update_id: ++updateId, message: { chat: { id: 7, type: "private" }, ...message } }),
    }),
  );

describe("Telegram linking", () => {
  it("compares webhook secrets exactly and hashes linking tokens", () => {
    expect(validTelegramSecret(SECRET)).toBe(true);
    expect(validTelegramSecret("long_random_secret_124")).toBe(false);
    expect(validTelegramSecret("éong_random_secret_123")).toBe(false);
    expect(validTelegramSecret(null)).toBe(false);
    expect(telegramTokenHash("abc")).toBe(telegramTokenHash("abc"));
    expect(telegramTokenHash("abc")).not.toBe(telegramTokenHash("abd"));
  });

  it("replies in Italian only for Italian locales", () => {
    expect(telegramReply("it", "unlinked")).toBe("Chat scollegata da BoardCue.");
    expect(telegramReply("it-IT", "unlinked")).toBe("Chat scollegata da BoardCue.");
    expect(telegramReply("de", "unlinked")).toBe("Chat disconnected from BoardCue.");
    expect(telegramReply(undefined, "unlinked")).toBe("Chat disconnected from BoardCue.");
  });
});

describe("Telegram webhook boundary", () => {
  it("rejects missing secrets and ignores group messages before touching account data", async () => {
    const body = JSON.stringify({ update_id: 42, message: { chat: { id: -10, type: "group" }, text: "private task" } });
    const unauthorized = await telegramWebhook(new Request("https://example.com/api/integrations/telegram/webhook", { method: "POST", body }));
    expect(unauthorized.status).toBe(401);
    const ignored = await telegramWebhook(
      new Request("https://example.com/api/integrations/telegram/webhook", {
        method: "POST",
        headers: { "x-telegram-bot-api-secret-token": SECRET },
        body,
      }),
    );
    expect(ignored.status).toBe(200);
    expect(mocks.db.telegramConnection.findUnique).not.toHaveBeenCalled();
  });

  it("answers unknown commands with help instead of saving them", async () => {
    for (const text of ["/start", "/help", "/settings@BoardCueTestBot"]) expect((await deliver({ text })).status).toBe(200);
    expect(mocks.db.externalCapture.create).not.toHaveBeenCalled();
    expect(sent.map(item => item.text)).toEqual(Array(3).fill(telegramReply("en", "help")));
  });

  it("prompts unlinked chats to connect in their Telegram language", async () => {
    mocks.db.telegramConnection.findUnique.mockResolvedValue(null);
    await deliver({ text: "buy milk", from: { language_code: "it" } });
    expect(mocks.db.externalCapture.create).not.toHaveBeenCalled();
    expect(sent[0].text).toBe(telegramReply("it", "notLinked"));
  });

  it("saves text and points to the home inbox, not to a proposal", async () => {
    await deliver({ text: "buy milk" });
    expect(mocks.db.externalCapture.create).toHaveBeenCalledWith({ data: expect.objectContaining({ text: "buy milk", status: "READY", telegramFileId: null }) });
    expect(sent[0].text).toBe(telegramReply("en", "saved"));
    expect(sent[0].text).not.toMatch(/proposal/i);
  });

  it("accepts audio documents such as forwarded WhatsApp voice notes and keeps the caption", async () => {
    await deliver({ document: { file_id: "doc", file_size: 1000, mime_type: "audio/ogg", file_name: "PTT-20261002-WA0001.opus" }, caption: "Client call" });
    expect(mocks.db.externalCapture.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ text: "Client call", status: "PENDING", telegramFileId: "doc" }),
    });
    expect(mocks.after).toHaveBeenCalledOnce();
    expect(sent[0].text).toBe(telegramReply("en", "audioReceived"));
  });

  it("ignores non-audio documents, rejects video notes and FLAC", async () => {
    await deliver({ document: { file_id: "pdf", mime_type: "application/pdf", file_name: "invoice.pdf" } });
    await deliver({ video_note: { file_id: "round", file_size: 1000 } });
    await deliver({ document: { file_id: "flac", file_size: 1000, mime_type: "audio/flac", file_name: "memo.flac" } });
    expect(mocks.db.externalCapture.create).not.toHaveBeenCalled();
    expect(sent.map(item => item.text)).toEqual([
      telegramReply("en", "help"),
      telegramReply("en", "videoNote"),
      telegramReply("en", "unsupportedFormat"),
    ]);
  });

  it("rate limits each chat and does not save over the limit", async () => {
    mocks.db.$queryRaw.mockResolvedValue([{ count: 61, resetAt: new Date(Date.now() + 3600_000) }]);
    await deliver({ text: "one more" });
    expect(mocks.db.externalCapture.create).not.toHaveBeenCalled();
    expect(sent[0].text).toBe(telegramReply("en", "rateLimited"));
    mocks.db.$queryRaw.mockResolvedValue([{ count: 21, resetAt: new Date(Date.now() + 3600_000) }]);
    await deliver({ voice: { file_id: "voice", file_size: 1000 } });
    expect(mocks.db.externalCapture.create).not.toHaveBeenCalled();
    expect(String(mocks.db.$queryRaw.mock.calls.at(-1)?.slice(1))).toContain("telegram-audio:7");
  });
});

describe("Telegram audio processing", () => {
  const setup = (failedCount: number) => {
    mocks.db.externalCapture.updateMany = vi.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: failedCount });
    mocks.db.externalCapture.findUnique.mockResolvedValue({ id: "capture", userId: "user", text: "", telegramFileId: "file", attempts: 1 });
    mocks.db.workspaceMember = { findMany: vi.fn().mockResolvedValue([]) };
    mocks.db.telegramConnection.findUnique.mockResolvedValue({
      userId: "user",
      chatId: "7",
      user: { lifecycleStatus: "ACTIVE", locale: "it", defaultOrganizationId: null },
    });
  };

  it("counts each attempt in the claim and warns once that it will retry", async () => {
    setup(1);
    await processTelegramAudio("capture");
    expect(mocks.db.externalCapture.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: "capture", attempts: { lt: MAX_CAPTURE_ATTEMPTS } },
      data: { status: "PROCESSING", attempts: { increment: 1 } },
    });
    expect(mocks.db.externalCapture.updateMany.mock.calls[1][0]).toEqual({ where: { id: "capture" }, data: { status: "FAILED" } });
    expect(sent.map(item => item.text)).toEqual([telegramReply("it", "retrying")]);
  });

  it("does not throw or reply when the capture was deleted during processing", async () => {
    setup(0);
    await expect(processTelegramAudio("capture")).resolves.toBeUndefined();
    expect(sent).toEqual([]);
  });
});

describe("Telegram audio helpers", () => {
  it("maps file names and mime types to accepted transcription formats", () => {
    expect(audioFormatFor("voice/file_1.oga")).toBe("ogg");
    expect(audioFormatFor("documents/file_2.OPUS")).toBe("ogg");
    expect(audioFormatFor("music/file_3.mp3")).toBe("mp3");
    expect(audioFormatFor("a.m4a")).toBe("m4a");
    expect(audioFormatFor("a.mp4")).toBe("m4a");
    expect(audioFormatFor("a.aac")).toBe("m4a");
    expect(audioFormatFor("a.wav")).toBe("wav");
    expect(audioFormatFor("a.webm")).toBe("webm");
    expect(audioFormatFor("a.flac")).toBe("unsupported");
    expect(audioFormatFor(undefined, "audio/x-flac")).toBe("unsupported");
    expect(audioFormatFor(undefined, "audio/mpeg")).toBe("mp3");
    expect(audioFormatFor("noextension")).toBeNull();
    expect(isAudioDocument({ mime_type: "audio/x-unknown" })).toBe(true);
    expect(isAudioDocument({ mime_type: "application/octet-stream", file_name: "memo.m4a" })).toBe(true);
    expect(isAudioDocument({ mime_type: "application/pdf", file_name: "memo.pdf" })).toBe(false);
  });

  it("bills the default organization first, then managed ones, oldest board first", () => {
    const board = (id: string, organizationId: string, created: string, orgRole = "MEMBER", extra: object = {}) => ({
      role: "MEMBER",
      workspace: {
        id,
        slug: id,
        openrouterKeyEnv: "",
        organizationId,
        createdAt: new Date(created),
        dictationEnabled: true,
        lifecycleStatus: "ACTIVE",
        organization: { readOnlyAt: null, plan: "TEAM", trialEndsAt: null, accessExpiresAt: null, lifecycleStatus: "ACTIVE", members: [{ role: orgRole }] },
        ...extra,
      },
    });
    const other = board("other", "o1", "2025-01-01");
    const managedNew = board("managed-new", "o2", "2025-03-01", "ADMIN");
    const managedOld = board("managed-old", "o3", "2025-02-01", "OWNER");
    const personal = board("personal", "home", "2026-01-01");
    const disabled = board("disabled", "home", "2024-01-01", "OWNER", { dictationEnabled: false });
    expect(chooseTranscriptionWorkspace([other, managedNew, managedOld, personal, disabled], "home")?.workspace.id).toBe("personal");
    expect(chooseTranscriptionWorkspace([other, managedNew, managedOld], "home")?.workspace.id).toBe("managed-old");
    expect(chooseTranscriptionWorkspace([managedNew, other], null)?.workspace.id).toBe("managed-new");
    expect(chooseTranscriptionWorkspace([{ ...other, role: "GUEST" }], null)).toBeNull();
    vi.stubEnv("OPENROUTER_API_KEY", "");
    expect(chooseTranscriptionWorkspace([other], null)).toBeNull();
  });
});
