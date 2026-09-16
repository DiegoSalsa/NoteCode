import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const KEY_VERSION = 1;

function keyFromEnv() {
  const dedicated = process.env.SEO_TOKEN_ENCRYPTION_KEY;
  const fallback = process.env.ENCRYPTION_KEY;
  const value = dedicated || fallback;

  if (!value) {
    throw new Error("SEO_TOKEN_ENCRYPTION_KEY or ENCRYPTION_KEY is required to encrypt SEO tokens.");
  }

  const keyBuffer = Buffer.from(value, "utf8");
  if (keyBuffer.byteLength !== KEY_LENGTH) {
    throw new Error("SEO token encryption key must be exactly 32 bytes for AES-256-GCM.");
  }

  return keyBuffer;
}

export function encryptSeoToken(text: string) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, keyFromEnv(), iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `v${KEY_VERSION}:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSeoToken(encryptedText: string) {
  const parts = encryptedText.split(":");
  if (parts.length !== 4 || !/^v\d+$/i.test(parts[0])) {
    throw new Error("SEO token payload is not a versioned ciphertext.");
  }

  const decipher = createDecipheriv(ALGORITHM, keyFromEnv(), Buffer.from(parts[1], "hex"), {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(Buffer.from(parts[2], "hex"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(parts[3], "hex")), decipher.final()]);
  return decrypted.toString("utf8");
}
