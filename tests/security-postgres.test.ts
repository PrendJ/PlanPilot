import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { claimEmailIdentity, identitySessionIsCurrent, lockIdentity } from "@/lib/identity";
import { checkUserCode } from "@/lib/two-factor";
import { generateRecoveryCodes } from "@/lib/totp";
import { encryptSecret } from "@/lib/crypto";
import { createSession, CredentialsChangedError, hashToken } from "@/lib/auth";
import bcrypt from "bcryptjs";

const testUrl = process.env.BOARDCUE_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || !/^\/boardcue_test_[a-zA-Z0-9_]+$/.test(url.pathname) || url.searchParams.has("host")) throw new Error("Disposable loopback database required");
}
describe.skipIf(!testUrl)("atomic identity and recovery on PostgreSQL", () => {
  let db: PrismaClient;
  const ids: string[] = [];
  beforeAll(() => { db = new PrismaClient({ datasourceUrl: testUrl }); });
  afterAll(async () => { if (db) { await db.user.deleteMany({ where: { id: { in: ids } } }); await db.$disconnect(); } });
  it("consumes a recovery code only once even from concurrent stale snapshots", async () => {
    const { codes, hashes } = generateRecoveryCodes();
    const user = await db.user.create({ data: { name: "Synthetic recovery fixture", email: `${crypto.randomUUID()}@example.invalid`, passwordHash: "TEST_ONLY", totpEnabledAt: new Date(), totpSecretEnc: encryptSecret("JBSWY3DPEHPK3PXP"), totpRecoveryCodes: hashes } });
    ids.push(user.id);
    const results = await Promise.all([checkUserCode(user, codes[0]), checkUserCode(user, codes[0])]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).totpRecoveryCodes).toHaveLength(9);
  });
  it("first email proof invalidates pre-claim passwords, sessions, factors and integrations", async () => {
    const user = await db.user.create({ data: { name: "Synthetic unverified fixture", email: `${crypto.randomUUID()}@example.invalid`, passwordHash: await bcrypt.hash("synthetic-pre-claim-password", 12), totpEnabledAt: new Date(), totpSecretEnc: encryptSecret("JBSWY3DPEHPK3PXP") } });
    ids.push(user.id);
    const session = await db.session.create({ data: { userId: user.id, tokenHash: hashToken(crypto.randomUUID()), expiresAt: new Date(Date.now() + 3600_000) } });
    const snapshot = { ...session, user };
    expect(await db.$transaction(tx => identitySessionIsCurrent(tx, snapshot))).toBe(true);
    await db.apiToken.create({ data: { userId: user.id, tokenHash: hashToken(crypto.randomUUID()), prefix: "bc_test", name: "Synthetic" } });
    const setup = await db.$transaction(async tx => { await lockIdentity(tx, user.id); return claimEmailIdentity(tx, user.id); });
    expect(setup).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const claimed = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(claimed.emailVerifiedAt).not.toBeNull(); expect(claimed.totpEnabledAt).toBeNull();
    expect(await bcrypt.compare("synthetic-pre-claim-password", claimed.passwordHash)).toBe(false);
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
    expect(await db.$transaction(tx => identitySessionIsCurrent(tx, snapshot))).toBe(false);
    expect(await db.apiToken.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
    expect(await db.passwordResetToken.count({ where: { userId: user.id, tokenHash: hashToken(setup!) } })).toBe(1);
    // A login that read the old password before verification cannot issue a session afterwards.
    await expect(createSession(user.id, user)).rejects.toBeInstanceOf(CredentialsChangedError);
  });
});
