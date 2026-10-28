import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, rename, unlink } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
const [mode, input, output] = process.argv.slice(2);
const passphrase = process.env.BACKUP_PASSPHRASE;
if (!['encrypt', 'decrypt'].includes(mode) || !input || !output || !passphrase) throw new Error('Usage: backup-crypto.mjs encrypt|decrypt INPUT OUTPUT; set BACKUP_PASSPHRASE');
const magic = Buffer.from('BOARDCUE-BACKUP2\n');
const temporary = `${output}.${randomBytes(8).toString('hex')}.partial`;
const derive = salt => scryptSync(passphrase, salt, 32, { N: 32768, maxmem: 64 * 1024 * 1024 });
try {
  if (mode === 'encrypt') {
    const salt = randomBytes(32), iv = randomBytes(12);
    const header = Buffer.concat([magic, salt, iv]);
    const cipher = createCipheriv('aes-256-gcm', derive(salt), iv);
    cipher.setAAD(header);
    const destination = await open(temporary, 'wx', 0o600);
    await destination.write(header); await destination.close();
    await pipeline(createReadStream(input), cipher, createWriteStream(temporary, { flags: 'a' }));
    const final = await open(temporary, 'a'); await final.write(cipher.getAuthTag()); await final.sync(); await final.close();
  } else {
    const source = await open(input, 'r');
    const size = (await source.stat()).size, header = Buffer.alloc(magic.length + 44), tag = Buffer.alloc(16);
    await source.read(header, 0, header.length, 0); await source.read(tag, 0, 16, size - 16); await source.close();
    if (size < header.length + 16 || !header.subarray(0, magic.length).equals(magic)) throw new Error('Invalid backup format');
    const decipher = createDecipheriv('aes-256-gcm', derive(header.subarray(magic.length, magic.length + 32)), header.subarray(-12));
    decipher.setAAD(header); decipher.setAuthTag(tag);
    await pipeline(createReadStream(input, { start: header.length, end: size - 17 }), decipher, createWriteStream(temporary, { flags: 'wx', mode: 0o600 }));
  }
  await rename(temporary, output);
} catch (error) { await unlink(temporary).catch(() => {}); throw error; }
