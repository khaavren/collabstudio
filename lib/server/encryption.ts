import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ENCRYPTION_VERSION = "v1";

function getEncryptionKey() {
  const raw = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("Missing SETTINGS_ENCRYPTION_KEY.");
  }

  return createHash("sha256").update(raw).digest();
}

export function encryptSecret(plainText: string) {
  const iv = randomBytes(12);
  const key = getEncryptionKey();

  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    ENCRYPTION_VERSION,
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64")
  ].join(":");
}

export function decryptSecret(payload: string) {
  const [version, iv64, tag64, encrypted64] = payload.split(":");

  if (!version || !iv64 || !tag64 || !encrypted64 || version !== ENCRYPTION_VERSION) {
    throw new Error("Unsupported encrypted payload format.");
  }

  const key = getEncryptionKey();
  const iv = Buffer.from(iv64, "base64");
  const authTag = Buffer.from(tag64, "base64");
  const encrypted = Buffer.from(encrypted64, "base64");

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}
