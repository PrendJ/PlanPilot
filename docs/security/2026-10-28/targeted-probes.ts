// Diagnostic evidence, not regression tests: expected outputs describe current vulnerabilities.
// Requires connection.json from isolated-audit.mjs. Refuses non-local or non-test databases.
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

async function main() {
  const connection = JSON.parse(await readFile(process.argv[2], 'utf8')) as { base: string; databaseUrl: string };
  const database = new URL(connection.databaseUrl);
  if (database.hostname !== '127.0.0.1' || database.pathname !== '/boardcue_test_cyber' || new URL(connection.base).hostname !== '127.0.0.1') throw new Error('Only isolated local audit database is allowed');
  process.env.DATABASE_URL = connection.databaseUrl;
  process.env.APP_ENCRYPTION_KEY = 'synthetic-probe-only';
  const db = new PrismaClient({ datasourceUrl: connection.databaseUrl });
  const hash = (value: string) => createHash('sha256').update(value).digest('hex');
  const checks: object[] = [];
  const record = (name: string, data: object) => { const item = { name, ...data }; checks.push(item); console.log(JSON.stringify(item)); };
  const marker = randomBytes(5).toString('hex');
  async function account(role: 'SUPPORT' | 'BILLING' | 'USER') {
    const user = await db.user.create({ data: { name: `Synthetic ${role}`, email: `audit-${role}-${marker}-${randomBytes(3).toString('hex')}@example.invalid`, passwordHash: 'TEST_ONLY', platformRole: role, emailVerifiedAt: new Date() } });
    const token = randomBytes(32).toString('base64url');
    await db.session.create({ data: { userId: user.id, tokenHash: hash(token), expiresAt: new Date(Date.now() + 3600000) } });
    return { user, cookie: `boardcue_session=${token}` };
  }
  async function call(url: string, method: string, cookie: string, payload?: unknown, extra: Record<string, string> = {}) {
    const response = await fetch(connection.base + url, { method, headers: { cookie, 'content-type': 'application/json', ...extra }, ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}), redirect: 'manual' });
    return { status: response.status, body: await response.text() };
  }
  try {
    for (const role of ['SUPPORT', 'BILLING'] as const) {
      const actor = await account(role);
      const result = await call('/api/admin/users', 'PATCH', actor.cookie, { id: actor.user.id, isAdmin: true });
      const user = await db.user.findUniqueOrThrow({ where: { id: actor.user.id } });
      record('platform-role-escalation', { initialRole: role, status: result.status, finalRole: user.platformRole, isAdmin: user.isAdmin });
      if (role === 'SUPPORT') {
        const csrf = await call('/api/admin/users', 'POST', actor.cookie, { name: 'Synthetic Cross-Origin User', email: `csrf-${marker}@example.invalid`, password: 'synthetic-only-password' }, { 'content-type': 'text/plain', origin: 'https://attacker.example' });
        record('admin-cross-origin-plain-text-post', { status: csrf.status, createdUser: Boolean(await db.user.findUnique({ where: { email: `csrf-${marker}@example.invalid` } })) });
      }
    }
    const { assertSafeWebhookUrl } = await import('../../../lib/webhooks');
    for (const url of ['https://127.0.0.1', 'https://[::1]', 'https://[::ffff:127.0.0.1]', 'https://[::ffff:169.254.169.254]', 'https://[::ffff:192.168.1.1]']) {
      try { const result = await assertSafeWebhookUrl(url); record('ssrf-ipv6-mapped-validation', { url, accepted: true, normalized: result.href }); }
      catch { record('ssrf-ipv6-mapped-validation', { url, accepted: false }); }
    }
    const { toCsv } = await import('../../../lib/import-export');
    record('csv-formula-injection', { output: toCsv([{ titolo: '=1+1', descrizione: '@SUM(1+1)' }], ['titolo', 'descrizione']) });
    const { encryptSecret } = await import('../../../lib/crypto');
    const { checkUserCode } = await import('../../../lib/two-factor');
    const { hashRecoveryCode } = await import('../../../lib/totp');
    const recovery = await account('USER');
    const recoveryUser = await db.user.update({ where: { id: recovery.user.id }, data: { totpSecretEnc: encryptSecret('JBSWY3DPEHPK3PXP'), totpRecoveryCodes: [hashRecoveryCode('ABCDE-FGHIJ')], totpEnabledAt: new Date() } });
    const claims = await Promise.all([checkUserCode(recoveryUser, 'ABCDE-FGHIJ'), checkUserCode(recoveryUser, 'ABCDE-FGHIJ')]);
    record('recovery-code-concurrent-reuse', { successfulClaims: claims.filter(Boolean).length, results: claims });
    const ownerA = await account('USER');
    const ownerB = await db.user.create({ data: { name: 'Synthetic Second Owner', email: `owner-b-${marker}@example.invalid`, passwordHash: 'TEST_ONLY' } });
    const tokenB = randomBytes(32).toString('base64url');
    await db.session.create({ data: { userId: ownerB.id, tokenHash: hash(tokenB), expiresAt: new Date(Date.now() + 3600000) } });
    const org = await db.organization.create({ data: { name: 'Synthetic Owner Race', slug: `owner-race-${marker}`, plan: 'BUSINESS', seats: 5, createdById: ownerA.user.id, members: { create: [{ userId: ownerA.user.id, role: 'OWNER' }, { userId: ownerB.id, role: 'OWNER' }] } } });
    const board = await db.workspace.create({ data: { name: 'Synthetic Owner Race', slug: `owner-race-${marker}`, organizationId: org.id, createdById: ownerA.user.id, members: { create: [{ userId: ownerA.user.id, role: 'OWNER' }, { userId: ownerB.id, role: 'OWNER' }] } } });
    let releaseLock!: () => void;
    const locked = new Promise<void>(resolve => { releaseLock = resolve; });
    const blocker = db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "WorkspaceMember" WHERE "workspaceId" = ${board.id} FOR UPDATE`;
      releaseLock();
      await new Promise(resolve => setTimeout(resolve, 1000));
    });
    await locked;
    const demotions = await Promise.all([call(`/api/workspaces/${board.slug}/members/${ownerA.user.id}`, 'PATCH', ownerA.cookie, { role: 'MEMBER' }), call(`/api/workspaces/${board.slug}/members/${ownerB.id}`, 'PATCH', `boardcue_session=${tokenB}`, { role: 'MEMBER' })]);
    await blocker;
    record('last-owner-concurrent-demotion', { statuses: demotions.map(r => r.status), remainingOwners: await db.workspaceMember.count({ where: { workspaceId: board.id, role: 'OWNER' } }) });
    const browserUser = await db.user.findFirstOrThrow({ where: { email: { startsWith: 'pre-hijack-' } } });
    const browserBoard = await db.workspace.findFirstOrThrow({ where: { createdById: browserUser.id } });
    await db.organization.update({ where: { id: browserBoard.organizationId }, data: { require2fa: true } });
    record('browser-fixture', { email: browserUser.email, boardPath: `/app/${browserBoard.slug}`, printPath: `/app/${browserBoard.slug}/print`, password: 'synthetic-attacker-password' });
    await writeFile(new URL('./targeted-evidence.json', import.meta.url), JSON.stringify({ date: '2026-10-28', checks }, null, 2));
  } finally { await db.$disconnect(); const { prisma } = await import('../../../lib/prisma'); await prisma.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
