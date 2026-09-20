import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(path.join(directory, entry.name)) : path.join(directory, entry.name)))).flat();
}
const template = await readFile('scripts/service-worker.js', 'utf8');
const build = await readFile('.next/BUILD_ID', 'utf8');
const version = createHash('sha256').update(build).update(template).digest('hex').slice(0, 20);
const assets = (await files('.next/static')).map(file => '/' + file.replaceAll('\\', '/').replace(/^\.next\//, '_next/'));
assets.push('/offline.html', '/icons/icon-192.png', '/icons/badge.png');
const worker = template.replace('__VERSION__', JSON.stringify(version)).replace('__ASSETS__', JSON.stringify(assets));
await writeFile('public/sw.js', worker);
console.log('PWA service worker generated for build ' + version);
