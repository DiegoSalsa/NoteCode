export type VaultSecretPayload = {
  password: string;
  url?: string | null;
  notes?: string | null;
};

export function encodeVaultSecret(payload: VaultSecretPayload) {
  return JSON.stringify({
    password: payload.password,
    url: payload.url || null,
    notes: payload.notes || null,
  });
}

export function decodeVaultSecret(raw: string): VaultSecretPayload {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed) as Partial<VaultSecretPayload>;
      if (typeof parsed.password === "string") {
        return {
          password: parsed.password,
          url: typeof parsed.url === "string" ? parsed.url : null,
          notes: typeof parsed.notes === "string" ? parsed.notes : null,
        };
      }
    } catch {
      // Legacy ciphertext stored a raw password that happens to look like JSON.
    }
  }
  return { password: raw, url: null, notes: null };
}
