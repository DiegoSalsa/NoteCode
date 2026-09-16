import { describe, expect, it } from "vitest";
import { decryptSeoToken, encryptSeoToken } from "@/lib/seo/crypto";
import { toPublicConnection } from "@/lib/seo/public";

describe("seo token crypto", () => {
  it("round-trips an access token without storing plaintext", () => {
    const cipher = encryptSeoToken("ya29.secret-access-token");
    expect(cipher.startsWith("v1:")).toBe(true);
    expect(cipher.includes("ya29")).toBe(false);
    expect(decryptSeoToken(cipher)).toBe("ya29.secret-access-token");
  });

  it("never exposes ciphertext fields on the public connection DTO", () => {
    const connection = {
      id: "c1",
      googleAccountEmail: "ops@purocode.com",
      googleAccountId: "123",
      scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
      accessTokenEncrypted: "v1:iv:tag:cipher",
      refreshTokenEncrypted: "v1:iv:tag:refresh",
      tokenExpiresAt: new Date("2026-09-15T00:00:00.000Z"),
      tokenType: "Bearer",
      status: "connected",
      lastError: null,
      lastDiscoveredAt: null,
      connectedByUserId: "u1",
      createdAt: new Date("2026-09-15T00:00:00.000Z"),
      updatedAt: new Date("2026-09-15T00:00:00.000Z"),
      disconnectedAt: null,
    };

    const publicConnection = toPublicConnection(connection);
    expect(publicConnection).not.toBeNull();
    expect(JSON.stringify(publicConnection)).not.toContain("accessTokenEncrypted");
    expect(JSON.stringify(publicConnection)).not.toContain("refreshTokenEncrypted");
    expect(JSON.stringify(publicConnection)).not.toContain("v1:iv:tag");
    expect(publicConnection?.hasRefreshToken).toBe(true);
    expect(publicConnection?.googleAccountEmail).toBe("ops@purocode.com");
  });
});
