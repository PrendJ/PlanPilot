import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** RFC 6238 TOTP (SHA-1, 6 digits, 30 s), compatible with Google Authenticator, Microsoft Authenticator, 1Password, Aegis… */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_PERIOD = 30;
export const TOTP_DIGITS = 6;

export function base32Encode(buffer: Buffer) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string) {
  const clean = input.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error("Invalid base32");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret() {
  return base32Encode(randomBytes(20));
}

export function currentStep(now = Date.now()) {
  return Math.floor(now / 1000 / TOTP_PERIOD);
}

export function totpAt(secret: string, step: number) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  const code = ((digest[offset] & 127) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(code % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Accepts ±1 step for clock drift. Returns the matched step so the caller can store it and reject
 * replays (a code is valid once), or null.
 */
export function verifyTotp(secret: string, code: string, options: { now?: number; lastStep?: number | null; window?: number } = {}) {
  const normalized = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalized)) return null;
  const step = currentStep(options.now);
  const window = options.window ?? 1;
  for (let delta = -window; delta <= window; delta += 1) {
    const candidate = step + delta;
    if (options.lastStep != null && candidate <= options.lastStep) continue;
    if (safeEqual(totpAt(secret, candidate), normalized)) return candidate;
  }
  return null;
}

export function otpauthUri(input: { secret: string; account: string; issuer?: string }) {
  const issuer = input.issuer || "BoardCue";
  const label = encodeURIComponent(`${issuer}:${input.account}`);
  const params = new URLSearchParams({
    secret: input.secret,
    issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

export function hashRecoveryCode(code: string) {
  return createHash("sha256").update(code.replace(/[\s-]/g, "").toUpperCase()).digest("hex");
}

/** Ten single-use recovery codes, shown once. Only hashes are stored. */
export function generateRecoveryCodes(count = 10) {
  const codes = Array.from({ length: count }, () => {
    const raw = base32Encode(randomBytes(6)).slice(0, 10);
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
  return { codes, hashes: codes.map(hashRecoveryCode) };
}

export function consumeRecoveryCode(hashes: unknown, code: string) {
  const list = Array.isArray(hashes) ? hashes.map(String) : [];
  const hashed = hashRecoveryCode(code);
  const index = list.findIndex(item => safeEqual(item, hashed));
  if (index < 0) return null;
  return list.filter((_, position) => position !== index);
}
