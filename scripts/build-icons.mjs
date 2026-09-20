// Reuse BoardCue's existing vector mark; keep all maskable content in the safe area.
import sharp from 'sharp';
import { mkdir, readFile } from 'node:fs/promises';
await mkdir('public/icons', { recursive: true });
const svg = await readFile('app/icon.svg');
for (const [name, size, scale] of [['icon-192', 192, .76], ['icon-512', 512, .76], ['maskable-512', 512, .65], ['apple-touch-icon', 180, .76]]) {
  const n = Math.round(size * scale);
  const logo = await sharp(svg).resize(n, n).png().toBuffer();
  const composed = await sharp({ create: { width: size, height: size, channels: 4, background: '#101827' } }).composite([{ input: logo, gravity: 'centre' }]).png().toBuffer();
  await sharp(composed).flatten({ background: '#101827' }).removeAlpha().png().toFile(`public/icons/${name}.png`);
}
await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><path fill="white" d="M12 12h18v72H12zM39 12h18v48H39zM66 12h18v60H66z"/></svg>')).png().toFile('public/icons/badge.png');
