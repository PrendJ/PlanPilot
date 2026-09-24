// Builds the PWA/app icons from the BoardCue mark (docs/brand/boardcue-app-icon.svg).
// Maskable variant keeps the mark inside the 80% safe zone on a full-bleed tile.
import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
await mkdir("public/icons", { recursive: true });
const tile = await readFile("docs/brand/boardcue-app-icon.svg");
const mark = (columns, dot) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="8" y="10" width="12" height="30" fill="${columns}"/><rect x="26" y="10" width="12" height="44" fill="${columns}"/><rect x="44" y="10" width="12" height="18" fill="${columns}"/><circle cx="50" cy="41" r="6" fill="${dot}"/></svg>`,
  );
for (const [name, size] of [
  ["icon-192", 192],
  ["icon-512", 512],
  ["apple-touch-icon", 180],
]) {
  await sharp(tile).resize(size, size).flatten({ background: "#0D0F14" }).removeAlpha().png().toFile(`public/icons/${name}.png`);
}
const inner = await sharp(mark("#F6F7F9", "#FF7A4D")).resize(300, 300).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 3, background: "#12151C" } })
  .composite([{ input: inner, gravity: "centre" }])
  .flatten({ background: "#12151C" })
  .removeAlpha()
  .png()
  .toFile("public/icons/maskable-512.png");
// Monochrome notification badge (Android uses only the alpha channel).
await sharp(
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="96" height="96"><rect x="8" y="10" width="12" height="30" fill="white"/><rect x="26" y="10" width="12" height="44" fill="white"/><rect x="44" y="10" width="12" height="18" fill="white"/><circle cx="50" cy="41" r="6" fill="white"/></svg>',
  ),
)
  .png()
  .toFile("public/icons/badge.png");
// Browser tab: PNG fallback for browsers without SVG favicons, plus a classic /favicon.ico
// (16/32/48 px PNG images wrapped in an ICO container) for crawlers and old clients.
await sharp(tile).resize(32, 32).png().toFile("public/icons/favicon-32.png");
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map(size => sharp(tile).resize(size, size).png().toBuffer()));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((size, index) => {
  const entry = 6 + 16 * index;
  header.writeUInt8(size, entry);
  header.writeUInt8(size, entry + 1);
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(images[index].length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += images[index].length;
});
await writeFile("public/favicon.ico", Buffer.concat([header, ...images]));
console.log("icons built");
