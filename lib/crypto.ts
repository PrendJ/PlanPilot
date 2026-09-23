import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * AES-256-GCM for secrets stored at rest (TOTP seeds). The key comes from APP_ENCRYPTION_KEY;
 * outside production a fixed development key is used so local setups work without configuration.
 */
function key() {
  const configured = process.env.APP_ENCRYPTION_KEY;
  if (!configured) {
    if (process.env.NODE_ENV === "production") throw new Error("APP_ENCRYPTION_KEY is not configured");
    return createHash("sha256").update("boardcue-development-only-key").digest();
  }
  return createHash("sha256").update(configured).digest();
}

export function encryptionConfigured() {
  return Boolean(process.env.APP_ENCRYPTION_KEY) || process.env.NODE_ENV !== "production";
}

export function encryptSecret(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptSecret(sealed: string) {
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Unsupported secret format");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
