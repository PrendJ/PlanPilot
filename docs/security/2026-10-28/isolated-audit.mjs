// Audit harness: disposable loopback database, synthetic fixtures, no external providers.
// Run after npm run build. Install embedded-postgres OUTSIDE the repository and pass its entry path.
import { mkdtemp, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import net from 'node:net';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const modulePath = process.env.BOARDCUE_EMBEDDED_PG_MODULE;
if (!modulePath || !path.isAbsolute(modulePath)) throw new Error('Pass the absolute embedded-postgres module path');
const { default: EmbeddedPostgres } = await import(pathToFileURL(modulePath).href);
const directory = await mkdtemp(path.join(tmpdir(), 'boardcue-cyber-audit-'));
const freePort = () => new Promise(resolve => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const port = await freePort();
const serverPort = await freePort();
const password = randomBytes(20).toString('hex');
const encryptionKey = randomBytes(32).toString('hex');
const databaseUrl = `postgresql://postgres:${password}@127.0.0.1:${port}/boardcue_test_cyber`;
const base = `http://127.0.0.1:${serverPort}`;
const env = { ...process.env, DATABASE_URL: databaseUrl, BOARDCUE_TEST_DATABASE_URL: databaseUrl,
  APP_URL: base, APP_ENCRYPTION_KEY: encryptionKey, PORT: String(serverPort), HOSTNAME: '127.0.0.1',
  OPENROUTER_API_KEY: '', OPENROUTER_WORKSPACE_KEYS: '', TELEGRAM_BOT_TOKEN: '', SMTP_HOST: '',
  STRIPE_SECRET_KEY: '', CRON_SECRET: '', WEB_PUSH_ENABLED: 'false', NEXT_TELEMETRY_DISABLED: '1' };
const pg = new EmbeddedPostgres({ databaseDir: path.join(directory, 'data'), port, user: 'postgres', password,
  persistent: true, createPostgresUser: false, postgresFlags: ['-h', '127.0.0.1'], onLog: () => {}, onError: () => {} });
const redact = value => String(value).split(password).join('[fixture-password]').split(encryptionKey).join('[fixture-key]');
const run = (file, args, extra = {}) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [file, ...args], { env: { ...env, ...extra }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', d => { output += redact(d); }); child.stderr.on('data', d => { output += redact(d); });
  child.on('error', reject); child.on('exit', code => resolve({ code, output }));
});
const hash = value => createHash('sha256').update(value).digest('hex');
const evidence = { date: '2026-10-28', base, environment: 'isolated local PostgreSQL; synthetic data only', checks: [] };
const record = (name, details) => { evidence.checks.push({ name, ...details }); console.log(JSON.stringify({ name, ...details })); };
let server;
let db;
try {
  await pg.initialise(); await pg.start(); await pg.createDatabase('boardcue_test_cyber');
  console.log('Disposable PostgreSQL ready');
  const migration = await run('node_modules/prisma/build/index.js', ['migrate', 'deploy']);
  if (migration.code !== 0) throw new Error(migration.output);
  const unit = await run('node_modules/vitest/vitest.mjs', ['run']);
  await writeFile(path.join(directory, 'tests.log'), unit.output);
  record('full-test-suite-with-postgres', { exitCode: unit.code, summary: unit.output.split('\n').filter(l => /Test Files|Tests |Duration/.test(l)) });
  const prepare = await run('scripts/prepare-standalone.mjs', []);
  if (prepare.code !== 0) throw new Error(prepare.output);
  server = spawn(process.execPath, ['.next/standalone/server.js'], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; server.stdout.on('data', d => { logs += redact(d); }); server.stderr.on('data', d => { logs += redact(d); });
  for (let attempt = 0; attempt < 120; attempt++) {
    try { if ((await fetch(`${base}/api/health`)).ok) break; } catch {}
    if (attempt === 119) throw new Error('Server did not start: ' + logs.slice(-1500));
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  db = new PrismaClient({ datasourceUrl: databaseUrl });
  const marker = randomBytes(5).toString('hex');
  const fixture = await db.user.create({ data: { email: `audit-${marker}@example.invalid`, name: 'Synthetic Audit Member', passwordHash: await bcrypt.hash('synthetic-audit-password', 12), emailVerifiedAt: new Date() } });
  const outsider = await db.user.create({ data: { email: `outsider-${marker}@example.invalid`, name: 'Synthetic Outsider', passwordHash: 'TEST_ONLY', emailVerifiedAt: new Date() } });
  const org = await db.organization.create({ data: { name: 'Synthetic Security Org', slug: `audit-${marker}`, plan: 'BUSINESS', seats: 5, createdById: fixture.id, require2fa: true, members: { create: { userId: fixture.id, role: 'OWNER' } } } });
  const board = await db.workspace.create({ data: { name: 'AUDIT-CONFIDENTIAL-BOARD-TITLE', slug: `audit-${marker}`, createdById: fixture.id, organizationId: org.id, members: { create: { userId: fixture.id, role: 'OWNER' } } } });
  const column = await db.boardColumn.create({ data: { workspaceId: board.id, title: 'Inbox', position: 0 } });
  await db.boardColumn.create({ data: { workspaceId: board.id, title: 'Done', position: 1 } });
  await db.card.create({ data: { workspaceId: board.id, columnId: column.id, title: 'AUDIT-PRIVATE-CARD', description: 'synthetic confidential description' } });
  const sessionToken = randomBytes(32).toString('base64url');
  const outsiderToken = randomBytes(32).toString('base64url');
  await db.session.createMany({ data: [{ userId: fixture.id, tokenHash: hash(sessionToken), expiresAt: new Date(Date.now() + 3600000) }, { userId: outsider.id, tokenHash: hash(outsiderToken), expiresAt: new Date(Date.now() + 3600000) }] });
  const apiToken = `bc_${randomBytes(24).toString('base64url')}`;
  await db.apiToken.create({ data: { userId: fixture.id, name: 'Synthetic Audit', tokenHash: hash(apiToken), prefix: apiToken.slice(0, 7) } });
  const cookie = `boardcue_session=${sessionToken}`;
  const request = async (url, options = {}) => {
    const response = await fetch(base + url, { redirect: 'manual', ...options, signal: AbortSignal.timeout(20000) });
    return { status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() };
  };
  for (const url of ['/api/search?q=AUDIT', `/api/workspaces/${board.slug}/board`, `/app/${board.slug}/print`, `/api/organizations/${org.id}/export`, `/api/v1/boards/${board.slug}/cards`]) {
    const result = await request(url, { headers: url.startsWith('/api/v1') ? { authorization: `Bearer ${apiToken}` } : { cookie } });
    record('mandatory-2fa-endpoint', { path: url, status: result.status, exposesCard: result.body.includes('AUDIT-PRIVATE-CARD'), cacheControl: result.headers['cache-control'] ?? null });
  }
  const foreignPage = await request(`/app/${board.slug}`, { headers: { cookie: `boardcue_session=${outsiderToken}` } });
  record('foreign-board-metadata', { status: foreignPage.status, leaksTitle: foreignPage.body.includes(board.name) });
  const fakeCookie = await request(`/app/${board.slug}`, { headers: { cookie: 'boardcue_session=synthetic-invalid-cookie' } });
  record('invalid-session-board-metadata', { status: fakeCookie.status, leaksTitle: fakeCookie.body.includes(board.name) });
  const hostile = { 'content-type': 'application/json', origin: 'https://attacker.example' };
  const originReject = await request('/api/auth/login', { method: 'POST', headers: hostile, body: '{}' });
  const originBypass = await request('/api/auth/login', { method: 'POST', headers: { ...hostile, 'x-forwarded-host': 'attacker.example' }, body: '{}' });
  record('forwarded-host-origin-check', { normalHostStatus: originReject.status, spoofedHostStatus: originBypass.status });
  const rateStatuses = [];
  for (let n = 0; n < 11; n++) rateStatuses.push((await request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '192.0.2.71' }, body: '{}' })).status);
  const alternateIp = await request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '192.0.2.72' }, body: '{}' });
  record('forwarded-ip-rate-limit', { statuses: rateStatuses, afterChangingHeader: alternateIp.status });
  // Two simultaneous claims of one reset token. Bcrypt creates a deterministic overlap after both reads.
  const resetToken = randomBytes(32).toString('base64url');
  await db.passwordResetToken.create({ data: { userId: fixture.id, tokenHash: hash(resetToken), expiresAt: new Date(Date.now() + 3600000) } });
  const resetResults = await Promise.all(['synthetic-new-password-one', 'synthetic-new-password-two'].map(password => request('/api/auth/reset-password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: resetToken, password }) })));
  const oldApi = await request(`/api/v1/boards/${board.slug}/cards`, { headers: { authorization: `Bearer ${apiToken}` } });
  record('password-reset-single-use-and-revocation', { simultaneousStatuses: resetResults.map(r => r.status), oldApiTokenStatus: oldApi.status, oldApiTokenExposesCards: oldApi.body.includes('AUDIT-PRIVATE-CARD') });
  // New synthetic identity registered without any mailbox access, then confirmed by its mailbox owner.
  const preEmail = `pre-hijack-${marker}@example.invalid`;
  const signup = await request('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '192.0.2.80' }, body: JSON.stringify({ name: 'Synthetic Pre-registration', email: preEmail, password: 'synthetic-attacker-password' }) });
  const preUser = await db.user.findUnique({ where: { email: preEmail } });
  const retainedCookie = signup.headers['set-cookie']?.split(';')[0];
  const proof = randomBytes(32).toString('base64url');
  await db.verificationToken.deleteMany({ where: { userId: preUser.id } });
  await db.verificationToken.create({ data: { userId: preUser.id, tokenHash: hash(proof), expiresAt: new Date(Date.now() + 3600000) } });
  const confirmation = await request(`/api/auth/verify?token=${proof}`);
  const retained = await request('/api/account/tokens', { headers: { cookie: retainedCookie } });
  const victim = await db.user.findUnique({ where: { id: preUser.id } });
  record('pre-registration-account-retention', { registrationStatus: signup.status, confirmationStatus: confirmation.status, attackerSessionStatus: retained.status, attackerPasswordStillValid: await bcrypt.compare('synthetic-attacker-password', victim.passwordHash), verified: Boolean(victim.emailVerifiedAt) });
  await writeFile(new URL('./local-evidence.json', import.meta.url), JSON.stringify(evidence, null, 2));
  await writeFile(path.join(directory, 'server.log'), logs);
  await writeFile(path.join(directory, 'connection.json'), JSON.stringify({ base, databaseUrl, directory }));
  console.log(`Local browser audit ready: ${base}/login; connection file: ${path.join(directory, 'connection.json')}`);
  console.log('Create STOP in the temporary directory to stop. Automatic shutdown after 15 minutes.');
  if (process.env.BOARDCUE_AUDIT_HOLD === 'true') {
    for (let n = 0; n < 1800; n++) { try { await access(path.join(directory, 'STOP')); break; } catch {} await new Promise(resolve => setTimeout(resolve, 500)); }
  }
} finally {
  if (server) { server.kill(); await new Promise(resolve => server.once('exit', resolve)); }
  if (db) await db.$disconnect();
  await pg.stop();
  console.log('Isolated audit stopped; no production data used.');
}
