import { describe, expect, it } from "vitest";
import { CURRENT_KEY_VERSION, decryptString, encryptString, inspectCipherVersion } from "@/lib/crypto";
import { decodeVaultSecret, encodeVaultSecret } from "@/lib/secret-payload";

describe("vault crypto", () => {
  it("round-trips a secret with a versioned ciphertext", () => {
    const cipher = encryptString("super-secret");
    expect(cipher.startsWith(`v${CURRENT_KEY_VERSION}:`)).toBe(true);
    expect(inspectCipherVersion(cipher)).toBe(CURRENT_KEY_VERSION);
    expect(decryptString(cipher)).toBe("super-secret");
  });

  it("still decrypts legacy iv:tag:data payloads", () => {
    const modern = encryptString("legacy-value");
    const withoutPrefix = modern.replace(/^v\d+:/, "");
    expect(withoutPrefix.split(":").length).toBe(3);
    expect(decryptString(withoutPrefix)).toBe("legacy-value");
  });

  it("encodes extra vault fields without exposing them as separate columns", () => {
    const encoded = encodeVaultSecret({ password: "p", url: "https://example.com", notes: "rotación" });
    const decoded = decodeVaultSecret(encoded);
    expect(decoded.password).toBe("p");
    expect(decoded.url).toBe("https://example.com");
    expect(decodeVaultSecret("plain-password")).toEqual({ password: "plain-password", url: null, notes: null });
  });
});
