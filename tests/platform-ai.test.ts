import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ db: {} as any }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.db }));
import { audioFormatFor, DEFAULT_PLANNING_MODEL, DEFAULT_TRANSCRIPTION_MODEL, PLANNING_MODELS } from "@/lib/ai-config";
import { invalidatePlatformModels, platformModelOptions, platformModels, setPlatformModels } from "@/lib/platform-ai";

const alternative = PLANNING_MODELS[1].id;

beforeEach(() => {
  vi.resetAllMocks();
  invalidatePlatformModels();
  mocks.db.platformAiSetting = { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn() };
  mocks.db.adminAuditEvent = { create: vi.fn().mockResolvedValue({}) };
  mocks.db.$transaction = vi.fn(async (run: (tx: any) => unknown) => run(mocks.db));
});

describe("platform AI models", () => {
  it("falls back to the defaults when no row exists", async () => {
    await expect(platformModels()).resolves.toEqual({ planModel: DEFAULT_PLANNING_MODEL, transcriptionModel: DEFAULT_TRANSCRIPTION_MODEL });
  });

  it("falls back to the defaults when the stored ids are no longer allowed", async () => {
    mocks.db.platformAiSetting.findUnique.mockResolvedValue({ id: "default", planModel: "retired/model", transcriptionModel: "retired/voice" });
    await expect(platformModels()).resolves.toEqual({ planModel: DEFAULT_PLANNING_MODEL, transcriptionModel: DEFAULT_TRANSCRIPTION_MODEL });
  });

  it("falls back to the defaults without caching when the table is unreadable", async () => {
    mocks.db.platformAiSetting.findUnique.mockRejectedValueOnce(new Error("relation does not exist"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(platformModels()).resolves.toEqual({ planModel: DEFAULT_PLANNING_MODEL, transcriptionModel: DEFAULT_TRANSCRIPTION_MODEL });
    mocks.db.platformAiSetting.findUnique.mockResolvedValue({ id: "default", planModel: alternative, transcriptionModel: DEFAULT_TRANSCRIPTION_MODEL });
    await expect(platformModels()).resolves.toMatchObject({ planModel: alternative });
  });

  it("returns the stored models and caches them in process", async () => {
    mocks.db.platformAiSetting.findUnique.mockResolvedValue({ id: "default", planModel: alternative, transcriptionModel: DEFAULT_TRANSCRIPTION_MODEL });
    await expect(platformModels()).resolves.toEqual({ planModel: alternative, transcriptionModel: DEFAULT_TRANSCRIPTION_MODEL });
    await platformModels();
    expect(mocks.db.platformAiSetting.findUnique).toHaveBeenCalledTimes(1);
  });

  it("stores allowed models, writes the audit event and invalidates the cache", async () => {
    await platformModels();
    mocks.db.platformAiSetting.upsert.mockResolvedValue({ id: "default", planModel: alternative, transcriptionModel: DEFAULT_TRANSCRIPTION_MODEL });
    await expect(setPlatformModels({ planModel: alternative, transcriptionModel: DEFAULT_TRANSCRIPTION_MODEL }, "admin_1")).resolves.toEqual({ planModel: alternative, transcriptionModel: DEFAULT_TRANSCRIPTION_MODEL });
    expect(mocks.db.platformAiSetting.upsert.mock.calls[0][0].update).toMatchObject({ planModel: alternative, updatedById: "admin_1" });
    const audit = mocks.db.adminAuditEvent.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({ actorId: "admin_1", action: "PLATFORM_AI_MODELS_UPDATED", targetType: "PLATFORM", targetId: "ai-models" });
    expect(audit.metadata.before.planModel).toBe(DEFAULT_PLANNING_MODEL);
    mocks.db.platformAiSetting.findUnique.mockResolvedValue({ id: "default", planModel: alternative, transcriptionModel: DEFAULT_TRANSCRIPTION_MODEL });
    await expect(platformModels()).resolves.toMatchObject({ planModel: alternative });
  });

  it("rejects models outside the allowlist without writing", async () => {
    await expect(setPlatformModels({ planModel: "evil/model", transcriptionModel: DEFAULT_TRANSCRIPTION_MODEL }, "admin_1")).rejects.toThrow();
    await expect(setPlatformModels({ planModel: DEFAULT_PLANNING_MODEL, transcriptionModel: "evil/voice" }, "admin_1")).rejects.toThrow();
    expect(mocks.db.platformAiSetting.upsert).not.toHaveBeenCalled();
    expect(mocks.db.adminAuditEvent.create).not.toHaveBeenCalled();
  });

  it("exposes the allowed options with labels and notes", () => {
    const options = platformModelOptions();
    expect(options.planning.map(item => item.id)).toEqual(PLANNING_MODELS.map(item => item.id));
    expect(options.planning[0]).toMatchObject({ label: expect.any(String), note: expect.any(String), recommended: true });
    expect(options.transcription.length).toBeGreaterThan(0);
  });
});

describe("audio format detection", () => {
  it("prefers the MIME type", () => {
    expect(audioFormatFor("audio/webm;codecs=opus", "voice.m4a")).toBe("webm");
    expect(audioFormatFor("audio/ogg; codecs=opus", "")).toBe("ogg");
    expect(audioFormatFor("audio/opus", null)).toBe("ogg");
    expect(audioFormatFor("audio/mp4", undefined)).toBe("m4a");
    expect(audioFormatFor("audio/aac", "x")).toBe("m4a");
    expect(audioFormatFor("audio/mpeg", "x")).toBe("mp3");
    expect(audioFormatFor("audio/wav", "x")).toBe("wav");
  });

  it("falls back to the file extension when the MIME type is empty or generic", () => {
    expect(audioFormatFor("", "PTT-20261002-WA0001.opus")).toBe("ogg");
    expect(audioFormatFor("application/octet-stream", "note.OGG")).toBe("ogg");
    expect(audioFormatFor("", "memo.oga")).toBe("ogg");
    expect(audioFormatFor("", "memo.m4a")).toBe("m4a");
    expect(audioFormatFor("", "memo.mp4")).toBe("m4a");
    expect(audioFormatFor("", "memo.aac")).toBe("m4a");
    expect(audioFormatFor("", "memo.mp3")).toBe("mp3");
    expect(audioFormatFor("", "memo.wav")).toBe("wav");
    expect(audioFormatFor("", "memo.webm")).toBe("webm");
  });

  it("defaults to webm when nothing is known", () => {
    expect(audioFormatFor("", "")).toBe("webm");
    expect(audioFormatFor(undefined, "blob")).toBe("webm");
    expect(audioFormatFor("", "archive.zip")).toBe("webm");
  });
});
