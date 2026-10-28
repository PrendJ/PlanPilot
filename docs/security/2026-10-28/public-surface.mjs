// Low-volume, read-only public checks. Does not log in, send email or modify application records.
import { writeFile } from 'node:fs/promises';
import tls from 'node:tls';

const base = 'https://boardcue.draftapps.it';
const evidence = { date: '2026-10-28', base, mode: 'unauthenticated GET/OPTIONS only', requests: [] };
const paths = ['/', '/login', '/register', '/demo', '/app', '/account', '/admin',
  '/api/health', '/api/workspaces', '/api/search?q=audit', '/api/home/today?date=2026-10-28',
  '/api/account/tokens', '/api/admin/users', '/api/admin/billing', '/api/admin/ai-models',
  '/api/v1/boards', '/api/notifications', '/api/captures', '/.env', '/.git/config', '/package.json',
  '/sw.js', '/robots.txt', '/sitemap.xml'];
for (const pathname of paths) {
  try {
    const r = await fetch(base + pathname, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
    const body = await r.text();
    evidence.requests.push({ path: pathname, status: r.status, headers: Object.fromEntries(r.headers),
      bytes: Buffer.byteLength(body), ...(pathname === '/api/health' ? { result: JSON.parse(body) } : {}) });
    console.log(`${r.status} ${pathname}`);
  } catch (e) { evidence.requests.push({ path: pathname, error: e.message }); }
}
for (const input of [
  { url: 'http://boardcue.draftapps.it/', options: { redirect: 'manual' } },
  { url: base + '/api/account/tokens', options: { method: 'OPTIONS', headers: { origin: 'https://attacker.example', 'access-control-request-method': 'POST' } } },
]) {
  const r = await fetch(input.url, { ...input.options, signal: AbortSignal.timeout(15000) });
  evidence.requests.push({ url: input.url, method: input.options.method || 'GET', status: r.status, headers: Object.fromEntries(r.headers) });
  await r.body?.cancel();
}
evidence.tls = await new Promise(resolve => {
  const socket = tls.connect({ host: 'boardcue.draftapps.it', port: 443, servername: 'boardcue.draftapps.it', rejectUnauthorized: true }, () => {
    const certificate = socket.getPeerCertificate();
    resolve({ authorized: socket.authorized, protocol: socket.getProtocol(), cipher: socket.getCipher(),
      subject: certificate.subject, issuer: certificate.issuer, validFrom: certificate.valid_from, validTo: certificate.valid_to }); socket.end();
  });
  socket.setTimeout(15000, () => { socket.destroy(); resolve({ error: 'timeout' }); });
  socket.on('error', e => resolve({ error: e.message }));
});
await writeFile(new URL('./public-evidence.json', import.meta.url), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({ tls: evidence.tls, requests: evidence.requests.length }));
