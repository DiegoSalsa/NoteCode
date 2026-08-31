import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
export const CURRENT_KEY_VERSION = Number(process.env.ENCRYPTION_KEY_VERSION || "1") || 1;

function keyFromEnv(value: string | undefined, name: string) {
  if (!value) {
    throw new Error(`${name} is required to encrypt and decrypt credentials.`);
  }

  const keyBuffer = Buffer.from(value, "utf8");
  if (keyBuffer.byteLength !== KEY_LENGTH) {
    throw new Error(`${name} must be exactly 32 bytes for AES-256-GCM.`);
  }

  return keyBuffer;
}

function getEncryptionKey(version = CURRENT_KEY_VERSION) {
  if (version === CURRENT_KEY_VERSION) {
    return keyFromEnv(process.env.ENCRYPTION_KEY, "ENCRYPTION_KEY");
  }

  if (process.env.ENCRYPTION_KEY_PREVIOUS) {
    return keyFromEnv(process.env.ENCRYPTION_KEY_PREVIOUS, "ENCRYPTION_KEY_PREVIOUS");
  }

  return keyFromEnv(process.env.ENCRYPTION_KEY, "ENCRYPTION_KEY");
}

function parseCiphertext(encryptedText: string) {
  const parts = encryptedText.split(":");
  if (parts.length === 4 && /^v\d+$/i.test(parts[0])) {
    return {
      version: Number.parseInt(parts[0].slice(1), 10),
      ivHex: parts[1],
      authTagHex: parts[2],
      encryptedHex: parts[3],
    };
  }
  if (parts.length === 3) {
    return { version: CURRENT_KEY_VERSION, ivHex: parts[0], authTagHex: parts[1], encryptedHex: parts[2] };
  }
  throw new Error("Encrypted credential payload must use vN:iv:authTag:encryptedText format.");
}

export function encryptString(text: string, version = CURRENT_KEY_VERSION) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(version), iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(text, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `v${version}:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptString(encryptedText: string) {
  const parsed = parseCiphertext(encryptedText);
  const versions = [parsed.version, CURRENT_KEY_VERSION, 1].filter((value, index, all) => all.indexOf(value) === index);

  let lastError: unknown = null;
  for (const version of versions) {
    try {
      const decipher = createDecipheriv(
        ALGORITHM,
        getEncryptionKey(version),
        Buffer.from(parsed.ivHex, "hex"),
        { authTagLength: AUTH_TAG_LENGTH },
      );
      decipher.setAuthTag(Buffer.from(parsed.authTagHex, "hex"));
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(parsed.encryptedHex, "hex")),
        decipher.final(),
      ]);
      return decrypted.toString("utf8");
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unable to decrypt credential payload.");
}

export function inspectCipherVersion(encryptedText: string) {
  return parseCiphertext(encryptedText).version;
}
