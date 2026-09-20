// Optional integration harness. The embedded binary package lives OUTSIDE app dependencies.
// Example: BOARDCUE_EMBEDDED_PG_MODULE=/absolute/.../embedded-postgres/dist/index.js
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import net from 'node:net';
const modulePath = process.env.BOARDCUE_EMBEDDED_PG_MODULE;
if (!modulePath || !path.isAbsolute(modulePath)) throw new Error('Set BOARDCUE_EMBEDDED_PG_MODULE to the installed temporary runtime module.');
const { default: EmbeddedPostgres } = await import(pathToFileURL(modulePath).href);
const directory = await mkdtemp(path.join(tmpdir(), 'boardcue-test-pg-'));
const port = await new Promise(resolve => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); }); });
const password = randomBytes(20).toString('hex');
const pg = new EmbeddedPostgres({ databaseDir: path.join(directory, 'data'), user: 'postgres', password, port, persistent: true, createPostgresUser: false, postgresFlags: ['-h', '127.0.0.1'], onLog: () => {}, onError: () => {} });
const env = { ...process.env, DATABASE_URL: `postgresql://postgres:${password}@127.0.0.1:${port}/boardcue_test_integration`, WEB_PUSH_ENABLED: 'false', OPENROUTER_API_KEY: '', SMTP_HOST: '', STRIPE_SECRET_KEY: '', NEXT_TELEMETRY_DISABLED: '1' };
env.BOARDCUE_TEST_DATABASE_URL = env.DATABASE_URL;
function run(file, args) {
  return new Promise((resolve, reject) => { const child = spawn(process.execPath, [file, ...args], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const output = data => process.stdout.write(data.toString().split(password).join('[fixture-password]'));
    child.stdout.on('data', output); child.stderr.on('data', output);
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${file} exited ${code}`)));
  });
}
try {
  await pg.initialise(); await pg.start(); await pg.createDatabase('boardcue_test_integration');
  console.log('Temporary loopback PostgreSQL started; synthetic data only.');
  await run('node_modules/prisma/build/index.js', ['migrate', 'deploy']);
  await run('node_modules/vitest/vitest.mjs', ['run']);
  if (process.argv.includes('--e2e')) {
    await run('node_modules/next/dist/bin/next', ['build']);
    await run('scripts/build-pwa.mjs', []); await run('scripts/prepare-standalone.mjs', []);
    await run('node_modules/@playwright/test/cli.js', ['test', '--project=desktop-1440', '--project=mobile-375', '--workers=2']);
  }
} finally { await pg.stop(); console.log('Temporary PostgreSQL stopped. No application or production database was used.'); }
